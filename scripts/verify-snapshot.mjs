import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const evidence = JSON.parse(
  await readFile(new URL('../evidence/measured-demo.json', import.meta.url), 'utf8')
);

if (evidence.schema !== 'tool-audit.measured-demo.v2') {
  throw new Error(`Unexpected evidence schema: ${evidence.schema}`);
}
if (evidence.kind !== 'measured-snapshot') {
  throw new Error('Evidence must be labeled as a measured snapshot.');
}
if (evidence.verdict !== 'review_required') {
  throw new Error('Snapshot verdict must remain review_required.');
}
if (!Array.isArray(evidence.receipts) || evidence.receipts.length !== 3) {
  throw new Error('Snapshot must contain exactly three receipts.');
}

const lines = [];
for (const receipt of evidence.receipts) {
  if (
    receipt.status !== 'COMPLETED' ||
    receipt.providerHttpStatus !== 200 ||
    receipt.currency !== 'USD' ||
    !Number.isFinite(receipt.costUsd) ||
    receipt.costUsd < 0 ||
    typeof receipt.runId !== 'string' ||
    typeof receipt.completedAt !== 'string'
  ) {
    throw new Error(`Receipt ${receipt.runId || '<missing>'} is not receipt-grade.`);
  }
  lines.push(
    [
      receipt.runId,
      receipt.provider,
      receipt.endpoint,
      receipt.status,
      receipt.providerHttpStatus,
      receipt.costUsd,
      receipt.currency,
      receipt.completedAt
    ].join('|')
  );
}

const digest = createHash('sha256').update(lines.join('\n')).digest('hex');
if (digest !== evidence.receiptSetSha256) {
  throw new Error(`Receipt digest ${digest} does not match ${evidence.receiptSetSha256}.`);
}

const total = Number(
  evidence.receipts.reduce((sum, receipt) => sum + receipt.costUsd, 0).toFixed(6)
);
if (total !== evidence.measuredCostUsd || total !== 0.2385) {
  throw new Error(`Snapshot total ${total} is not the measured $0.2385.`);
}

const cookie = evidence.receipts.find(receipt => receipt.purpose === 'cookie_consent');
const cookieText = JSON.stringify(cookie?.outputSummary || {});
if (!/partial HTML|JavaScript/i.test(cookieText) || !/unable to verify/i.test(cookieText)) {
  throw new Error('Cookie snapshot omitted its uncertainty evidence.');
}
if (!evidence.limitations.some(item => /JavaScript-set cookies/i.test(item))) {
  throw new Error('Snapshot limitations omitted cookie uncertainty.');
}

console.log(JSON.stringify({
  schema: evidence.schema,
  kind: evidence.kind,
  receiptsVerified: evidence.receipts.length,
  measuredCostUsd: total,
  receiptSetSha256: digest,
  verdict: evidence.verdict
}, null, 2));
