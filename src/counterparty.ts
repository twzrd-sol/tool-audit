/**
 * Turn a provenance snapshot into the set of hosts actually worth paying to
 * screen.
 *
 * A naive cohort screen bills once per listed brand. That is wrong twice over
 * when brands share a counterparty: it pays N times for one host, and for a
 * fronted listing it measures the brand's own website rather than the party
 * that will answer the call. Provenance is free, so resolving the counterparty
 * first both corrects the target and reduces the bill.
 *
 * Undocumented listings are not screened and not approved. They are reported
 * as unscreenable, because there is no host to point evidence at.
 */
import { registrableDomain, type ProvenanceFinding } from './provenance.js';

export const COUNTERPARTY_PLAN_SCHEMA = 'tool-audit.counterparty-plan.v1' as const;

export interface CounterpartyTarget {
  /** Registrable domain that will answer, and therefore the screening target. */
  host: string;
  /** Listings that resolve to this counterparty. */
  brands: string[];
  /** True when at least one brand differs from the host it resolves to. */
  fronted: boolean;
}

export interface UnscreenableListing {
  provider: string;
  providerName: string;
  reason: string;
}

export interface CounterpartyPlan {
  schema: typeof COUNTERPARTY_PLAN_SCHEMA;
  targets: CounterpartyTarget[];
  unscreenable: UnscreenableListing[];
  listedBrands: number;
  distinctCounterparties: number;
  /** Screens avoided by deduplicating brands onto shared counterparties. */
  screensAvoided: number;
  unitPriceUsd: number;
  naiveCostUsd: number;
  dedupedCostUsd: number;
  savedUsd: number;
  note: string;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function planCounterpartyScreen(
  findings: ProvenanceFinding[],
  unitPriceUsd: number
): CounterpartyPlan {
  if (!Number.isFinite(unitPriceUsd) || unitPriceUsd < 0) {
    throw new Error('unitPriceUsd must be a non-negative finite number.');
  }

  const byHost = new Map<string, { brands: Set<string>; fronted: boolean }>();
  const unscreenable: UnscreenableListing[] = [];

  for (const finding of findings) {
    if (finding.classification === 'undocumented' || !finding.docHost) {
      unscreenable.push({
        provider: finding.provider,
        providerName: finding.providerName,
        reason:
          'No documentation host is published, so no counterparty can be named. Not screened and not approved.'
      });
      continue;
    }
    const host = registrableDomain(finding.docHost);
    const entry = byHost.get(host) || { brands: new Set<string>(), fronted: false };
    entry.brands.add(finding.providerName);
    if (finding.classification === 'third_party_doc_host') entry.fronted = true;
    byHost.set(host, entry);
  }

  const targets: CounterpartyTarget[] = [...byHost.entries()]
    .map(([host, entry]) => ({
      host,
      brands: [...entry.brands].sort(),
      fronted: entry.fronted
    }))
    .sort((a, b) => b.brands.length - a.brands.length || a.host.localeCompare(b.host));

  const listedBrands = findings.length - unscreenable.length;
  const distinct = targets.length;
  const naive = round(listedBrands * unitPriceUsd);
  const deduped = round(distinct * unitPriceUsd);

  return {
    schema: COUNTERPARTY_PLAN_SCHEMA,
    targets,
    unscreenable,
    listedBrands,
    distinctCounterparties: distinct,
    screensAvoided: listedBrands - distinct,
    unitPriceUsd,
    naiveCostUsd: naive,
    dedupedCostUsd: deduped,
    savedUsd: round(naive - deduped),
    note:
      'Screening targets are the hosts the listings document, not the brands that are listed. Undocumented listings are excluded from the paid set and remain unevaluated, which is not the same as clean.'
  };
}
