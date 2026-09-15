import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CohortBudgetError, HEADER_CHECK_TOOL, runCohortScreen } from './cohort-screen.js';
import type { CounterpartyPlan } from './counterparty.js';
import type { MonidEndpoint, MonidRun } from './types.js';

const priced = (value: number, model: 'per-call' | 'per-result' = 'per-call'): MonidEndpoint => ({
  id: HEADER_CHECK_TOOL,
  name: 'Strale',
  provider: 'api.strale.io',
  description: '',
  url: 'https://api.monid.ai/run',
  method: 'GET',
  inputSchema: {},
  pricing: { model, rawType: model === 'per-call' ? 'PER_CALL' : 'PER_RESULT', currency: 'USD', baseFeeUsd: value }
});

const ok = (runId: string, grade: string, cost = 0.0594): MonidRun => ({
  runId, provider: 'api.strale.io', endpoint: '/x402/header-security-check',
  status: 'COMPLETED', output: { grade, score: 10, missingHeaders: ['csp'] },
  providerResponse: { httpStatus: 200 }, cost: { value: cost, currency: 'USD' }
} as MonidRun);

const plan = (hosts: Array<{ host: string; brands: string[]; fronted?: boolean }>): CounterpartyPlan => ({
  schema: 'tool-audit.counterparty-plan.v1',
  targets: hosts.map(h => ({ host: h.host, brands: h.brands, fronted: h.fronted ?? false })),
  unscreenable: [], listedBrands: 0, distinctCounterparties: hosts.length, screensAvoided: 0,
  unitPriceUsd: 0.0594, naiveCostUsd: 0, dedupedCostUsd: 0, savedUsd: 0, note: ''
});

function client(runs: Record<string, MonidRun | Error>, endpoint = priced(0.0594)) {
  const calls: string[] = [];
  return {
    calls,
    inspect: async () => endpoint,
    run: async (_t: string, input: Record<string, unknown>) => {
      const url = String((input.queryParams as Record<string, unknown>).url);
      calls.push(url);
      const r = runs[url];
      if (r instanceof Error) throw r;
      if (!r) throw new Error(`no fixture for ${url}`);
      return r;
    }
  };
}

test('refuses without confirm-spend', async () => {
  await assert.rejects(
    () => runCohortScreen(client({}), plan([]), { confirmSpend: false, maxTotalUsd: 2 }),
    CohortBudgetError
  );
});

test('refuses before any call when worst case exceeds the ceiling', async () => {
  const c = client({});
  await assert.rejects(
    () => runCohortScreen(c, plan([{ host: 'a.com', brands: ['A'] }, { host: 'b.com', brands: ['B'] }]),
      { confirmSpend: true, maxTotalUsd: 0.05 }),
    /Refused before spending/
  );
  assert.equal(c.calls.length, 0);
});

test('refuses a pricing model it cannot bound', async () => {
  await assert.rejects(
    () => runCohortScreen(client({}, priced(0.0594, 'per-result')), plan([]), { confirmSpend: true, maxTotalUsd: 2 }),
    /requires PER_CALL USD/
  );
});

test('the live inspected price overrides the planned price', async () => {
  // Plan said $0.0594; live inspect says $0.50, so two targets breach a $0.20 cap.
  await assert.rejects(
    () => runCohortScreen(client({}, priced(0.5)), plan([{ host: 'a.com', brands: ['A'] }, { host: 'b.com', brands: ['B'] }]),
      { confirmSpend: true, maxTotalUsd: 0.2 }),
    /Refused before spending/
  );
});

test('screens each distinct host once and counts deduplicated brands', async () => {
  const c = client({
    'https://parse.bot': ok('r1', 'F'),
    'https://ahrefs.com': ok('r2', 'A')
  });
  const report = await runCohortScreen(
    c,
    plan([{ host: 'parse.bot', brands: ['Nasdaq', 'G2', 'Zillow'], fronted: true }, { host: 'ahrefs.com', brands: ['Ahrefs'] }]),
    { confirmSpend: true, maxTotalUsd: 2 }
  );
  assert.deepEqual(c.calls, ['https://parse.bot', 'https://ahrefs.com']);
  assert.equal(report.screened, 2);
  assert.equal(report.brandsCovered, 4);
  assert.equal(report.spentUsd, 0.1188);
  assert.deepEqual(report.gradeDistribution, { F: 1, A: 1 });
});

test('a failed run is recorded as failed and never graded', async () => {
  const report = await runCohortScreen(
    client({
      'https://good.com': ok('r1', 'B'),
      'https://bad.com': { runId: 'r2', provider: 'api.strale.io', endpoint: '/x402/header-security-check',
        status: 'FAILED', providerResponse: { httpStatus: 502 } } as MonidRun
    }),
    plan([{ host: 'good.com', brands: ['G'] }, { host: 'bad.com', brands: ['B'] }]),
    { confirmSpend: true, maxTotalUsd: 2 }
  );
  assert.equal(report.screened, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.brandsCovered, 1);
  assert.equal(Object.values(report.gradeDistribution).reduce((a, b) => a + b, 0), 1);
});

test('a thrown transport error does not abort the cohort', async () => {
  const report = await runCohortScreen(
    client({ 'https://a.com': new Error('socket hang up'), 'https://b.com': ok('r2', 'C') }),
    plan([{ host: 'a.com', brands: ['A'] }, { host: 'b.com', brands: ['B'] }]),
    { confirmSpend: true, maxTotalUsd: 2 }
  );
  assert.equal(report.attempted, 2);
  assert.equal(report.failed, 1);
  assert.equal(report.screened, 1);
  assert.match(report.results[0].error!, /socket hang up/);
});

test('spend stops mid-cohort when actual receipts outrun the quoted price', async () => {
  // Inspect quotes $0.0594, so 3 targets ($0.1782) clear a $0.20 ceiling
  // upfront. Each receipt then actually bills $0.09, so the third call must
  // not be made. This is the guard the upfront check cannot provide.
  const c = client({
    'https://a.com': ok('r1', 'A', 0.09),
    'https://b.com': ok('r2', 'B', 0.09),
    'https://c.com': ok('r3', 'C', 0.09)
  });
  const report = await runCohortScreen(
    c, plan([{ host: 'a.com', brands: ['A'] }, { host: 'b.com', brands: ['B'] }, { host: 'c.com', brands: ['C'] }]),
    { confirmSpend: true, maxTotalUsd: 0.2 }
  );
  assert.equal(c.calls.length, 2);
  assert.equal(report.spentUsd, 0.18);
  assert.equal(report.attempted, 2);
});

test('a passing grade is never phrased as approval', async () => {
  const report = await runCohortScreen(
    client({ 'https://a.com': ok('r1', 'A') }), plan([{ host: 'a.com', brands: ['A'] }]),
    { confirmSpend: true, maxTotalUsd: 2 }
  );
  assert.match(report.limitation, /not an approval to spend/);
});

test('an unusable ceiling is refused before anything is inspected', async () => {
  for (const bad of [NaN, 0, -1, Infinity]) {
    const c = client({ 'https://a.com': ok('r1', 'A') });
    await assert.rejects(
      () => runCohortScreen(c, plan([{ host: 'a.com', brands: ['A'] }]), { confirmSpend: true, maxTotalUsd: bad as number }),
      (e: unknown) => e instanceof CohortBudgetError
    );
    // NaN compares false against every `>`, so without the guard both the
    // upfront refusal and the per-call check would pass and money would move.
    assert.equal(c.calls.length, 0, `ceiling ${bad} must not spend`);
  }
});

test('every result records the exact URL that was screened', async () => {
  const c = client({ 'https://a.com': ok('r1', 'A') });
  const report = await runCohortScreen(
    c, plan([{ host: 'a.com', brands: ['A'] }]),
    { confirmSpend: true, maxTotalUsd: 1 }
  );
  assert.equal(report.results[0].screenedUrl, 'https://a.com');
});
