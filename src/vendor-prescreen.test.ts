import test from 'node:test';
import assert from 'node:assert/strict';
import { runVendorPrescreen, PrescreenRefusalError } from './vendor-prescreen.js';
import type { MonidEndpoint, MonidRun } from './types.js';

const endpoints: Record<string, MonidEndpoint> = {
  incumbent_price: {
    id: 'context.dev:/web/scrape/markdown',
    name: 'Context.dev',
    provider: 'context.dev',
    description: 'Extract a web page as markdown',
    url: 'https://api.monid.ai/v1/run',
    method: 'GET',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url']
    },
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 0.0009
    }
  },
  security_headers: {
    id: 'api.strale.io:/x402/header-security-check',
    name: 'Strale',
    provider: 'api.strale.io',
    description: 'Check response security headers',
    url: 'https://api.monid.ai/v1/run',
    method: 'GET',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url']
    },
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 0.0594
    }
  },
  cookie_consent: {
    id: 'api.strale.io:/x402/v2/cookie-scan',
    name: 'Strale',
    provider: 'api.strale.io',
    description: 'Check cookie and consent evidence',
    url: 'https://api.monid.ai/v1/run',
    method: 'GET',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url']
    },
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 0.1782
    }
  }
};

function completedRun(
  endpoint: MonidEndpoint,
  runId: string,
  cost: number,
  output: unknown
): MonidRun {
  return {
    runId,
    provider: endpoint.provider,
    endpoint: endpoint.id.slice(endpoint.id.indexOf(':') + 1),
    status: 'COMPLETED',
    output,
    providerResponse: { httpStatus: 200 },
    cost: { value: cost, currency: 'USD' }
  };
}

function fakeClient() {
  let runCount = 0;
  return {
    get runCount() {
      return runCount;
    },
    async discover(query: string): Promise<MonidEndpoint[]> {
      if (query.includes('extract')) return [endpoints.incumbent_price];
      if (query.includes('headers')) return [endpoints.security_headers];
      return [endpoints.cookie_consent];
    },
    async inspect(toolId: string): Promise<MonidEndpoint | null> {
      return Object.values(endpoints).find(endpoint => endpoint.id === toolId) || null;
    },
    async run(toolId: string): Promise<MonidRun> {
      runCount += 1;
      if (toolId === endpoints.incumbent_price.id) {
        return completedRun(
          endpoints.incumbent_price,
          '01PRICE',
          0.0009,
          { markdown: 'Startup\\n$149/month\\n200 AI pre-screens per month' }
        );
      }
      if (toolId === endpoints.security_headers.id) {
        return completedRun(
          endpoints.security_headers,
          '01HEADERS',
          0.0594,
          { missing: [{ header: 'content-security-policy', severity: 'high' }] }
        );
      }
      return completedRun(
        endpoints.cookie_consent,
        '01COOKIES',
        0.1782,
        {
          potential_issues: [
            'Incomplete HTML analysis - full assessment requires complete page source',
            'Unable to verify if cookies are set via JavaScript after page load'
          ]
        }
      );
    }
  };
}

test('runVendorPrescreen returns measured receipts and explicit uncertainty', async () => {
  const client = fakeClient();
  const report = await runVendorPrescreen(
    'https://monid.ai',
    { confirmSpend: true },
    client
  );

  assert.equal(client.runCount, 3);
  assert.equal(report.incumbent.verifiedFromLivePage, true);
  assert.equal(report.measuredCostUsd, 0.2385);
  assert.equal(report.verdict, 'review_required');
  assert.equal(report.receipts.length, 3);
  assert.equal(report.findings.missingSecurityHeaders.length, 1);
  assert.match(report.findings.cookiePotentialIssues[1], /Unable to verify/);
});

test('runVendorPrescreen enforces the total ceiling before any paid call', async () => {
  const client = fakeClient();

  await assert.rejects(
    runVendorPrescreen(
      'https://monid.ai',
      { confirmSpend: true, maxTotalUsd: 0.20 },
      client
    ),
    PrescreenRefusalError
  );
  assert.equal(client.runCount, 0);
});

test('runVendorPrescreen refuses non-HTTPS targets before discovery', async () => {
  const client = fakeClient();

  await assert.rejects(
    runVendorPrescreen(
      'http://example.com',
      { confirmSpend: true },
      client
    ),
    /must use HTTPS/
  );
  assert.equal(client.runCount, 0);
});
