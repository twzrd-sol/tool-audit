import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_UNCERTAINTY_LIMITATION,
  PrescreenRefusalError,
  runVendorPrescreen
} from './vendor-prescreen.js';
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
      currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
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
  const runInputs: Array<{ toolId: string; input: Record<string, unknown> }> = [];
  return {
    get runCount() {
      return runCount;
    },
    get runInputs() {
      return runInputs;
    },
    async discover(query: string): Promise<MonidEndpoint[]> {
      if (query.includes('extract')) return [endpoints.incumbent_price];
      if (query.includes('headers')) return [endpoints.security_headers];
      return [endpoints.cookie_consent];
    },
    async inspect(toolId: string): Promise<MonidEndpoint | null> {
      return Object.values(endpoints).find(endpoint => endpoint.id === toolId) || null;
    },
    async run(toolId: string, input: Record<string, unknown>): Promise<MonidRun> {
      runCount += 1;
      runInputs.push({ toolId, input });
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
            'No cookie consent banner detected',
            'Insufficient HTML data to fully assess all scripts (only first 5000 chars provided)'
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
  assert.match(report.findings.cookiePotentialIssues[1], /Insufficient HTML data/);
  assert.ok(
    report.findings.cookiePotentialIssues.some(issue =>
      /partial HTML|Unable to verify|UNABLE_TO_VERIFY/i.test(issue)
    )
  );
  assert.deepEqual(client.runInputs[0].input, {
    queryParams: {
      url: 'https://vendorapp.co/pricing',
      includeLinks: false,
      includeImages: false,
      useMainContentOnly: true,
      maxAgeMs: 0
    }
  });
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

test('runVendorPrescreen refuses URLs with embedded credentials', async () => {
  const client = fakeClient();

  await assert.rejects(
    runVendorPrescreen(
      'https://user:password@example.com',
      { confirmSpend: true },
      client
    ),
    /must not contain embedded credentials/
  );
  assert.equal(client.runCount, 0);
});

test('runVendorPrescreen refuses an inspect identity substitution before spending', async () => {
  const base = fakeClient();
  const client = {
    ...base,
    async inspect(toolId: string): Promise<MonidEndpoint | null> {
      const endpoint = await base.inspect(toolId);
      return endpoint ? { ...endpoint, id: 'attacker:/substituted' } : null;
    },
    async run(): Promise<MonidRun> {
      throw new Error('run must not be called');
    }
  };

  await assert.rejects(
    runVendorPrescreen(
      'https://monid.ai',
      { confirmSpend: true },
      client
    ),
    /Inspect identity mismatch/
  );
});

test('runVendorPrescreen refuses a negative advertised PER_CALL price before spending', async () => {
  const base = fakeClient();
  const client = {
    ...base,
    async inspect(toolId: string): Promise<MonidEndpoint | null> {
      const endpoint = await base.inspect(toolId);
      return endpoint
        ? {
            ...endpoint,
            pricing: {
              ...endpoint.pricing,
              baseFeeUsd: -0.01
            }
          }
        : null;
    },
    async run(): Promise<MonidRun> {
      throw new Error('run must not be called');
    }
  };

  await assert.rejects(
    runVendorPrescreen(
      'https://monid.ai',
      { confirmSpend: true },
      client
    ),
    /PER_CALL\/USD/
  );
});

test('runVendorPrescreen requires the production endpoints to remain PER_CALL and USD', async () => {
  const base = fakeClient();
  const client = {
    ...base,
    async inspect(toolId: string): Promise<MonidEndpoint | null> {
      const endpoint = await base.inspect(toolId);
      return endpoint
        ? {
            ...endpoint,
            pricing: {
              model: 'per-result' as const,
              rawType: 'PER_RESULT',
              currency: 'EUR',
              baseFeeUsd: 0,
              unitFeeUsd: 3
            }
          }
        : null;
    },
    async run(): Promise<MonidRun> {
      throw new Error('run must not be called');
    }
  };

  await assert.rejects(
    runVendorPrescreen(
      'https://monid.ai',
      { confirmSpend: true },
      client
    ),
    /PER_CALL\/USD/
  );
});

test('runVendorPrescreen rejects missing provider status and non-USD receipts', async () => {
  const base = fakeClient();
  let mode: 'missing_status' | 'eur' = 'missing_status';
  const client = {
    ...base,
    async run(toolId: string, input: Record<string, unknown>): Promise<MonidRun> {
      const run = await base.run(toolId, input);
      if (mode === 'missing_status') {
        return { ...run, providerResponse: undefined };
      }
      return {
        ...run,
        cost: { value: run.cost?.value ?? 0, currency: 'EUR' }
      };
    }
  };

  await assert.rejects(
    runVendorPrescreen(
      'https://monid.ai',
      { confirmSpend: true },
      client
    ),
    /HTTP undefined/
  );

  mode = 'eur';
  await assert.rejects(
    runVendorPrescreen(
      'https://monid.ai',
      { confirmSpend: true },
      client
    ),
    /usable USD cost receipt/
  );
});

test('runVendorPrescreen makes missing result evidence explicit', async () => {
  const base = fakeClient();
  const client = {
    ...base,
    async run(toolId: string, input: Record<string, unknown>): Promise<MonidRun> {
      const run = await base.run(toolId, input);
      if (toolId === endpoints.security_headers.id) return { ...run, output: {} };
      if (toolId === endpoints.cookie_consent.id) {
        return { ...run, output: { potential_issues: [] } };
      }
      return run;
    }
  };

  const report = await runVendorPrescreen(
    'https://monid.ai',
    { confirmSpend: true },
    client
  );

  assert.match(report.findings.headerPotentialIssues[0], /omitted/);
  assert.match(report.findings.cookiePotentialIssues[0], /absence.*not approval/i);
  assert.ok(report.findings.cookiePotentialIssues.includes(COOKIE_UNCERTAINTY_LIMITATION));
  assert.equal(report.verdict, 'review_required');
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
