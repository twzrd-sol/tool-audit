/**
 * Counterparty provenance for a Monid endpoint.
 *
 * tool-audit v1 asked what a call costs. That is the cheap question. Before an
 * agent spends, the harder question is who it is actually paying: a discovery
 * result asserts a brand through `providerName` and may carry Monid's
 * `verified` tag, but neither field names the operator behind the endpoint.
 *
 * The closest thing to an operator signal Monid publishes per endpoint is `docUrl`.
 * It names who documents the endpoint, which is evidence about, not proof of, who
 * operates it. This module
 * compares the host documenting the endpoint against the brand the listing
 * asserts, and reports the mismatch as evidence.
 *
 * Limits, stated up front and never softened by this module:
 *  - A doc host is evidence about who documents an endpoint. It is not proof of
 *    who operates it, who receives payment, or who holds the underlying data.
 *  - A matching doc host does NOT establish first-party operation. It only
 *    means this particular signal raised no mismatch.
 *  - Corporate relatives (a parent's developer portal, an enterprise arm) can
 *    produce an honest mismatch. A mismatch is a prompt to look, not a verdict.
 *
 * Nothing here converts an unknown into an approval.
 */

export type ProvenanceClass =
  | 'first_party_doc_host'
  | 'third_party_doc_host'
  | 'undocumented';

export type ProvenanceSeverity = 'info' | 'review' | 'attention';

export interface ProvenanceFinding {
  provider: string;
  providerName: string;
  endpoint?: string;
  classification: ProvenanceClass;
  docUrl?: string;
  docHost?: string;
  /** Registrable domain documenting the endpoint, when it is not the brand's. */
  frontedBy?: string;
  /** Monid's `verified` tag was present on the listing. */
  verifiedTag: boolean;
  severity: ProvenanceSeverity;
  reason: string;
  limitation: string;
}

export const PROVENANCE_LIMITATION =
  'UNABLE_TO_VERIFY_OPERATOR: docUrl identifies who documents this endpoint, not who operates it, receives payment, or holds the data. A matching host is not proof of first-party operation.';

/** Public suffixes that need three labels to reach a registrable domain. */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.jp', 'or.jp', 'ne.jp',
  'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.cn', 'com.mx',
  'co.in', 'co.za', 'co.kr', 'com.sg', 'com.tr', 'com.hk'
]);

/** Subdomain labels that are documentation/API prefixes, not brand identity. */
const GENERIC_LABELS = new Set([
  'docs', 'doc', 'developer', 'developers', 'dev', 'api', 'apis',
  'platform', 'console', 'www', 'portal', 'help', 'support',
  'reference', 'guide', 'guides', 'learn'
]);

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/** Reduce a brand or domain to comparable alphanumerics. */
function brandToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Brand identity claimed by the listing, as comparable tokens. Both the slug
 * and the display name are used: `pdl` alone would never match
 * `peopledatalabs.com`, but the display name "People Data Labs" does.
 */
function claimedTokens(provider: string, providerName: string): string[] {
  const tokens = new Set<string>();
  for (const raw of [provider, providerName]) {
    if (!raw) continue;
    const token = brandToken(raw);
    if (token.length >= 3) tokens.add(token);
    // A slug that is itself a hostname claims its own registrable domain.
    if (raw.includes('.') && !raw.includes(' ')) {
      const reg = brandToken(registrableDomain(raw));
      if (reg.length >= 3) tokens.add(reg);
    }
  }
  return [...tokens];
}

/** Brand-bearing labels of the doc host, ignoring docs./api./www. prefixes. */
function docTokens(host: string): string[] {
  const reg = registrableDomain(host);
  const tokens = new Set<string>([brandToken(reg)]);
  // Drop the public suffix so "asksurf.ai" also offers "asksurf".
  const stem = reg.split('.').slice(0, -1).join('');
  if (stem.length >= 3) tokens.add(brandToken(stem));
  for (const label of host.toLowerCase().split('.')) {
    if (!GENERIC_LABELS.has(label) && label.length >= 3) tokens.add(brandToken(label));
  }
  return [...tokens];
}

function brandMatchesDocHost(provider: string, providerName: string, host: string): boolean {
  const claimed = claimedTokens(provider, providerName);
  const documented = docTokens(host);
  return claimed.some(c =>
    documented.some(d => d === c || d.includes(c) || c.includes(d))
  );
}

export interface ProvenanceInput {
  provider: string;
  providerName?: string;
  endpoint?: string;
  docUrl?: string;
  tags?: string[];
}

export function checkProvenance(input: ProvenanceInput): ProvenanceFinding {
  const provider = input.provider;
  const providerName = input.providerName || provider;
  const verifiedTag = (input.tags || []).includes('verified');
  const base = {
    provider,
    providerName,
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    verifiedTag,
    limitation: PROVENANCE_LIMITATION
  };

  const docUrl = (input.docUrl || '').trim();
  if (!docUrl) {
    return {
      ...base,
      classification: 'undocumented',
      severity: verifiedTag ? 'attention' : 'review',
      reason: verifiedTag
        ? `${providerName} publishes no documentation URL, yet carries the "verified" tag. No operator can be identified from the listing.`
        : `${providerName} publishes no documentation URL. No operator can be identified from the listing.`
    };
  }

  let host: string;
  try {
    const parsed = new URL(docUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('non-web');
    host = parsed.hostname;
  } catch {
    return {
      ...base,
      docUrl,
      classification: 'undocumented',
      severity: verifiedTag ? 'attention' : 'review',
      reason: `${providerName} publishes a documentation URL that is not a usable web address, so no operator can be identified.`
    };
  }

  if (brandMatchesDocHost(provider, providerName, host)) {
    return {
      ...base,
      docUrl,
      docHost: host,
      classification: 'first_party_doc_host',
      severity: 'info',
      reason: `${providerName} documents this endpoint on its own host (${host}). This signal raised no mismatch; it does not by itself establish first-party operation.`
    };
  }

  const frontedBy = registrableDomain(host);
  return {
    ...base,
    docUrl,
    docHost: host,
    frontedBy,
    classification: 'third_party_doc_host',
    severity: verifiedTag ? 'attention' : 'review',
    reason: verifiedTag
      ? `Listing asserts the brand "${providerName}" and carries the "verified" tag, but the endpoint is documented at ${frontedBy}. An agent selecting on name and tag alone would not learn that ${frontedBy} is the documenting party.`
      : `Listing asserts the brand "${providerName}", but the endpoint is documented at ${frontedBy}.`
  };
}

export interface ProvenanceSummary {
  total: number;
  firstPartyDocHost: number;
  thirdPartyDocHost: number;
  undocumented: number;
  /** Non-first-party listings that nevertheless carry the `verified` tag. */
  verifiedButNotFirstParty: number;
  /** Registrable domains fronting brands, most frequent first. */
  fronts: Array<{ domain: string; count: number; brands: string[] }>;
  findings: ProvenanceFinding[];
  limitation: string;
}

export function summarizeProvenance(findings: ProvenanceFinding[]): ProvenanceSummary {
  const fronts = new Map<string, string[]>();
  for (const f of findings) {
    if (f.classification === 'third_party_doc_host' && f.frontedBy) {
      const brands = fronts.get(f.frontedBy) || [];
      brands.push(f.providerName);
      fronts.set(f.frontedBy, brands);
    }
  }
  return {
    total: findings.length,
    firstPartyDocHost: findings.filter(f => f.classification === 'first_party_doc_host').length,
    thirdPartyDocHost: findings.filter(f => f.classification === 'third_party_doc_host').length,
    undocumented: findings.filter(f => f.classification === 'undocumented').length,
    verifiedButNotFirstParty: findings.filter(
      f => f.verifiedTag && f.classification !== 'first_party_doc_host'
    ).length,
    fronts: [...fronts.entries()]
      .map(([domain, brands]) => ({ domain, count: brands.length, brands: brands.sort() }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain)),
    findings,
    limitation: PROVENANCE_LIMITATION
  };
}
