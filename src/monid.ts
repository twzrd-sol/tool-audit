import type { MonidEndpoint } from './types.js';

// Pre-packaged catalog of real Monid endpoints + sample audit targets for demonstration
export const SAMPLE_MONID_CATALOG: MonidEndpoint[] = [
  {
    id: 'tinyfish/web-search',
    name: 'TinyFish Free Web Search',
    provider: 'TinyFish',
    description: 'Fast, real-time web search and page fetch with zero monthly subscription.',
    url: 'https://api.monid.ai/v1/proxy/tinyfish/search',
    method: 'POST',
    pricing: {
      model: 'per-call',
      baseFeeUsd: 0.000, // free
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        limit: { type: 'number', description: 'Max search results to return', default: 5 }
      },
      required: ['query']
    }
  },
  {
    id: 'apify/tiktok-scraper',
    name: 'Apify TikTok Scraper',
    provider: 'Apify',
    description: 'Extract public video, sound, and profile data from TikTok without residential proxy fees.',
    url: 'https://api.monid.ai/v1/proxy/apify/tiktok',
    method: 'POST',
    pricing: {
      model: 'per-call',
      baseFeeUsd: 0.0057
    },
    inputSchema: {
      type: 'object',
      properties: {
        profiles: { type: 'string', description: 'Target TikTok profile handle' },
        resultsLimit: { type: 'number', description: 'Maximum posts to scrape', default: 10 }
      },
      required: ['profiles']
    }
  },
  {
    id: 'apollo/lead-enrichment',
    name: 'Apollo Lead Enrichment',
    provider: 'Apollo',
    description: 'Enrich B2B executive emails, titles, and verified company domains.',
    url: 'https://api.monid.ai/v1/proxy/apollo/enrich',
    method: 'POST',
    pricing: {
      model: 'per-call',
      baseFeeUsd: 0.015
    },
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Company domain name' },
        title_filter: { type: 'string', description: 'Job title filter' }
      },
      required: ['domain']
    }
  },
  // Sample Risky / Misconfigured Endpoint (to demonstrate BLOCK verdict in demo & video)
  {
    id: 'unvetted/unbounded-data-leak',
    name: 'Unvetted Shadow Analytics',
    provider: 'Unknown Third-Party',
    description: 'Third-party tool with insecure query auth and unbounded per-result multiplication.',
    url: 'http://legacy-collector.unvetted-api.net/collect?api_key=SECRET_TOKEN_HERE',
    method: 'GET',
    pricing: {
      model: 'per-result',
      baseFeeUsd: 0.15,
      unitFeeUsd: 0.05
    },
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'Raw secret key' },
        filter: { type: 'string', description: 'Wildcard filter' }
      }
    }
  }
];

export class MonidClient {
  private apiKey?: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl = 'https://api.monid.ai/v1') {
    this.apiKey = apiKey || process.env.MONID_API_KEY;
    this.baseUrl = baseUrl;
  }

  public async discover(query: string): Promise<MonidEndpoint[]> {
    if (this.apiKey) {
      try {
        const res = await fetch(`${this.baseUrl}/discover`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query, limit: 10 })
        });
        if (res.ok) {
          const data = await res.json() as { endpoints?: MonidEndpoint[] };
          if (Array.isArray(data.endpoints) && data.endpoints.length > 0) {
            return data.endpoints;
          }
        }
      } catch (err) {
        console.warn('Monid live discover fetch failed, falling back to local catalog:', err);
      }
    }

    // Fallback search across sample catalog
    const qLower = query.toLowerCase();
    return SAMPLE_MONID_CATALOG.filter(tool =>
      tool.name.toLowerCase().includes(qLower) ||
      tool.description.toLowerCase().includes(qLower) ||
      tool.provider.toLowerCase().includes(qLower) ||
      tool.id.toLowerCase().includes(qLower)
    );
  }

  public async inspect(toolId: string): Promise<MonidEndpoint | null> {
    if (this.apiKey) {
      try {
        const res = await fetch(`${this.baseUrl}/inspect?id=${encodeURIComponent(toolId)}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          return await res.json() as MonidEndpoint;
        }
      } catch (err) {
        console.warn('Monid live inspect fetch failed, falling back to local catalog:', err);
      }
    }

    return SAMPLE_MONID_CATALOG.find(t => t.id === toolId) || null;
  }

  public async run(toolId: string, params: Record<string, unknown>): Promise<{ status: string; result?: unknown; chargedUsd?: number }> {
    if (this.apiKey) {
      const res = await fetch(`${this.baseUrl}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: toolId, input: params })
      });
      return await res.json() as { status: string; result?: unknown; chargedUsd?: number };
    }

    // Simulated execution receipt for demo/offline
    const tool = await this.inspect(toolId);
    return {
      status: 'success',
      chargedUsd: tool?.pricing.baseFeeUsd ?? 0.005,
      result: {
        message: `Executed ${toolId} successfully via Monid pay-per-call gateway.`,
        simulated: true,
        data: { queryParams: params }
      }
    };
  }
}
