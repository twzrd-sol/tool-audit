import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checkProvenance } from './provenance.js';
import { planCounterpartyScreen } from './counterparty.js';

const fronted = (provider: string, name: string) =>
  checkProvenance({ provider, providerName: name, docUrl: `https://parse.bot/marketplace/${provider}-api`, tags: ['verified'] });

test('brands sharing a counterparty collapse to one paid screen', () => {
  const plan = planCounterpartyScreen(
    [fronted('nasdaq', 'Nasdaq'), fronted('g2', 'G2'), fronted('zillow', 'Zillow')],
    0.0594
  );
  assert.equal(plan.distinctCounterparties, 1);
  assert.equal(plan.targets[0].host, 'parse.bot');
  assert.deepEqual(plan.targets[0].brands, ['G2', 'Nasdaq', 'Zillow']);
  assert.equal(plan.targets[0].fronted, true);
  assert.equal(plan.screensAvoided, 2);
});

test('cost falls with deduplication and arithmetic is exact', () => {
  const plan = planCounterpartyScreen(
    [
      fronted('nasdaq', 'Nasdaq'),
      fronted('g2', 'G2'),
      checkProvenance({ provider: 'ahrefs', providerName: 'Ahrefs', docUrl: 'https://docs.ahrefs.com' })
    ],
    0.0594
  );
  assert.equal(plan.listedBrands, 3);
  assert.equal(plan.distinctCounterparties, 2);
  assert.equal(plan.naiveCostUsd, 0.1782);
  assert.equal(plan.dedupedCostUsd, 0.1188);
  assert.equal(plan.savedUsd, 0.0594);
});

test('a first-party listing screens its own registrable domain', () => {
  const plan = planCounterpartyScreen(
    [checkProvenance({ provider: 'semrush', providerName: 'Semrush', docUrl: 'https://developer.semrush.com/api' })],
    0.01
  );
  assert.equal(plan.targets[0].host, 'semrush.com');
  assert.equal(plan.targets[0].fronted, false);
});

test('undocumented listings are excluded from paid work, never approved', () => {
  const plan = planCounterpartyScreen(
    [checkProvenance({ provider: 'sfs', providerName: 'Simple FS', tags: ['verified'] })],
    0.0594
  );
  assert.equal(plan.targets.length, 0);
  assert.equal(plan.unscreenable.length, 1);
  assert.equal(plan.dedupedCostUsd, 0);
  assert.match(plan.unscreenable[0].reason, /not approved/);
  assert.match(plan.note, /not the same as clean/);
});

test('a negative or non-finite unit price is refused', () => {
  assert.throws(() => planCounterpartyScreen([], -1));
  assert.throws(() => planCounterpartyScreen([], Number.NaN));
});
