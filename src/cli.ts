#!/usr/bin/env node
import { ToolAuditor } from './auditor.js';
import { MonidClient } from './monid.js';
import { discoverInspectAndAudit, executeWithAudit } from './index.js';
import { runVendorPrescreen } from './vendor-prescreen.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'compare';

  console.log(`\n🛡️  tool-audit: first-pass vendor evidence before an agent spends`);
  console.log(`─────────────────────────────────────────────────────────────`);

  if (command === 'compare') {
    console.log(`\n📊 MEASURED COMPARISON (2026-09-11 UTC)\n`);
    console.table([
      {
        Metric: 'Offer',
        'Vendorapp Startup': '200 AI pre-screens',
        'tool-audit': 'One first-pass check'
      },
      {
        Metric: 'Price',
        'Vendorapp Startup': '$149/month',
        'tool-audit': '$0.2385 measured'
      },
      {
        Metric: 'Pricing model',
        'Vendorapp Startup': 'Subscription',
        'tool-audit': 'Three Monid calls'
      },
      {
        Metric: 'Scope',
        'Vendorapp Startup': 'Vendor management platform',
        'tool-audit': 'Before-spend evidence only'
      },
      {
        Metric: 'Free tier',
        'Vendorapp Startup': '15 pre-screens on Basic',
        'tool-audit': 'No subscription; calls are metered'
      }
    ]);
    console.log(`\nAt 200 identical checks: $47.70 raw Monid call cost vs. $149/month.`);
    console.log(`Hosting and engineering are excluded; the scopes are not identical.\n`);
    return;
  }

  if (command === 'audit') {
    const toolId = args[1] || 'api.strale.io:/x402/header-security-check';
    const client = new MonidClient();
    const auditor = new ToolAuditor();
    const tool = await client.inspect(toolId);
    if (!tool) throw new Error(`Tool '${toolId}' was not returned by Monid inspect.`);

    const verdict = auditor.audit(tool);
    console.log(JSON.stringify({ tool, verdict }, null, 2));
    if (verdict.status === 'BLOCKED') process.exitCode = 2;
    return;
  }

  if (command === 'discover-audit') {
    const query = args[1] || 'vendor security compliance';
    const result = await discoverInspectAndAudit(query);
    console.log(JSON.stringify(result, null, 2));
    if (result.step === 'REFUSED') process.exitCode = 2;
    return;
  }

  if (command === 'consume') {
    if (!args.includes('--confirm-spend')) {
      console.error(`🛑 Refused: consume can spend Monid balance. Re-run with --confirm-spend.`);
      process.exitCode = 2;
      return;
    }
    const query = args[1] || 'vendor security compliance';
    const inputIndex = args.indexOf('--input');
    const input = inputIndex >= 0 && args[inputIndex + 1]
      ? JSON.parse(args[inputIndex + 1])
      : {};
    const result = await executeWithAudit(query, input, { confirmSpend: true });
    console.log(JSON.stringify(result, null, 2));
    if (result.step === 'REFUSED') process.exitCode = 2;
    return;
  }

  if (command === 'prescreen') {
    if (!args.includes('--confirm-spend')) {
      console.error(`🛑 Refused: prescreen makes three paid Monid calls. Re-run with --confirm-spend.`);
      process.exitCode = 2;
      return;
    }
    const targetUrl = args[1] || 'https://monid.ai';
    const maxIndex = args.indexOf('--max-total');
    const maxTotalUsd = maxIndex >= 0 ? Number(args[maxIndex + 1]) : 0.24;
    console.log(`🔎 Pre-screening ${targetUrl} with a $${maxTotalUsd.toFixed(4)} advertised-price ceiling...`);
    const report = await runVendorPrescreen(targetUrl, {
      confirmSpend: true,
      maxTotalUsd
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Usage:`);
  console.log(`  tool-audit compare`);
  console.log(`  tool-audit audit <provider:/endpoint>`);
  console.log(`  tool-audit discover-audit "<query>"`);
  console.log(`  tool-audit consume "<query>" --input '<json>' --confirm-spend`);
  console.log(`  tool-audit prescreen <https-url> --max-total 0.24 --confirm-spend`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Unknown CLI failure.');
  process.exit(1);
});
