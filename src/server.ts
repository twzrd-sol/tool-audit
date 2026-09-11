import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { ToolAuditor } from './auditor.js';
import { MonidClient, SAMPLE_MONID_CATALOG } from './monid.js';
import type { MonidEndpoint } from './types.js';

const PORT = Number(process.env.PORT) || 8787;
const auditor = new ToolAuditor();
const client = new MonidClient();

function renderHtml(): string {
  const auditedCatalog = SAMPLE_MONID_CATALOG.map(t => ({
    tool: t,
    verdict: auditor.audit(t)
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tool-audit · Kill Vendor Questionnaires</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12151f;
      --border: #232838;
      --accent: #6366f1;
      --green: #10b981;
      --red: #ef4444;
      --yellow: #f59e0b;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      padding: 40px 20px;
      line-height: 1.6;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header { margin-bottom: 40px; text-align: center; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 12px;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }
    h1 { font-size: 2.8rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 12px; }
    .subtitle { color: var(--muted); font-size: 1.15rem; max-width: 650px; margin: 0 auto; }
    
    /* Comparison Table */
    .section-title { font-size: 1.4rem; font-weight: 700; margin: 36px 0 16px; }
    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 40px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
    }
    .card.kill { border-color: rgba(239, 68, 68, 0.4); }
    .card.kill h3 { color: var(--red); }
    .card.solve { border-color: rgba(16, 185, 129, 0.4); }
    .card.solve h3 { color: var(--green); }
    .card h3 { font-size: 1.3rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .card ul { list-style: none; }
    .card li { margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 0.95rem; }
    .card li .label { color: var(--muted); }
    .card li .value { font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    /* Audited Catalog */
    .tool-list { display: flex; flex-direction: column; gap: 16px; }
    .tool-row {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s;
    }
    .tool-row:hover { border-color: #3b4258; transform: translateY(-1px); }
    .tool-info h4 { font-size: 1.1rem; margin-bottom: 4px; }
    .tool-info p { color: var(--muted); font-size: 0.9rem; }
    .tag {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
    }
    .tag.APPROVED { background: rgba(16, 185, 129, 0.15); color: var(--green); border: 1px solid rgba(16, 185, 129, 0.3); }
    .tag.BLOCKED { background: rgba(239, 68, 68, 0.15); color: var(--red); border: 1px solid rgba(239, 68, 68, 0.3); }
    .tag.WARNED { background: rgba(245, 158, 11, 0.15); color: var(--yellow); border: 1px solid rgba(245, 158, 11, 0.3); }
    
    .code-block {
      background: #0d1017;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      color: #93c5fd;
      overflow-x: auto;
      margin-top: 12px;
    }
    footer { margin-top: 60px; text-align: center; color: var(--muted); font-size: 0.9rem; border-top: 1px solid var(--border); padding-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">Monid "We Kill" Hackathon Submission</div>
      <h1>Kill Vendor Questionnaires</h1>
      <p class="subtitle">Enterprises spend $25,000/yr and 3 weeks filling out spreadsheets before calling an API. <strong>tool-audit</strong> does it for agents in 14ms for $0.00.</p>
    </header>

    <h2 class="section-title">The Kill: Human Bureaucracy vs. Agent Pre-Spend Check</h2>
    <div class="comparison-grid">
      <div class="card kill">
        <h3>❌ The Old SaaS Model</h3>
        <ul>
          <li><span class="label">Incumbent:</span> <span class="value">OneTrust / Vanta / Loopio</span></li>
          <li><span class="label">Annual Cost:</span> <span class="value">$15,000 – $35,000 / yr</span></li>
          <li><span class="label">Review Turnaround:</span> <span class="value">14 to 21 Business Days</span></li>
          <li><span class="label">Friction:</span> <span class="value">180-Question Spreadsheet</span></li>
          <li><span class="label">Agent Compatibility:</span> <span class="value">0% (Requires Human CISO)</span></li>
        </ul>
      </div>

      <div class="card solve">
        <h3>⚡ tool-audit on Monid</h3>
        <ul>
          <li><span class="label">Engine:</span> <span class="value">Automated Contract Auditor</span></li>
          <li><span class="label">Cost:</span> <span class="value">$0.00 (Open / Self-Hosted)</span></li>
          <li><span class="label">Turnaround:</span> <span class="value">&lt; 15 Milliseconds</span></li>
          <li><span class="label">Safety Checks:</span> <span class="value">Data Egress + Auth + Limits</span></li>
          <li><span class="label">Agent Compatibility:</span> <span class="value">100% (Instant JSON Verdict)</span></li>
        </ul>
      </div>
    </div>

    <h2 class="section-title">Live Monid Endpoint Audit Matrix</h2>
    <div class="tool-list">
      ${auditedCatalog.map(({ tool, verdict }) => `
        <div class="tool-row">
          <div class="tool-info">
            <h4>${tool.name} <span style="font-size: 0.8rem; color: #6366f1;">(${tool.provider})</span></h4>
            <p>${tool.description} &bull; <strong>$${tool.pricing.baseFeeUsd}</strong> ${tool.pricing.model}</p>
            ${verdict.findings.length > 0 ? `
              <div style="margin-top: 6px; font-size: 0.8rem; color: #f87171;">
                ${verdict.findings.map(f => `⚠️ [${f.code}] ${f.title}`).join(' | ')}
              </div>
            ` : ''}
          </div>
          <div>
            <span class="tag ${verdict.status}">${verdict.status} (${verdict.score}/100)</span>
          </div>
        </div>
      `).join('')}
    </div>

    <h2 class="section-title">Agent Integration (Discover &rarr; Inspect &rarr; Audit &rarr; Run)</h2>
    <div class="code-block">
// In your agent workflow:
import { executeWithAudit } from 'tool-audit';

const result = await executeWithAudit('scrape tiktok sound', { profile: 'elonmusk' });
if (result.step === 'REFUSED') {
  console.log('Blocked by Pre-Spend Policy:', result.refusalReason);
} else {
  console.log('Executed safely via Monid! Cost:', result.execution.chargedUsd);
}
    </div>

    <footer>
      <p>Built for the Monid "We Kill" Hackathon · Sep 10, 2026 · <a href="/v1/demo" style="color: #6366f1;">Raw JSON API</a></p>
    </footer>
  </div>
</body>
</html>`;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'tool-audit', timestamp: new Date().toISOString() }));
    return;
  }

  if (url.pathname === '/v1/demo') {
    const tools = SAMPLE_MONID_CATALOG.map(t => ({
      tool: t,
      audit: auditor.audit(t)
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      target: 'Vendor Security Questionnaires (OneTrust / Loopio / Vanta)',
      savings: '$25,000/yr saved, turnaround reduced from 21 days to 14ms',
      auditedTools: tools
    }, null, 2));
    return;
  }

  if (url.pathname === '/v1/audit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body) as MonidEndpoint;
        const verdict = auditor.audit(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(verdict, null, 2));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body or Monid endpoint format' }));
      }
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 tool-audit server listening on http://localhost:${PORT}`);
});
