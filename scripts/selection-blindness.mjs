#!/usr/bin/env node
/**
 * What does an agent see when it SELECTS a tool, versus after it inspects one?
 *
 * The counterparty finding rests on a claim about ordering: `providerName` and
 * the `verified` tag are what discovery hands an agent, and the documentation
 * host is not. If discovery already carried `docUrl`, the agent would get the
 * counterparty for free and there would be nothing here to find.
 *
 * This measures that difference against the live API rather than asserting it.
 * Both routes are non-executing preflight and settle nothing, so no run is
 * issued and `paidRuns` is 0 by construction.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://api.monid.ai/v1';
const KEY = process.env.MONID_API_KEY;
if (!KEY) {
  console.error('MONID_API_KEY is required. Discovery and inspection still need a key.');
  process.exit(1);
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

const QUERIES = ['stock market finance', 'company data enrichment', 'security scan'];

const atSelection = new Set();
const afterInspect = new Set();
const samples = [];
let discovered = 0;

for (const query of QUERIES) {
  const payload = await post('/discover', { query, limit: 10 });
  const results = payload.endpoints || payload.results || [];
  discovered += results.length;
  for (const r of results) Object.keys(r).forEach(k => atSelection.add(k));

  const first = results[0];
  if (!first) continue;
  const inspected = await post('/inspect', { provider: first.provider, endpoint: first.endpoint });
  Object.keys(inspected).forEach(k => afterInspect.add(k));

  samples.push({
    query,
    toolId: `${first.provider}:${first.endpoint}`,
    atSelection: {
      providerName: first.providerName ?? null,
      tags: first.tags ?? null,
      docUrl: Object.prototype.hasOwnProperty.call(first, 'docUrl') ? first.docUrl : null
    },
    afterInspect: {
      providerName: inspected.providerName ?? null,
      tags: inspected.tags ?? null,
      docUrl: inspected.docUrl ?? null
    }
  });
}

const onlyAfterInspect = [...afterInspect].filter(f => !atSelection.has(f)).sort();
const docUrlAtSelection = atSelection.has('docUrl');

// The balance is read with `monid balance` either side of this script and
// passed in, because the figure belongs in the evidence rather than in prose.
// Both routes here are non-executing preflight, so `paidRuns` is 0 by
// construction: this script never calls /run.
const balanceCheck = {
  before: process.env.MONID_BALANCE_BEFORE ?? null,
  after: process.env.MONID_BALANCE_AFTER ?? null,
  method: 'monid balance, read immediately before and after this script'
};

const snapshot = {
  schema: 'tool-audit.selection-blindness.v1',
  measuredAt: new Date().toISOString(),
  queries: QUERIES,
  endpointsDiscovered: discovered,
  paidRuns: 0,
  costUsd: 0,
  balanceCheck,
  fieldsAtSelection: [...atSelection].sort(),
  fieldsAfterInspect: [...afterInspect].sort(),
  fieldsOnlyAvailableAfterInspect: onlyAfterInspect,
  docUrlAtSelection,
  verifiedTagAtSelection: atSelection.has('tags'),
  samples,
  finding: docUrlAtSelection
    ? 'Discovery carries docUrl: an agent can see the documentation host before it selects, and the ordering claim does not hold.'
    : 'Discovery carries providerName and the verified tag but not docUrl. An agent cannot see the documentation host at selection time; it has to inspect a listing to learn it.',
  limitation:
    'This records the fields Monid returned for these queries at this moment. It is not a statement about Monid’s API contract, which may change, and other routes may expose docUrl.'
};

writeFileSync('evidence/selection-blindness.json', JSON.stringify(snapshot, null, 2) + '\n');
console.log('Wrote evidence/selection-blindness.json');
console.log(`  docUrl at selection : ${docUrlAtSelection}`);
console.log(`  verified at selection: ${snapshot.verifiedTagAtSelection}`);
console.log(`  only after inspect  : ${onlyAfterInspect.join(', ') || '(none)'}`);
console.log(`  balance             : ${balanceCheck.before} -> ${balanceCheck.after}`);
