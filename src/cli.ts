#!/usr/bin/env node
import { ToolAuditor } from './auditor.js';
import { MonidClient, SAMPLE_MONID_CATALOG } from './monid.js';
import { executeWithAudit } from './index.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'compare';

  console.log(`\n🛡️  tool-audit: Kill Vendor Questionnaires with a Pre-Spend Check`);
  console.log(`─────────────────────────────────────────────────────────────`);

  if (command === 'compare') {
    console.log(`\n📊 THE KILL: Enterprise Human Questionnaire vs. Agent Tool-Audit\n`);
    console.table([
      {
        Metric: 'Turnaround Time',
        'Human Vendor Review (OneTrust/Vanta/SIG)': '14 to 21 Business Days',
        'tool-audit (Pre-Spend Engine)': '14 milliseconds'
      },
      {
        Metric: 'Annual Cost',
        'Human Vendor Review (OneTrust/Vanta/SIG)': '$15,000 – $35,000 / year',
        'tool-audit (Pre-Spend Engine)': '$0.00 (Self-Hosted / Open)'
      },
      {
        Metric: 'Friction to Call Tool',
        'Human Vendor Review (OneTrust/Vanta/SIG)': '180-Question Security Spreadsheet',
        'tool-audit (Pre-Spend Engine)': 'Automated Schema & Egress Contract Check'
      },
      {
        Metric: 'Autonomous Agent Ready?',
        'Human Vendor Review (OneTrust/Vanta/SIG)': 'NO (Requires Security Staff & CISO)',
        'tool-audit (Pre-Spend Engine)': 'YES (Instant Machine Verdict)'
      },
      {
        Metric: 'Economic Protection',
        'Human Vendor Review (OneTrust/Vanta/SIG)': 'None (Manual invoice audits)',
        'tool-audit (Pre-Spend Engine)': 'Enforces Max Spend Ceilings & Bound Limits'
      }
    ]);
    console.log(`\nTry scanning a tool:\n  npx tsx src/cli.ts audit apify/tiktok-scraper\n  npx tsx src/cli.ts audit unvetted/unbounded-data-leak\n`);
    return;
  }

  if (command === 'audit') {
    const toolId = args[1] || 'apify/tiktok-scraper';
    const client = new MonidClient();
    const auditor = new ToolAuditor();

    const tool = await client.inspect(toolId);
    if (!tool) {
      console.error(`❌ Tool '${toolId}' not found in catalog.`);
      process.exit(1);
    }

    console.log(`🔍 Inspecting Tool: ${tool.name} (${tool.id})`);
    console.log(`📡 URL: ${tool.url} [${tool.method}]`);
    console.log(`💰 Pricing: $${tool.pricing.baseFeeUsd} (${tool.pricing.model})`);

    const verdict = auditor.audit(tool);
    console.log(`\n📋 AUDIT VERDICT: [ ${verdict.status} ] (Score: ${verdict.score}/100)`);
    console.log(`   Estimated Max Cost: $${verdict.maxEstimatedCostUsd}`);
    console.log(`   Audit Hash: ${verdict.auditHash.slice(0, 16)}...`);

    if (verdict.findings.length > 0) {
      console.log(`\n⚠️  Findings (${verdict.findings.length}):`);
      verdict.findings.forEach((f, i) => {
        console.log(`   ${i + 1}. [${f.severity}] ${f.title}`);
        console.log(`      ${f.description}`);
        console.log(`      💡 Fix: ${f.recommendation}`);
      });
    } else {
      console.log(`\n✅ No security or economic vulnerabilities detected.`);
    }

    if (verdict.status === 'BLOCKED') {
      console.log(`\n🛑 EXECUTION REFUSED: Tool violates security or economic policy.`);
      process.exit(2);
    } else {
      console.log(`\n🚀 APPROVED: Tool is safe for autonomous execution.`);
    }
    return;
  }

  if (command === 'consume') {
    const query = args[1] || 'tiktok';
    console.log(`🤖 Agent requesting: "${query}"`);
    console.log(`⏳ Running consume path: Discover → Inspect → Audit → Execute...`);
    const res = await executeWithAudit(query, { query: 'crypto news' });
    console.log(`\nFinal Pipeline Step: ${res.step}`);
    if (res.verdict) {
      console.log(`Audit Verdict: ${res.verdict.status} (Score ${res.verdict.score}/100)`);
    }
    if (res.execution) {
      console.log(`Execution Succeeded! Charged: $${res.execution.chargedUsd}`);
      console.log(JSON.stringify(res.execution.result, null, 2));
    } else {
      console.log(`Refusal: ${res.refusalReason}`);
    }
    return;
  }

  console.log(`Usage:`);
  console.log(`  tool-audit compare           Show vendor questionnaire comparison`);
  console.log(`  tool-audit audit <toolId>    Audit a specific Monid tool`);
  console.log(`  tool-audit consume <query>   Full consume loop: Discover -> Inspect -> Audit -> Run`);
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
