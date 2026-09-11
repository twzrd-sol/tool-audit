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

    // Check 1: Transport Security (HTTPS vs Plaintext HTTP)
    if (tool.url.startsWith('http://')) {
      findings.push({
        code: 'INSECURE_TRANSPORT',
        severity: 'CRITICAL',
        category: 'TRANSPORT_SECURITY',
        title: 'Plaintext HTTP Endpoint',
        description: `Endpoint ${tool.url} communicates over unencrypted HTTP, exposing agent traffic and tokens to MITM inspection.`,
        recommendation: 'Refuse execution until the provider migrates to HTTPS (TLS 1.3 preferred).'
      });
      penaltyScore += 50;
    }

    // Check 2: Credential & Auth Hygiene in URL/Query
    const sensitiveQueryParams = ['key', 'token', 'secret', 'auth', 'password', 'bearer', 'apikey', 'api_key'];
    const urlLower = tool.url.toLowerCase();
    for (const param of sensitiveQueryParams) {
      if (urlLower.includes(`?${param}=`) || urlLower.includes(`&${param}=`)) {
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
      for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
        const propLower = propName.toLowerCase();
        if (sensitiveQueryParams.includes(propLower) && tool.method === 'GET') {
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
    let estimatedCost = tool.pricing.baseFeeUsd;
    if (tool.pricing.model === 'per-result') {
      const hasLimitProp = Boolean(
        tool.inputSchema?.properties?.limit ||
        tool.inputSchema?.properties?.max_results ||
        tool.inputSchema?.properties?.count
      );

      if (!hasLimitProp) {
        findings.push({
          code: 'UNBOUNDED_RESULT_BILLING',
          severity: 'HIGH',
          category: 'ECONOMIC_SAFETY',
          title: 'Unbounded Per-Result Multiplier',
          description: `Pricing model is 'per-result' ($${tool.pricing.unitFeeUsd}/item), but the schema does not enforce a maximum result cap ('limit' or 'max_results'). A runaway query could drain the agent wallet.`,
          recommendation: 'Enforce client-side limit parameter or mandate hard budget ceilings in execution wrapper.'
        });
        penaltyScore += 25;
        estimatedCost += (tool.pricing.unitFeeUsd ?? 0.01) * 100; // project 100 results risk
      } else {
        estimatedCost += (tool.pricing.unitFeeUsd ?? 0.01) * 10; // project standard 10 results
      }
    }

    // Check 4: Price Ceiling Policy Breach
    if (tool.pricing.baseFeeUsd > this.policy.maxPricePerCallUsd) {
      findings.push({
        code: 'PRICE_CEILING_BREACH',
        severity: 'CRITICAL',
        category: 'ECONOMIC_SAFETY',
        title: `Base Fee ($${tool.pricing.baseFeeUsd}) Exceeds Spend Ceiling ($${this.policy.maxPricePerCallUsd})`,
        description: `Tool base execution cost of $${tool.pricing.baseFeeUsd} exceeds the pre-approved organizational threshold of $${this.policy.maxPricePerCallUsd}.`,
        recommendation: 'Requires operator override or budget policy elevation before execution.'
      });
      penaltyScore += 40;
    }

    // Check 5: Contract Honesty & Schema Discipline
    if (!tool.inputSchema || !tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0) {
      findings.push({
        code: 'EMPTY_INPUT_SCHEMA',
        severity: 'MEDIUM',
        category: 'CONTRACT_HONESTY',
        title: 'Unspecified Input Schema',
        description: 'Endpoint accepts unstructured inputs without parameter validation, risking runtime failures or hallucinated argument parsing.',
        recommendation: 'Demand structured JSON schema with explicit types and required property definitions.'
      });
      penaltyScore += 15;
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
      vendorRiskReplaced: {
        incumbentProcess: 'Enterprise Vendor Risk Assessment (SOC2 SIG / 180-Question Spreadsheet)',
        incumbentTurnaround: '14 - 21 business days',
        incumbentCost: '$15,000 - $35,000 / year (OneTrust, Vanta Vendor Risk, Loopio)',
        toolAuditTurnaround: '< 20ms',
        toolAuditCost: '$0.00 (Self-Hosted / Open-Source)',
        savingsPct: '100% time reduction, >99.9% cost reduction'
      },
      timestamp,
      auditHash
    };
  }
}
