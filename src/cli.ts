#!/usr/bin/env node
import { ToolAuditor } from './auditor.js';
import { MonidClient } from './monid.js';
import { discoverInspectAndAudit, executeWithAudit } from './index.js';
import { runVendorPrescreen } from './vendor-prescreen.js';
import { checkProvenance } from './provenance.js';
import { sweepCatalogProvenance } from './catalog-provenance.js';
import { planCounterpartyScreen } from './counterparty.js';
import { runCohortScreen } from './cohort-screen.js';

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
        'tool-audit': '$0.2385 chain / $0.2394 campaign'
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
    console.log(`\nSuccessful chain $0.2385. Earlier attempt $0.0009. Campaign spend $0.2394.`);
    console.log(`At 200 identical checks: $47.70 raw Monid call cost vs. $149/month.`);
    console.log(`This replaces first-pass evidence collection before downstream tool spend—not monitoring, remediation, contracts, or human review.\n`);
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

  if (command === 'provenance') {
    const toolId = args[1] || 'nasdaq:/get_stock_quote';
    const client = new MonidClient();
    const tool = await client.inspect(toolId);
    if (!tool) throw new Error(`Tool '${toolId}' was not returned by Monid inspect.`);
    const finding = checkProvenance({
      provider: tool.provider,
      providerName: tool.name,
      endpoint: toolId,
      ...(tool.docUrl ? { docUrl: tool.docUrl } : {}),
      ...(tool.tags ? { tags: tool.tags } : {})
    });
    console.log(JSON.stringify(finding, null, 2));
    // A mismatch is evidence to act on, not a hard failure: exit 3 marks it
    // distinctly from the auditor's BLOCKED (2) so callers can route on it.
    if (finding.classification !== 'first_party_doc_host') process.exitCode = 3;
    return;
  }

  if (command === 'catalog-provenance') {
    const outIndex = args.indexOf('--out');
    const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
    const client = new MonidClient();
    console.log(`\n🔍 Sweeping catalog provenance. Discovery and inspection only — no paid run.\n`);
    const snapshot = await sweepCatalogProvenance(client, {
      onProgress: msg => console.error(`   ${msg}`)
    });
    const json = JSON.stringify(snapshot, null, 2);
    if (out) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(out, json + '\n');
      console.log(`Wrote ${out}`);
    }
    console.table([{
      Providers: snapshot.total,
      'First-party doc host': snapshot.firstPartyDocHost,
      'Third-party doc host': snapshot.thirdPartyDocHost,
      Undocumented: snapshot.undocumented,
      'Verified, not first-party': snapshot.verifiedButNotFirstParty,
      'Paid runs': snapshot.paidRuns
    }]);
    for (const front of snapshot.fronts) {
      console.log(`  ${front.domain} fronts ${front.count}: ${front.brands.join(', ')}`);
    }
    console.log(`\n${snapshot.limitation}\n`);
    return;
  }

  if (command === 'cohort-screen') {
    if (!args.includes('--confirm-spend')) {
      console.error(`🛑 Refused: cohort-screen makes one paid Monid call per counterparty. Re-run with --confirm-spend.`);
      process.exitCode = 2;
      return;
    }
    const { readFileSync, writeFileSync } = await import('node:fs');
    const planIndex = args.indexOf('--plan');
    const planPath = planIndex >= 0 ? args[planIndex + 1] : 'evidence/counterparty-plan.json';
    const maxIndex = args.indexOf('--max-total');
    const maxTotalUsd = maxIndex >= 0 ? Number(args[maxIndex + 1]) : 2;
    const limitIndex = args.indexOf('--limit');
    const outIndex = args.indexOf('--out');
    const out = outIndex >= 0 ? args[outIndex + 1] : undefined;

    // Re-derive the plan from the provenance snapshot when asked, so the paid
    // set always traces back to measured evidence rather than a stale file.
    const fromIndex = args.indexOf('--from-provenance');
    const plan = fromIndex >= 0
      ? planCounterpartyScreen(
          JSON.parse(readFileSync(args[fromIndex + 1], 'utf8')).findings,
          0.0594
        )
      : JSON.parse(readFileSync(planPath, 'utf8'));

    const client = new MonidClient();
    const report = await runCohortScreen(client, plan, {
      confirmSpend: true,
      maxTotalUsd,
      ...(limitIndex >= 0 ? { limit: Number(args[limitIndex + 1]) } : {}),
      onProgress: msg => console.error(`   ${msg}`)
    });
    const json = JSON.stringify(report, null, 2);
    if (out) {
      writeFileSync(out, json + '\n');
      console.log(`Wrote ${out}`);
    }
    console.table([{
      Attempted: report.attempted,
      Screened: report.screened,
      Failed: report.failed,
      'Brands covered': report.brandsCovered,
      Spent: `$${report.spentUsd.toFixed(4)}`,
      Ceiling: `$${report.maxTotalUsd.toFixed(2)}`
    }]);
    console.log(`Grades: ${JSON.stringify(report.gradeDistribution)}`);
    console.log(`\n${report.limitation}\n`);
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

  console.error(`Unknown command: ${command}`);
  console.log(`Usage:`);
  console.log(`  tool-audit compare`);
  console.log(`  tool-audit audit <provider:/endpoint>`);
  console.log(`  tool-audit provenance <provider:/endpoint>`);
  console.log(`  tool-audit catalog-provenance [--out evidence/catalog-provenance.json]`);
  console.log(`  tool-audit cohort-screen --confirm-spend [--max-total 2] [--limit N] [--out FILE]`);
  console.log(`  tool-audit discover-audit "<query>"`);
  console.log(`  tool-audit consume "<query>" --input '<json>' --confirm-spend`);
  console.log(`  tool-audit prescreen <https-url> --max-total 0.24 --confirm-spend`);
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Unknown CLI failure.');
  process.exit(1);
});
