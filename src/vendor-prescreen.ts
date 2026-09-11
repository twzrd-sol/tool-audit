import { ToolAuditor } from './auditor.js';
import { MonidClient } from './monid.js';
import { describeReceipt, getProviderHttpStatus, getUsdCost, isSuccessfulUsdReceipt } from './receipt.js';
import type {
  AuditPolicy,
  MonidEndpoint,
  MonidRun,
  PrescreenRunReceipt,
  VendorPrescreenReport
} from './types.js';

interface PrescreenClient {
  discover(query: string, limit?: number): Promise<MonidEndpoint[]>;
  inspect(toolId: string): Promise<MonidEndpoint | null>;
  run(
    toolId: string,
    input: Record<string, unknown>,
    options?: { wait?: boolean; timeoutMs?: number; pollMs?: number }
  ): Promise<MonidRun>;
}

interface RequiredTool {
  purpose: PrescreenRunReceipt['purpose'];
  query: string;
  id: string;
}

const REQUIRED_TOOLS: RequiredTool[] = [
  {
    purpose: 'incumbent_price',
    query: 'extract web page content',
    id: 'context.dev:/web/scrape/markdown'
  },
  {
    purpose: 'security_headers',
    query: 'website security headers',
    id: 'api.strale.io:/x402/header-security-check'
  },
  {
    purpose: 'cookie_consent',
    query: 'website cookie consent scan',
    id: 'api.strale.io:/x402/v2/cookie-scan'
  }
];

export const COOKIE_UNCERTAINTY_LIMITATION =
  'UNABLE_TO_VERIFY: only partial HTML was analyzed and JavaScript-set cookies were not observed.';

export class PrescreenRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrescreenRefusalError';
  }
}

function withCookieUncertainty(issues: string[]): string[] {
  if (issues.some(issue => /unable_to_verify|javascript-set cookies|partial HTML/i.test(issue))) {
    return issues;
  }
  return [...issues, COOKIE_UNCERTAINTY_LIMITATION];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function requireCredentialFreeHttpsUrl(value: string, label: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new PrescreenRefusalError(`${label} must use HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new PrescreenRefusalError(`${label} must not contain embedded credentials.`);
  }
  return parsed;
}

function assertSuccessfulRun(run: MonidRun, purpose: string): void {
  if (!isSuccessfulUsdReceipt(run)) {
    throw new PrescreenRefusalError(
      `${purpose} run ${run.runId} ended with ${describeReceipt(run)} and no usable USD cost receipt.`
    );
  }
}

function receipt(purpose: RequiredTool['purpose'], run: MonidRun): PrescreenRunReceipt {
  const costUsd = getUsdCost(run);
  const providerHttpStatus = getProviderHttpStatus(run);
  if (costUsd === undefined || providerHttpStatus === undefined) {
    throw new PrescreenRefusalError(`${purpose} run ${run.runId} omitted a usable USD receipt.`);
  }
  return {
    purpose,
    runId: run.runId,
    provider: run.provider,
    endpoint: run.endpoint,
    status: run.status,
    costUsd,
    currency: 'USD',
    providerHttpStatus
  };
}

async function discoverInspectAndAuditRequiredTools(
  client: PrescreenClient,
  auditor: ToolAuditor
): Promise<Map<RequiredTool['purpose'], MonidEndpoint>> {
  const inspected = new Map<RequiredTool['purpose'], MonidEndpoint>();

  for (const required of REQUIRED_TOOLS) {
    const discovered = await client.discover(required.query, 20);
    if (!discovered.some(candidate => candidate.id === required.id)) {
      throw new PrescreenRefusalError(
        `Required endpoint ${required.id} was not returned by live Monid discovery.`
      );
    }

    const endpoint = await client.inspect(required.id);
    if (!endpoint) {
      throw new PrescreenRefusalError(`Required endpoint ${required.id} could not be inspected.`);
    }
    if (endpoint.id !== required.id) {
      throw new PrescreenRefusalError(
        `Inspect identity mismatch: requested ${required.id}, received ${endpoint.id}.`
      );
    }
    if (
      endpoint.pricing.model !== 'per-call' ||
      endpoint.pricing.rawType !== 'PER_CALL' ||
      endpoint.pricing.currency !== 'USD' ||
      !Number.isFinite(endpoint.pricing.baseFeeUsd) ||
      endpoint.pricing.baseFeeUsd < 0
    ) {
      throw new PrescreenRefusalError(
        `Required endpoint ${required.id} must remain bounded PER_CALL/USD pricing.`
      );
    }
    const verdict = auditor.audit(endpoint);
    if (verdict.status === 'BLOCKED') {
      throw new PrescreenRefusalError(
        `Required endpoint ${required.id} failed pre-spend policy: ${verdict.findings
          .map(finding => finding.code)
          .join(', ')}.`
      );
    }
    inspected.set(required.purpose, endpoint);
  }

  return inspected;
}

export interface VendorPrescreenOptions {
  confirmSpend: true;
  maxTotalUsd?: number;
  policy?: Partial<AuditPolicy>;
  incumbentPricingUrl?: string;
}

/**
 * Build one first-pass vendor pre-screen from three live Monid calls.
 *
 * This intentionally requires confirmSpend: true. Discovery, inspection and
 * policy evaluation all finish before the first paid call, and the sum of
 * advertised per-call prices must fit maxTotalUsd.
 */
export async function runVendorPrescreen(
  targetUrl: string,
  options: VendorPrescreenOptions,
  client: PrescreenClient = new MonidClient()
): Promise<VendorPrescreenReport> {
  if (!options || options.confirmSpend !== true) {
    throw new PrescreenRefusalError('Paid vendor pre-screen requires confirmSpend: true.');
  }

  const parsedTarget = requireCredentialFreeHttpsUrl(targetUrl, 'Vendor pre-screen target');
  const incumbentPricingUrl = options.incumbentPricingUrl || 'https://vendorapp.co/pricing';
  const parsedPricingUrl = requireCredentialFreeHttpsUrl(
    incumbentPricingUrl,
    'Incumbent pricing evidence'
  );
  const normalizedTargetUrl = parsedTarget.toString();
  const normalizedPricingUrl = parsedPricingUrl.toString();

  const maxTotalUsd = options.maxTotalUsd ?? 0.24;
  if (!Number.isFinite(maxTotalUsd) || maxTotalUsd <= 0) {
    throw new PrescreenRefusalError('maxTotalUsd must be a positive finite amount.');
  }

  const auditor = new ToolAuditor({
    maxPricePerCallUsd: 0.18,
    ...options.policy
  });
  const endpoints = await discoverInspectAndAuditRequiredTools(client, auditor);
  const advertisedTotal = [...endpoints.values()].reduce(
    (sum, endpoint) => sum + endpoint.pricing.baseFeeUsd,
    0
  );
  if (!Number.isFinite(advertisedTotal) || advertisedTotal > maxTotalUsd) {
    throw new PrescreenRefusalError(
      `Advertised Monid cost $${advertisedTotal.toFixed(4)} exceeds the $${maxTotalUsd.toFixed(4)} advertised-price ceiling.`
    );
  }

  const priceRun = await client.run(
    endpoints.get('incumbent_price')!.id,
    {
      queryParams: {
        url: normalizedPricingUrl,
        includeLinks: false,
        includeImages: false,
        useMainContentOnly: true,
        maxAgeMs: 0
      }
    }
  );
  assertSuccessfulRun(priceRun, 'Incumbent pricing');

  const priceOutput = asRecord(priceRun.output);
  const markdown = typeof priceOutput.markdown === 'string' ? priceOutput.markdown : '';
  const priceVerified =
    /\$\s*149\s*\/?\s*month/i.test(markdown) &&
    /200\s+AI\s+pre-screens/i.test(markdown);
  if (!priceVerified) {
    throw new PrescreenRefusalError(
      `Live pricing run ${priceRun.runId} did not confirm Vendorapp Startup at $149/month with 200 AI pre-screens.`
    );
  }

  const headerRun = await client.run(
    endpoints.get('security_headers')!.id,
    { queryParams: { url: normalizedTargetUrl } }
  );
  assertSuccessfulRun(headerRun, 'Security header');

  const cookieRun = await client.run(
    endpoints.get('cookie_consent')!.id,
    { queryParams: { url: normalizedTargetUrl } }
  );
  assertSuccessfulRun(cookieRun, 'Cookie consent');

  const headerOutput = asRecord(headerRun.output);
  const cookieOutput = asRecord(cookieRun.output);
  const missingSecurityHeaders = Array.isArray(headerOutput.missing)
    ? headerOutput.missing
    : [];
  const headerPotentialIssues = Array.isArray(headerOutput.missing)
    ? []
    : ['Security-header result omitted its missing-header evidence.'];
  const parsedCookieIssues = Array.isArray(cookieOutput.potential_issues)
    ? cookieOutput.potential_issues.filter((item): item is string => typeof item === 'string')
    : [];
  const cookiePotentialIssues = withCookieUncertainty(
    parsedCookieIssues.length > 0
      ? parsedCookieIssues
      : ['Cookie scan returned no limitation details; absence of reported issues is not approval.']
  );
  const receipts = [
    receipt('incumbent_price', priceRun),
    receipt('security_headers', headerRun),
    receipt('cookie_consent', cookieRun)
  ];
  const measuredCostUsd = Number(
    receipts.reduce((sum, item) => sum + item.costUsd, 0).toFixed(6)
  );

  return {
    schema: 'tool-audit.vendor-prescreen.v1',
    targetUrl: normalizedTargetUrl,
    incumbent: {
      name: 'Vendorapp Startup',
      pricingUrl: normalizedPricingUrl,
      monthlyPriceUsd: 149,
      includedPrescreens: 200,
      freeTierPrescreens: 15,
      verifiedFromLivePage: true
    },
    verdict: 'review_required',
    findings: {
      missingSecurityHeaders,
      headerPotentialIssues,
      cookiePotentialIssues
    },
    receipts,
    measuredCostUsd,
    scope: {
      replaces: 'First-pass, before-spend vendor evidence collection.',
      doesNotReplace: [
        'Continuous monitoring and remediation',
        'Contract and vendor lifecycle management',
        'Human review for material or ambiguous risk'
      ]
    },
    generatedAt: new Date().toISOString()
  };
}
