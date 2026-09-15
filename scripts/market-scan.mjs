#!/usr/bin/env node
/**
 * Counts who already sells what, across the same seed queries the provenance
 * sweep uses. Discovery only, so it settles nothing.
 *
 * This exists to keep a commercial claim honest: pricing a SKU on "nobody
 * else sells this" requires the count to be reproducible rather than
 * remembered.
 */
import { writeFileSync } from 'node:fs';
import { MonidClient } from '../dist/monid.js';
import { CATALOG_SWEEP_QUERIES } from '../dist/catalog-provenance.js';

/**
 * Hits excluded after reading the listing. Recorded here rather than tuned out
 * of the patterns, so the exclusion is reviewable instead of invisible.
 */
const REVIEWED_EXCLUSIONS = {
  'weather-underground:/get_historical_airport':
    'Keyword match on station operator language. Historical airport weather, not endpoint provenance.'
};

const CATEGORIES = {
  text_extraction: {
    label: 'Text / document extraction',
    match: /markdown|scrape|extract text|page content|llm-ready|crawl|\bhtml\b|readme|documentation/i
  },
  counterparty_provenance: {
    label: 'Counterparty provenance (who operates this endpoint)',
    match: /provenance|counterparty|who operates|operator identity|fronting|reseller identity/i
  },
  domain_registration: {
    label: 'Domain registration (WHOIS) — adjacent, answers a different question',
    match: /whois|registrar|registrant|nameserver/i
  },
  security_posture: {
    label: 'Security posture of a host',
    match: /security header|hsts|content-security-policy|security best practices|ssl certificate/i
  }
};

const client = new MonidClient();
const endpoints = new Map();

for (const query of CATALOG_SWEEP_QUERIES) {
  const results = await client.discover(query, 40);
  for (const e of results) {
    endpoints.set(e.id, {
      id: e.id,
      provider: e.provider,
      description: e.description || '',
      // For PER_RESULT the meaningful figure is the per-result fee; the flat
      // fee is frequently 0 and would understate the floor to nothing.
      priceUsd: e.pricing.model === 'per-result'
        ? (e.pricing.unitFeeUsd ?? e.pricing.baseFeeUsd)
        : e.pricing.baseFeeUsd,
      model: e.pricing.model
    });
  }
  process.stderr.write(`   ${query} → ${results.length} (total ${endpoints.size})\n`);
}

const all = [...endpoints.values()];
const categories = {};
for (const [key, spec] of Object.entries(CATEGORIES)) {
  const matched = all.filter(e => spec.match.test(`${e.description} ${e.id}`));
  const excluded = matched.filter(e => REVIEWED_EXCLUSIONS[e.id]);
  const hits = matched.filter(e => !REVIEWED_EXCLUSIONS[e.id]);
  const priced = hits.filter(e => Number.isFinite(e.priceUsd) && e.priceUsd > 0);
  categories[key] = {
    label: spec.label,
    keywordMatches: matched.length,
    listingCount: hits.length,
    distinctProviders: new Set(hits.map(h => h.provider)).size,
    floorPriceUsd: priced.length ? Math.min(...priced.map(p => p.priceUsd)) : null,
    freeOrZeroPriced: hits.length - priced.length,
    excludedOnReview: excluded.map(e => ({ id: e.id, reason: REVIEWED_EXCLUSIONS[e.id] })),
    examples: hits.slice(0, 6).map(h => ({ id: h.id, priceUsd: h.priceUsd, model: h.model }))
  };
}

const snapshot = {
  schema: 'tool-audit.market-scan.v1',
  scannedAt: new Date().toISOString(),
  queries: [...CATALOG_SWEEP_QUERIES],
  endpointsSeen: all.length,
  distinctProviders: new Set(all.map(e => e.provider)).size,
  paidRuns: 0,
  costUsd: 0,
  categories,
  coverage: 'endpoints surfaced by the listed queries; not a guaranteed full enumeration',
  note: 'Category membership is keyword classification over listing descriptions, then manual review. Counts are LISTINGS, not sellers: distinctProviders is the seller count. It is a floor, not a census. Exclusions are listed per category with their reason rather than removed from the patterns.',
  priceBasis: 'PER_CALL uses the call price; PER_RESULT uses the per-result fee, not the flat fee. floorPriceUsd ignores zero-priced listings and counts them separately.'
};

const out = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'evidence/market-scan.json';
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Wrote ${out}`);
for (const [k, v] of Object.entries(categories)) {
  console.log(`  ${String(v.listingCount).padStart(3)} listings  floor ${v.floorPriceUsd === null ? '—' : '$' + v.floorPriceUsd}  ${v.label}`);
}
