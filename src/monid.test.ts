import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MonidApiError,
  MonidClient,
  MonidConfigurationError
} from './monid.js';
import { executeWithAudit } from './index.js';

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
