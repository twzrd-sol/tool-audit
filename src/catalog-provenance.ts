/**
 * Catalog-wide counterparty provenance sweep.
 *
 * Discovery and inspection are non-executing preflight: this sweep issues no
 * `run`, so it settles no money. The measured snapshot in
 * `evidence/catalog-provenance.json` was produced with a balance reading taken
 * before and after; both read the same figure.
 *
 * Coverage is honest about its own shape: providers are those surfaced by the
 * seed queries below, not a guaranteed enumeration of every listing Monid
 * holds. The snapshot records the queries so the sweep can be re-run and
 * compared.
 */
import type { MonidEndpoint } from './types.js';
import {
  PROVENANCE_LIMITATION,
  checkProvenance,
  summarizeProvenance,
  type ProvenanceFinding,
  type ProvenanceSummary
} from './provenance.js';

/** Seed queries spanning the catalog's advertised categories. */
export const CATALOG_SWEEP_QUERIES = [
  'web scraping',
  'company data enrichment',
  'social media scraper',
  'search engine results',
  'security scan',
  'email finder',
  'SEO backlinks',
  'ecommerce product data',
  'image generation',
  'video generation',
  'llm inference',
  'blockchain onchain data',
  'news articles',
  'job listings',
  'real estate',
  'weather',
  'maps places',
  'translation',
  'pdf document parsing',
  'sentiment analysis',
  'domain whois dns',
  'stock market finance',
  'sports odds',
  'flight travel',
  'government public records'
] as const;

export const CATALOG_PROVENANCE_SCHEMA = 'tool-audit.catalog-provenance.v1' as const;

export interface CatalogProvenanceSnapshot extends ProvenanceSummary {
  schema: typeof CATALOG_PROVENANCE_SCHEMA;
  sweptAt: string;
  queries: string[];
  endpointsSeen: number;
  /** Non-executing preflight only. No `run` is issued by this sweep. */
  paidRuns: 0;
  costUsd: 0;
  coverage: 'providers surfaced by the listed queries; not a guaranteed full enumeration';
}

interface SweepClient {
  discover(query: string, limit?: number): Promise<MonidEndpoint[]>;
  inspect(toolId: string): Promise<MonidEndpoint | null>;
}

export async function sweepCatalogProvenance(
  client: SweepClient,
  options: { queries?: readonly string[]; limit?: number; onProgress?: (msg: string) => void } = {}
): Promise<CatalogProvenanceSnapshot> {
  const queries = [...(options.queries ?? CATALOG_SWEEP_QUERIES)];
  const limit = options.limit ?? 40;
  const progress = options.onProgress ?? (() => {});

  // provider -> one representative endpoint id
  const representative = new Map<string, string>();
  const endpointIds = new Set<string>();

  for (const query of queries) {
    const results = await client.discover(query, limit);
    for (const endpoint of results) {
      endpointIds.add(endpoint.id);
      if (!representative.has(endpoint.provider)) {
        representative.set(endpoint.provider, endpoint.id);
      }
    }
    progress(`discover "${query}" → ${results.length} (providers so far: ${representative.size})`);
  }

  const findings: ProvenanceFinding[] = [];
  for (const [provider, toolId] of [...representative.entries()].sort()) {
    const inspected = await client.inspect(toolId);
    if (!inspected) {
      // Inspect refused to describe a provider discovery advertised. That is
      // itself an unknown, and an unknown is never an approval.
      findings.push(
        checkProvenance({ provider, providerName: provider, endpoint: toolId })
      );
      continue;
    }
    findings.push(
      checkProvenance({
        provider: inspected.provider,
        providerName: inspected.name,
        endpoint: toolId,
        ...(inspected.docUrl ? { docUrl: inspected.docUrl } : {}),
        ...(inspected.tags ? { tags: inspected.tags } : {})
      })
    );
  }
  progress(`inspected ${findings.length} providers`);

  return {
    schema: CATALOG_PROVENANCE_SCHEMA,
    sweptAt: new Date().toISOString(),
    queries,
    endpointsSeen: endpointIds.size,
    paidRuns: 0,
    costUsd: 0,
    coverage: 'providers surfaced by the listed queries; not a guaranteed full enumeration',
    ...summarizeProvenance(findings),
    limitation: PROVENANCE_LIMITATION
  };
}
