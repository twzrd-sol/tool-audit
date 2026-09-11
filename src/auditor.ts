import { createHash } from 'node:crypto';
import type { MonidEndpoint, AuditPolicy, AuditFinding, AuditVerdict } from './types.js';

export const DEFAULT_AUDIT_POLICY: AuditPolicy = {
  maxPricePerCallUsd: 0.10, // $0.10 max per call unless overridden
  requireHttps: true,
  disallowQueryAuth: true,
  disallowUnboundedResults: true,
  enforceTypedSchema: true,
};

export class ToolAuditor {
  private policy: AuditPolicy;

  constructor(customPolicy: Partial<AuditPolicy> = {}) {
    this.policy = { ...DEFAULT_AUDIT_POLICY, ...customPolicy };
  }

  public audit(tool: MonidEndpoint): AuditVerdict {
    const findings: AuditFinding[] = [];
    let penaltyScore = 0;
    const supportedMethods = new Set(['GET', 'POST', 'PUT', 'DELETE']);

    if (!supportedMethods.has(String(tool.method))) {
      findings.push({
        code: 'UNSUPPORTED_HTTP_METHOD',
        severity: 'CRITICAL',
        category: 'CONTRACT_HONESTY',
        title: `Unsupported HTTP Method '${String(tool.method)}'`,
        description: 'The endpoint method is outside the audited contract surface.',
        recommendation: 'Refuse execution until the method is explicitly supported and tested.'
      });
      penaltyScore += 50;
    }

    // Check 1: Transport Security (HTTPS vs Plaintext HTTP)
    if (this.policy.requireHttps && !tool.url.startsWith('https://')) {
      findings.push({
        code: 'INSECURE_TRANSPORT',
        severity: 'CRITICAL',
        category: 'TRANSPORT_SECURITY',
        title: 'Non-HTTPS Endpoint',
        description: `Endpoint ${tool.url} is not HTTPS, so transport confidentiality and integrity are not established.`,
        recommendation: 'Refuse execution until the provider migrates to HTTPS (TLS 1.3 preferred).'
      });
      penaltyScore += 50;
    }

    // Check 2: Credential & Auth Hygiene in URL/Query
    const sensitiveQueryParams = ['key', 'token', 'secret', 'auth', 'password', 'bearer', 'apikey', 'api_key'];
    const urlLower = tool.url.toLowerCase();
    for (const param of sensitiveQueryParams) {
      if (
        this.policy.disallowQueryAuth &&
        (urlLower.includes(`?${param}=`) || urlLower.includes(`&${param}=`))
      ) {
        findings.push({
          code: 'QUERY_AUTH_LEAKAGE',
          severity: 'HIGH',
          category: 'CREDENTIAL_HYGIENE',
          title: 'Authentication Token in Query Parameters',
          description: `Sensitive credential param '${param}' is passed in URL query string, causing credential leakage into proxy access logs, browser history, and referer headers.`,
          recommendation: 'Pass authorization tokens via HTTP Authorization or custom request headers.'
        });
        penaltyScore += 30;
        break;
      }
    }

    // Check query params in inputSchema
    if (tool.inputSchema?.properties) {
      for (const [propName] of Object.entries(tool.inputSchema.properties)) {
        const propLower = propName.toLowerCase();
        if (
          this.policy.disallowQueryAuth &&
          sensitiveQueryParams.includes(propLower) &&
          tool.method === 'GET'
        ) {
          findings.push({
            code: 'QUERY_CREDENTIAL_FIELD',
            severity: 'HIGH',
            category: 'CREDENTIAL_HYGIENE',
            title: `Client-Supplied Credential '${propName}' in GET Request`,
            description: `Tool parameter '${propName}' requests an API credential in a GET query shape.`,
            recommendation: 'Ensure agent never exposes root tenant secrets to third-party endpoints.'
          });
          penaltyScore += 25;
        }
      }
    }

    // Check 3: Economic Safety & Unbounded Multiplication
    const validBaseFee =
      Number.isFinite(tool.pricing.baseFeeUsd) &&
      tool.pricing.baseFeeUsd >= 0;
    let estimatedCost = validBaseFee ? tool.pricing.baseFeeUsd : 0;
    if (
      tool.pricing.model === 'unsupported' ||
      !validBaseFee
    ) {
      findings.push({
        code: 'UNSUPPORTED_PRICING_MODEL',
        severity: 'CRITICAL',
        category: 'ECONOMIC_SAFETY',
        title: `Unsupported Pricing Model '${tool.pricing.rawType}'`,
        description: 'The endpoint price cannot be reduced to a bounded per-call or per-result amount.',
        recommendation: 'Refuse execution until the pricing model has an explicit local budget policy.'
      });
      penaltyScore += 50;
    }

    if (tool.pricing.currency !== 'USD') {
      findings.push({
        code: 'UNSUPPORTED_CURRENCY',
        severity: 'CRITICAL',
        category: 'ECONOMIC_SAFETY',
        title: `Unsupported Currency '${tool.pricing.currency}'`,
        description: 'The local USD ceiling cannot safely compare a price denominated in another or missing currency.',
        recommendation: 'Refuse execution or convert through an explicitly trusted, freshness-bounded exchange rate.'
      });
      penaltyScore += 50;
    }

    if (tool.pricing.model === 'per-result') {
      const unitFee = tool.pricing.unitFeeUsd;
      const validUnitFee = Number.isFinite(unitFee) && (unitFee ?? -1) >= 0;
      if (!validUnitFee) {
        findings.push({
          code: 'INVALID_UNIT_FEE',
          severity: 'CRITICAL',
          category: 'ECONOMIC_SAFETY',
          title: 'Invalid Per-Result Unit Fee',
          description: `Per-result pricing supplied an invalid unit fee: ${String(unitFee)}.`,
          recommendation: 'Refuse execution until a finite, non-negative unit fee is inspected.'
        });
        penaltyScore += 50;
      }

      const limitNames = [
        'limit',
        'max_results',
        'maxResults',
        'maxItems',
        'resultsLimit',
        'count'
      ];
      const hardLimits = limitNames
        .map(name => tool.inputSchema?.properties?.[name]?.maximum)
        .filter((maximum): maximum is number =>
          Number.isFinite(maximum) && (maximum ?? 0) >= 0
        );

      if (hardLimits.length === 0 && this.policy.disallowUnboundedResults) {
        findings.push({
          code: 'UNBOUNDED_RESULT_BILLING',
          severity: 'CRITICAL',
          category: 'ECONOMIC_SAFETY',
          title: 'Unbounded Per-Result Multiplier',
          description: `Pricing is per-result, but no recognized result parameter has a finite JSON Schema maximum.`,
          recommendation: 'Require a server-validated hard maximum before estimating or authorizing spend.'
        });
        penaltyScore += 50;
      } else if (validUnitFee && hardLimits.length > 0) {
        estimatedCost += (unitFee ?? 0) * Math.max(...hardLimits);
      }
    }

    // Check 4: Price Ceiling Policy Breach
    if (estimatedCost > this.policy.maxPricePerCallUsd) {
      findings.push({
        code: 'PRICE_CEILING_BREACH',
        severity: 'CRITICAL',
        category: 'ECONOMIC_SAFETY',
        title: `Worst-Case Cost ($${estimatedCost}) Exceeds Spend Ceiling ($${this.policy.maxPricePerCallUsd})`,
        description: `The bounded worst-case execution cost exceeds the pre-approved organizational threshold.`,
        recommendation: 'Requires operator override or budget policy elevation before execution.'
      });
      penaltyScore += 40;
    }

    // Check 5: Contract Honesty & Schema Discipline
    if (
      this.policy.enforceTypedSchema &&
      (!tool.inputSchema ||
        !tool.inputSchema.properties ||
        Object.keys(tool.inputSchema.properties).length === 0)
    ) {
      findings.push({
        code: 'EMPTY_INPUT_SCHEMA',
        severity: 'CRITICAL',
        category: 'CONTRACT_HONESTY',
        title: 'Unspecified Input Schema',
        description: 'Endpoint accepts unstructured inputs without parameter validation, risking runtime failures or hallucinated argument parsing.',
        recommendation: 'Demand structured JSON schema with explicit types and required property definitions.'
      });
      penaltyScore += 50;
    } else if (this.policy.enforceTypedSchema && tool.inputSchema?.properties) {
      const untyped = Object.entries(tool.inputSchema.properties)
        .filter(([, definition]) => !definition?.type)
        .map(([name]) => name);
      if (untyped.length > 0) {
        findings.push({
          code: 'UNTYPED_INPUT_SCHEMA',
          severity: 'CRITICAL',
          category: 'CONTRACT_HONESTY',
          title: 'Untyped Input Parameters',
          description: `Parameters without a JSON Schema type: ${untyped.join(', ')}.`,
          recommendation: 'Refuse execution until every accepted parameter has an explicit type.'
        });
        penaltyScore += 50;
      }
    }

    // Check 6: Data Egress & Sensitive PII Targets
    const egressRiskKeywords = ['ssn', 'creditcard', 'cvv', 'raw_body', 'private_key', 'seed_phrase'];
    if (tool.inputSchema?.properties) {
      for (const [propName] of Object.entries(tool.inputSchema.properties)) {
        if (egressRiskKeywords.includes(propName.toLowerCase())) {
          findings.push({
            code: 'HIGH_RISK_EGRESS_PARAM',
            severity: 'CRITICAL',
            category: 'DATA_EGRESS',
            title: `High-Risk Data Egress Parameter '${propName}'`,
            description: `Tool schema accepts sensitive parameter '${propName}', creating an organizational compliance and data breach hazard.`,
            recommendation: 'Block autonomous transmission of regulated PII/financial credentials.'
          });
          penaltyScore += 50;
        }
      }
    }

    // Calculate final score (0 - 100)
    const score = Math.max(0, 100 - penaltyScore);

    // Determine status
    let status: 'APPROVED' | 'WARNED' | 'BLOCKED' = 'APPROVED';
    const hasCritical = findings.some(f => f.severity === 'CRITICAL');
    const hasHigh = findings.some(f => f.severity === 'HIGH');

    if (hasCritical || score < 50) {
      status = 'BLOCKED';
    } else if (hasHigh || score < 80) {
      status = 'WARNED';
    }

    const timestamp = new Date().toISOString();
    const auditHash = createHash('sha256')
      .update(`${tool.id}:${status}:${score}:${timestamp}`)
      .digest('hex');

    return {
      status,
      score,
      toolId: tool.id,
      toolName: tool.name,
      provider: tool.provider,
      pricing: tool.pricing,
      maxEstimatedCostUsd: Number(estimatedCost.toFixed(4)),
      findings,
      timestamp,
      auditHash
    };
  }
}
