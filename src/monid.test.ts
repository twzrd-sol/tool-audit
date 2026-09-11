import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MonidAmbiguousRunError,
  MonidApiError,
  MonidClient,
  MonidConfigurationError
} from './monid.js';
import { executeWithAudit } from './index.js';
import { ToolAuditor } from './auditor.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('MonidClient fails closed when credentials are absent', async () => {
  let called = false;
  const client = new MonidClient(
    '',
    'https://api.monid.test/v1',
    (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch
  );

  await assert.rejects(
    client.discover('security headers'),
    MonidConfigurationError
  );
  assert.equal(called, false);
});

test('executeWithAudit requires explicit runtime spend confirmation', async () => {
  const result = await executeWithAudit(
    'security headers',
    {},
    { confirmSpend: false as true }
  );

  assert.equal(result.step, 'REFUSED');
  assert.match(result.refusalReason || '', /confirmSpend/);
});

test('MonidClient discovers and inspects the documented API shapes', async () => {
  const requests: Array<{ url: string; body?: unknown }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });
    if (url.endsWith('/discover')) {
      return jsonResponse({
        results: [{
          provider: 'api.strale.io',
          providerName: 'Strale',
          endpoint: '/x402/header-security-check',
          description: 'Check security headers',
          price: {
            type: 'PER_CALL',
            amount: { value: 0.0594, currency: 'USD' }
          }
        }]
      });
    }
    return jsonResponse({
      provider: 'api.strale.io',
      providerName: 'Strale',
      endpoint: '/x402/header-security-check',
      description: 'Check security headers',
      method: 'GET',
      input: {
        queryParams: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url']
        }
      },
      price: {
        type: 'PER_CALL',
        amount: { value: 0.0594, currency: 'USD' }
      }
    });
  }) as typeof fetch;

  const client = new MonidClient('monid_live_test', 'https://api.monid.test/v1', fakeFetch);
  const discovered = await client.discover('security headers', 5);
  const inspected = await client.inspect(discovered[0].id);

  assert.equal(discovered[0].id, 'api.strale.io:/x402/header-security-check');
  assert.equal(inspected?.method, 'GET');
  assert.equal(inspected?.pricing.rawType, 'PER_CALL');
  assert.equal(inspected?.pricing.baseFeeUsd, 0.0594);
  assert.deepEqual(inspected?.inputSchema.required, ['url']);
  assert.deepEqual(requests.map(request => request.body), [
    { query: 'security headers', limit: 5 },
    { provider: 'api.strale.io', endpoint: '/x402/header-security-check' }
  ]);
});

test('MonidClient never falls back after an API failure', async () => {
  const client = new MonidClient(
    'monid_live_test',
    'https://api.monid.test/v1',
    (async () => jsonResponse({ message: 'bad key' }, 401)) as typeof fetch
  );

  await assert.rejects(
    client.discover('security headers'),
    (error: unknown) =>
      error instanceof MonidApiError &&
      error.status === 401 &&
      error.message === 'bad key'
  );
});

test('MonidClient polls asynchronous runs to a terminal receipt', async () => {
  let polls = 0;
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/run')) {
      return jsonResponse({
        runId: '01TEST',
        provider: 'context.dev',
        endpoint: '/web/scrape/markdown',
        status: 'READY'
      }, 202);
    }
    polls += 1;
    return jsonResponse({
      runId: '01TEST',
      provider: 'context.dev',
      endpoint: '/web/scrape/markdown',
      status: 'COMPLETED',
      providerResponse: { httpStatus: 200 },
      output: { markdown: 'live' },
      cost: { value: 0.0009, currency: 'USD' }
    });
  }) as typeof fetch;

  const client = new MonidClient('monid_live_test', 'https://api.monid.test/v1', fakeFetch);
  const run = await client.run(
    'context.dev:/web/scrape/markdown',
    { queryParams: { url: 'https://example.com' } },
    { pollMs: 1 }
  );

  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.cost?.value, 0.0009);
  assert.equal(polls, 1);
});

test('MonidClient reconciles a synchronous completion that omits settled cost', async () => {
  let reconciliations = 0;
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/run')) {
      return jsonResponse({
        runId: '01SYNC',
        provider: 'context.dev',
        endpoint: '/web/scrape/markdown',
        status: 'COMPLETED',
        providerResponse: { httpStatus: 200 },
        output: { markdown: 'live' }
      });
    }
    reconciliations += 1;
    return jsonResponse({
      runId: '01SYNC',
      provider: 'context.dev',
      endpoint: '/web/scrape/markdown',
      status: 'COMPLETED',
      providerResponse: { httpStatus: 200 },
      output: { markdown: 'live' },
      cost: { value: 0.0009, currency: 'USD' }
    });
  }) as typeof fetch;

  const client = new MonidClient('monid_live_test', 'https://api.monid.test/v1', fakeFetch);
  const run = await client.run(
    'context.dev:/web/scrape/markdown',
    { queryParams: { url: 'https://example.com' } },
    { pollMs: 1 }
  );

  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.cost?.value, 0.0009);
  assert.equal(reconciliations, 1);
});

test('MonidClient preserves completed provider errors for caller policy', async () => {
  const client = new MonidClient(
    'monid_live_test',
    'https://api.monid.test/v1',
    (async () => jsonResponse({
      runId: '01NOTFOUND',
      provider: 'example',
      endpoint: '/lookup',
      status: 'COMPLETED',
      providerResponse: { httpStatus: 404, error: { message: 'not found' } },
      output: null,
      cost: { value: 0, currency: 'USD' }
    }, 404)) as typeof fetch
  );

  const run = await client.run(
    'example:/lookup',
    { queryParams: { id: 'missing' } },
    { wait: false }
  );

  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.providerResponse?.httpStatus, 404);
  assert.equal(run.cost?.value, 0);
});

test('MonidClient bounds a paid request without retrying it', async () => {
  let calls = 0;
  const fakeFetch = ((_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  }) as typeof fetch;
  const client = new MonidClient('monid_live_test', 'https://api.monid.test/v1', fakeFetch);

  await assert.rejects(
    client.run(
      'example:/slow',
      {},
      { requestTimeoutMs: 1, wait: false }
    ),
    (error: unknown) =>
      error instanceof MonidAmbiguousRunError &&
      /Do not retry blindly/.test(error.message)
  );
  assert.equal(calls, 1);
});

test('MonidClient preserves unsupported HTTP methods for the auditor', async () => {
  const client = new MonidClient(
    'monid_live_test',
    'https://api.monid.test/v1',
    (async () => jsonResponse({
      provider: 'example',
      endpoint: '/patch',
      method: 'PATCH',
      input: {
        queryParams: {
          type: 'object',
          properties: { url: { type: 'string' } }
        }
      },
      price: {
        type: 'PER_CALL',
        amount: { value: 0.01, currency: 'USD' }
      }
    })) as typeof fetch
  );

  const inspected = await client.inspect('example:/patch');
  assert.equal(inspected?.method, 'PATCH');
  const verdict = new ToolAuditor().audit(inspected!);
  assert.equal(verdict.status, 'BLOCKED');
  assert.ok(verdict.findings.some(finding => finding.code === 'UNSUPPORTED_HTTP_METHOD'));
});

test('MonidClient refuses a completed run that omits HTTP status or USD cost', async () => {
  const client = new MonidClient(
    'monid_live_test',
    'https://api.monid.test/v1',
    (async () => jsonResponse({
      runId: '01NORECEIPT',
      provider: 'example',
      endpoint: '/lookup',
      status: 'COMPLETED',
      cost: { value: 0.01, currency: 'EUR' }
    })) as typeof fetch
  );

  await assert.rejects(
    client.run('example:/lookup', {}, { wait: false }),
    (error: unknown) =>
      error instanceof MonidApiError &&
      /explicit provider HTTP status or USD cost/.test(error.message)
  );
});

test('executeWithAudit refuses a completed run without a 2xx USD receipt', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/discover')) {
      return jsonResponse({
        results: [{
          provider: 'api.strale.io',
          providerName: 'Strale',
          endpoint: '/x402/header-security-check',
          method: 'GET',
          input: {
            queryParams: {
              type: 'object',
              properties: { url: { type: 'string' } },
              required: ['url']
            }
          },
          price: {
            type: 'PER_CALL',
            amount: { value: 0.0594, currency: 'USD' }
          }
        }]
      });
    }
    if (url.endsWith('/inspect')) {
      return jsonResponse({
        provider: 'api.strale.io',
        providerName: 'Strale',
        endpoint: '/x402/header-security-check',
        method: 'GET',
        input: {
          queryParams: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url']
          }
        },
        price: {
          type: 'PER_CALL',
          amount: { value: 0.0594, currency: 'USD' }
        }
      });
    }
    return jsonResponse({
      runId: '01BADRECEIPT',
      provider: 'api.strale.io',
      endpoint: '/x402/header-security-check',
      status: 'COMPLETED',
      providerResponse: { httpStatus: 404 },
      cost: { value: 0, currency: 'USD' }
    });
  }) as typeof fetch;

  try {
    const result = await executeWithAudit(
      'security headers',
      { queryParams: { url: 'https://monid.ai' } },
      { confirmSpend: true, monidApiKey: 'monid_live_test' }
    );
    assert.equal(result.step, 'REFUSED');
    assert.match(result.refusalReason || '', /2xx USD receipt/);
    assert.equal(result.execution?.runId, '01BADRECEIPT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MonidClient rejects a confused run identity', async () => {
  const client = new MonidClient(
    'monid_live_test',
    'https://api.monid.test/v1',
    (async () => jsonResponse({
      runId: '01WRONG',
      provider: 'other-provider',
      endpoint: '/other-endpoint',
      status: 'COMPLETED',
      cost: { value: 0.01, currency: 'USD' }
    })) as typeof fetch
  );

  await assert.rejects(
    client.run(
      'expected:/endpoint',
      {},
      { wait: false }
    ),
    (error: unknown) =>
      error instanceof MonidApiError &&
      /returned identity/.test(error.message)
  );
});
