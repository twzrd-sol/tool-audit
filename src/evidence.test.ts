import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SnapshotReceipt {
  runId: string;
  provider: string;
  endpoint: string;
  status: string;
  providerHttpStatus: number;
  costUsd: number;
  currency: string;
  completedAt: string;
  outputSummary?: unknown;
}

interface MeasuredSnapshot {
  schema: string;
  kind: string;
  label: string;
  verdict: string;
  measuredCostUsd: number;
  receiptSetSha256: string;
  receipts: SnapshotReceipt[];
  limitations: string[];
}

const evidence = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'evidence', 'measured-demo.json'),
    'utf8'
  )
) as MeasuredSnapshot;

test('measured snapshot stays receipt-grade and uncertain', () => {
  assert.equal(evidence.schema, 'tool-audit.measured-demo.v2');
  assert.equal(evidence.kind, 'measured-snapshot');
  assert.match(String(evidence.label), /Static measured snapshot/);
  assert.equal(evidence.verdict, 'review_required');
  assert.equal(evidence.receipts.length, 3);
  assert.equal(evidence.measuredCostUsd, 0.2385);

  const lines = evidence.receipts.map(receipt => {
    assert.equal(receipt.status, 'COMPLETED');
    assert.equal(receipt.providerHttpStatus, 200);
    assert.equal(receipt.currency, 'USD');
    assert.equal(typeof receipt.runId, 'string');
    assert.equal(typeof receipt.completedAt, 'string');
    assert.ok(Number.isFinite(receipt.costUsd) && receipt.costUsd >= 0);
    return [
      receipt.runId,
      receipt.provider,
      receipt.endpoint,
      receipt.status,
      receipt.providerHttpStatus,
      receipt.costUsd,
      receipt.currency,
      receipt.completedAt
    ].join('|');
  });

  assert.equal(
    createHash('sha256').update(lines.join('\n')).digest('hex'),
    evidence.receiptSetSha256
  );
  assert.match(
    JSON.stringify(evidence.receipts[2].outputSummary),
    /Unable to verify if cookies are set via JavaScript/
  );
  assert.ok(
    evidence.limitations.some(item => /JavaScript-set cookies/i.test(item))
  );
});

test('static pages are labeled as measured snapshots and keep cookie uncertainty', () => {
  const pagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages');
  const home = readFileSync(join(pagesDir, 'index.html'), 'utf8');
  const receipts = readFileSync(join(pagesDir, 'receipt.html'), 'utf8');

  for (const html of [home, receipts]) {
    assert.match(html, /Measured snapshot/);
    assert.match(html, /not a live query|not live-proof/i);
    assert.match(html, /UNABLE_TO_VERIFY/);
    assert.match(html, /REVIEW_REQUIRED/);
    assert.match(html, /JavaScript-set cookies/);
    assert.doesNotMatch(html, /vendor security pre-screen/);
    assert.match(html, /extract web page content/);
    assert.match(html, /website security headers/);
    assert.match(html, /website cookie consent scan/);
  }
});
