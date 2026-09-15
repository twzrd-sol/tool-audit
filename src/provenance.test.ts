import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  PROVENANCE_LIMITATION,
  checkProvenance,
  registrableDomain,
  summarizeProvenance
} from './provenance.js';

test('registrableDomain reduces documentation subdomains', () => {
  assert.equal(registrableDomain('docs.ahrefs.com'), 'ahrefs.com');
  assert.equal(registrableDomain('developer.semrush.com'), 'semrush.com');
  assert.equal(registrableDomain('parse.bot'), 'parse.bot');
  assert.equal(registrableDomain('api.strale.io'), 'strale.io');
});

test('registrableDomain keeps three labels on multi-part public suffixes', () => {
  assert.equal(registrableDomain('docs.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('example.com.au'), 'example.com.au');
});

test('a brand documented on its own host raises no mismatch', () => {
  const f = checkProvenance({
    provider: 'ahrefs',
    providerName: 'Ahrefs',
    docUrl: 'https://docs.ahrefs.com/api',
    tags: ['verified']
  });
  assert.equal(f.classification, 'first_party_doc_host');
  assert.equal(f.severity, 'info');
  assert.equal(f.frontedBy, undefined);
});

test('a first-party doc host is never stated as proof of operation', () => {
  const f = checkProvenance({
    provider: 'ahrefs',
    providerName: 'Ahrefs',
    docUrl: 'https://docs.ahrefs.com/api'
  });
  assert.match(f.reason, /does not by itself establish first-party operation/);
  assert.equal(f.limitation, PROVENANCE_LIMITATION);
});

test('a brand-named endpoint documented elsewhere is reported with the front named', () => {
  const f = checkProvenance({
    provider: 'nasdaq',
    providerName: 'Nasdaq',
    endpoint: '/get_stock_quote',
    docUrl: 'https://parse.bot/marketplace/nasdaq-com-api',
    tags: ['verified']
  });
  assert.equal(f.classification, 'third_party_doc_host');
  assert.equal(f.frontedBy, 'parse.bot');
  assert.equal(f.severity, 'attention');
  assert.match(f.reason, /parse\.bot/);
});

test('the verified tag raises severity rather than clearing the mismatch', () => {
  const tagged = checkProvenance({
    provider: 'g2', providerName: 'G2',
    docUrl: 'https://parse.bot/marketplace/g2-com-api', tags: ['verified']
  });
  const untagged = checkProvenance({
    provider: 'g2', providerName: 'G2',
    docUrl: 'https://parse.bot/marketplace/g2-com-api', tags: []
  });
  assert.equal(tagged.severity, 'attention');
  assert.equal(untagged.severity, 'review');
  assert.equal(tagged.classification, untagged.classification);
});

test('a display name matches a host an abbreviated slug cannot', () => {
  const f = checkProvenance({
    provider: 'pdl',
    providerName: 'People Data Labs',
    docUrl: 'https://docs.peopledatalabs.com/docs'
  });
  assert.equal(f.classification, 'first_party_doc_host');
});

test('a hostname-shaped slug claims its own registrable domain', () => {
  const f = checkProvenance({
    provider: 'api.strale.io',
    providerName: 'Strale',
    docUrl: 'https://api.strale.io/docs'
  });
  assert.equal(f.classification, 'first_party_doc_host');
});

test('a missing docUrl is undocumented, never treated as clean', () => {
  const f = checkProvenance({ provider: 'defillama', providerName: 'DefiLlama', tags: ['verified'] });
  assert.equal(f.classification, 'undocumented');
  assert.equal(f.severity, 'attention');
  assert.notEqual(f.severity, 'info');
});

test('an unusable docUrl is undocumented rather than first-party', () => {
  const f = checkProvenance({
    provider: 'x', providerName: 'X', docUrl: 'not-a-url'
  });
  assert.equal(f.classification, 'undocumented');
});

test('a non-web docUrl scheme cannot assert a doc host', () => {
  const f = checkProvenance({
    provider: 'x', providerName: 'X', docUrl: 'javascript:alert(1)'
  });
  assert.equal(f.classification, 'undocumented');
});

test('no classification ever yields an approval', () => {
  const inputs = [
    { provider: 'a', providerName: 'A', docUrl: 'https://docs.a.com' },
    { provider: 'b', providerName: 'B', docUrl: 'https://parse.bot/x', tags: ['verified'] },
    { provider: 'c', providerName: 'C' }
  ];
  for (const input of inputs) {
    const f = checkProvenance(input);
    assert.ok(['info', 'review', 'attention'].includes(f.severity));
    assert.equal(f.limitation, PROVENANCE_LIMITATION);
    assert.ok(!/approved|safe to pay|cleared/i.test(f.reason));
  }
});

test('summary counts fronts and verified-but-not-first-party listings', () => {
  const findings = [
    checkProvenance({ provider: 'nasdaq', providerName: 'Nasdaq', docUrl: 'https://parse.bot/a', tags: ['verified'] }),
    checkProvenance({ provider: 'g2', providerName: 'G2', docUrl: 'https://parse.bot/b', tags: ['verified'] }),
    checkProvenance({ provider: 'ahrefs', providerName: 'Ahrefs', docUrl: 'https://docs.ahrefs.com', tags: ['verified'] }),
    checkProvenance({ provider: 'sfs', providerName: 'Simple FS', tags: ['verified'] })
  ];
  const s = summarizeProvenance(findings);
  assert.equal(s.total, 4);
  assert.equal(s.thirdPartyDocHost, 2);
  assert.equal(s.firstPartyDocHost, 1);
  assert.equal(s.undocumented, 1);
  assert.equal(s.verifiedButNotFirstParty, 3);
  assert.equal(s.fronts[0].domain, 'parse.bot');
  assert.equal(s.fronts[0].count, 2);
  assert.deepEqual(s.fronts[0].brands, ['G2', 'Nasdaq']);
});
