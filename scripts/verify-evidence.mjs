import { readFile } from 'node:fs/promises';
import { MonidClient } from '../dist/monid.js';

const evidence = JSON.parse(
  await readFile(
    new URL('../evidence/measured-demo.json', import.meta.url),
    'utf8'
  )
);
const client = new MonidClient();
const verified = [];

for (const expected of evidence.receipts) {
  const run = await client.getRun(expected.runId);
  const actualCost = run.cost?.value;
  const providerStatus = run.providerResponse?.httpStatus;
  if (
    run.status !== 'COMPLETED' ||
    providerStatus !== 200 ||
    run.provider !== expected.provider ||
    run.endpoint !== expected.endpoint ||
    run.cost?.currency !== 'USD' ||
    actualCost !== expected.costUsd
  ) {
    throw new Error(`Receipt ${expected.runId} does not match evidence/measured-demo.json.`);
  }
  verified.push({
    runId: run.runId,
    status: run.status,
    provider: run.provider,
    endpoint: run.endpoint,
    costUsd: actualCost
  });
}

const total = Number(
  verified.reduce((sum, receipt) => sum + receipt.costUsd, 0).toFixed(6)
);
if (total !== evidence.measuredCostUsd) {
  throw new Error(
    `Receipt sum $${total} does not match measured total $${evidence.measuredCostUsd}.`
  );
}

console.log(JSON.stringify({
  schema: evidence.schema,
  receiptsVerified: verified.length,
  measuredCostUsd: total,
  receipts: verified
}, null, 2));
