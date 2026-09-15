#!/usr/bin/env node
/**
 * The published page claims its numbers come from the evidence files. This
 * turns that claim into a check: rebuild the page from the committed evidence
 * and require the result to be byte-identical to the committed page.
 *
 * Without this, "generated from evidence" is an assertion about a script
 * someone may have stopped running.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'tool-audit-page-'));
const rebuilt = join(dir, 'counterparty.html');
try {
  execFileSync('node', ['scripts/build-counterparty-page.mjs', rebuilt], { stdio: 'pipe' });
  const fresh = readFileSync(rebuilt, 'utf8');
  const committed = readFileSync('pages/counterparty.html', 'utf8');
  if (fresh !== committed) {
    console.error('FAIL: pages/counterparty.html does not match a fresh build from evidence/.');
    console.error(`      committed ${committed.length} bytes, rebuilt ${fresh.length} bytes.`);
    console.error('      Run `npm run build:page` and commit the result.');
    process.exit(1);
  }
  console.log(`PAGE-OK pages/counterparty.html is byte-identical to a fresh build (${fresh.length} bytes)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
