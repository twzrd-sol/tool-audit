/**
 * Paid counterparty screen across a deduplicated cohort.
 *
 * The plan comes from `counterparty.ts`, so each paid call targets a host that
 * actually answers rather than a brand that merely appears in a listing. The
 * budget is enforced before every call against the live inspected price, not
 * against a price remembered from planning time.
 *
 * Failure is recorded as failure. A host that could not be screened is
 * reported unscreened; it is never folded into a passing count.
 */
import type { CounterpartyPlan, CounterpartyTarget } from './counterparty.js';
import { getProviderHttpStatus, getUsdCost, isSuccessfulUsdReceipt } from './receipt.js';
import type { MonidEndpoint, MonidRun } from './types.js';

export const COHORT_SCREEN_SCHEMA = 'tool-audit.counterparty-screen.v1' as const;
export const HEADER_CHECK_TOOL = 'api.strale.io:/x402/header-security-check';

export class CohortBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CohortBudgetError';
  }
}

export interface CohortScreenResult {
  host: string;
  brands: string[];
  fronted: boolean;
  /** The exact URL submitted to the header check. Evidence must say what was measured. */
  screenedUrl?: string;
  outcome: 'screened' | 'failed';
  runId?: string;
  costUsd?: number;
  providerHttpStatus?: number;
  grade?: string;
  score?: number;
  missingHeaders?: string[];
  error?: string;
}

export interface CohortScreenReport {
  schema: typeof COHORT_SCREEN_SCHEMA;
  screenedAt: string;
  tool: string;
  unitPriceUsd: number;
  maxTotalUsd: number;
  attempted: number;
  screened: number;
  failed: number;
  spentUsd: number;
  /** Brands covered by the screened hosts, including deduplicated ones. */
  brandsCovered: number;
  gradeDistribution: Record<string, number>;
  results: CohortScreenResult[];
  unscreenable: CounterpartyPlan['unscreenable'];
  limitation: string;
}

export const COHORT_LIMITATION =
  'Security-header evidence describes the HTTP response of one host at one moment. It is not a judgement of the vendor, its data quality, or its trustworthiness, and a passing grade is not an approval to spend.';

interface CohortClient {
  inspect(toolId: string): Promise<MonidEndpoint | null>;
  run(
    toolId: string,
    input: Record<string, unknown>,
    options?: { wait?: boolean; timeoutMs?: number; pollMs?: number }
  ): Promise<MonidRun>;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function summarize(run: MonidRun): Pick<CohortScreenResult, 'grade' | 'score' | 'missingHeaders'> {
  const output = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, unknown>;
  const grade = typeof output.grade === 'string' ? output.grade : undefined;
  const score = typeof output.score === 'number' ? output.score : undefined;
  // The header tool names this field `missing`, and fills it with objects of
  // the shape { header, severity, recommendation } rather than strings. The
  // 2026-09-15 run read `missingHeaders` and then kept only strings, so it
  // retained nothing for any host and its grades could not be re-derived.
  // Both names and both shapes are handled now.
  const rawMissing = Array.isArray(output.missing)
    ? output.missing
    : Array.isArray(output.missingHeaders)
      ? output.missingHeaders
      : undefined;
  const missing = rawMissing
    ?.map(h => {
      if (typeof h === 'string') return h;
      if (h && typeof h === 'object' && typeof (h as { header?: unknown }).header === 'string') {
        return (h as { header: string }).header;
      }
      return undefined;
    })
    .filter((h): h is string => typeof h === 'string');
  return {
    ...(grade === undefined ? {} : { grade }),
    ...(score === undefined ? {} : { score }),
    ...(missing === undefined ? {} : { missingHeaders: missing })
  };
}

export async function runCohortScreen(
  client: CohortClient,
  plan: CounterpartyPlan,
  options: {
    confirmSpend: boolean;
    maxTotalUsd: number;
    limit?: number;
    onProgress?: (msg: string) => void;
  }
): Promise<CohortScreenReport> {
  if (!options.confirmSpend) {
    throw new CohortBudgetError('Cohort screen makes paid Monid calls. Re-run with --confirm-spend.');
  }
  // An unusable ceiling is not an absent ceiling. NaN compares false against
  // every `>` below, which would silently disable both the upfront refusal and
  // the per-call guard, so it is rejected before anything is inspected.
  if (!Number.isFinite(options.maxTotalUsd) || options.maxTotalUsd <= 0) {
    throw new CohortBudgetError(
      `Refused before spending: maxTotalUsd must be a positive finite amount, received ${options.maxTotalUsd}.`
    );
  }
  const progress = options.onProgress ?? (() => {});

  // Price is re-read live. A plan built minutes ago is not a price lock.
  const endpoint = await client.inspect(HEADER_CHECK_TOOL);
  if (!endpoint) throw new CohortBudgetError(`${HEADER_CHECK_TOOL} could not be inspected.`);
  if (endpoint.pricing.model !== 'per-call' || endpoint.pricing.currency !== 'USD') {
    throw new CohortBudgetError(
      `${HEADER_CHECK_TOOL} is priced ${endpoint.pricing.rawType}/${endpoint.pricing.currency}; this screen requires PER_CALL USD.`
    );
  }
  const unitPriceUsd = endpoint.pricing.baseFeeUsd;
  if (!(unitPriceUsd >= 0)) throw new CohortBudgetError('Live inspect returned no usable USD unit price.');

  const targets: CounterpartyTarget[] = options.limit
    ? plan.targets.slice(0, options.limit)
    : plan.targets;

  const worstCase = round(targets.length * unitPriceUsd);
  if (worstCase > options.maxTotalUsd) {
    throw new CohortBudgetError(
      `Refused before spending: ${targets.length} targets at $${unitPriceUsd} is $${worstCase}, over the $${options.maxTotalUsd} ceiling.`
    );
  }

  const results: CohortScreenResult[] = [];
  let spent = 0;

  for (const target of targets) {
    // Re-check the ceiling against money actually spent, before each call.
    if (round(spent + unitPriceUsd) > options.maxTotalUsd) {
      progress(`stopping before ${target.host}: next call would exceed the ceiling`);
      break;
    }
    const base: Pick<CohortScreenResult, 'host' | 'brands' | 'fronted' | 'screenedUrl'> = {
      host: target.host,
      brands: target.brands,
      fronted: target.fronted,
      screenedUrl: `https://${target.host}`
    };
    try {
      const screenedUrl = `https://${target.host}`;
      const run = await client.run(
        HEADER_CHECK_TOOL,
        { queryParams: { url: screenedUrl } },
        { wait: true }
      );
      const costUsd = getUsdCost(run);
      if (costUsd !== undefined) spent = round(spent + costUsd);

      if (!isSuccessfulUsdReceipt(run)) {
        results.push({
          ...base,
          outcome: 'failed',
          runId: run.runId,
          ...(costUsd === undefined ? {} : { costUsd }),
          ...(getProviderHttpStatus(run) === undefined ? {} : { providerHttpStatus: getProviderHttpStatus(run)! }),
          error: `${run.status}${run.reason ? `: ${run.reason}` : ''}`
        });
        progress(`${target.host} → failed (${run.status})`);
        continue;
      }
      const summary = summarize(run);
      results.push({
        ...base,
        outcome: 'screened',
        runId: run.runId,
        costUsd: costUsd!,
        providerHttpStatus: getProviderHttpStatus(run)!,
        ...summary
      });
      progress(`${target.host} → ${summary.grade ?? '?'} (spent $${spent.toFixed(4)})`);
    } catch (error) {
      results.push({
        ...base,
        outcome: 'failed',
        error: error instanceof Error ? error.message : 'unknown failure'
      });
      progress(`${target.host} → failed (${error instanceof Error ? error.message : 'unknown'})`);
    }
  }

  const screened = results.filter(r => r.outcome === 'screened');
  const gradeDistribution: Record<string, number> = {};
  for (const r of screened) {
    const key = r.grade ?? 'ungraded';
    gradeDistribution[key] = (gradeDistribution[key] || 0) + 1;
  }

  return {
    schema: COHORT_SCREEN_SCHEMA,
    screenedAt: new Date().toISOString(),
    tool: HEADER_CHECK_TOOL,
    unitPriceUsd,
    maxTotalUsd: options.maxTotalUsd,
    attempted: results.length,
    screened: screened.length,
    failed: results.filter(r => r.outcome === 'failed').length,
    spentUsd: round(spent),
    brandsCovered: screened.reduce((n, r) => n + r.brands.length, 0),
    gradeDistribution,
    results,
    unscreenable: plan.unscreenable,
    limitation: COHORT_LIMITATION
  };
}
