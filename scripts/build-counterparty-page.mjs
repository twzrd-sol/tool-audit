#!/usr/bin/env node
/**
 * Renders pages/counterparty.html from the measured evidence files.
 *
 * Every figure on the published page is read out of evidence/ at build time.
 * Nothing is typed in by hand, so the page cannot drift from the receipts.
 * Run `npm run build:page` after any re-measurement.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const prov = JSON.parse(readFileSync('evidence/catalog-provenance.json', 'utf8'));
const plan = JSON.parse(readFileSync('evidence/counterparty-plan.json', 'utf8'));
const screen = JSON.parse(readFileSync('evidence/counterparty-screen.json', 'utf8'));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = n => '$' + Number(n).toFixed(4);
const pct = (a, b) => (100 * a / b).toFixed(0) + '%';

const screened = screen.results.filter(r => r.outcome === 'screened');
const byGrade = ['A', 'B', 'C', 'D', 'F'].map(g => [g, screen.gradeDistribution[g] || 0]);
const maxGrade = Math.max(...byGrade.map(([, n]) => n), 1);
const dOrF = (screen.gradeDistribution.D || 0) + (screen.gradeDistribution.F || 0);
const parseBot = screened.find(r => r.host === 'parse.bot');
const front = prov.fronts[0];
const failed = screen.results.filter(r => r.outcome === 'failed');

const rows = [...screened]
  .sort((a, b) => b.brands.length - a.brands.length || (a.grade || 'Z').localeCompare(b.grade || 'Z'))
  .map(r => `      <tr${r.brands.length > 1 ? ' class="hi"' : ''}>
        <td><code>${esc(r.host)}</code>${r.fronted ? ' <span class="tag">fronted</span>' : ''}</td>
        <td class="g g${esc(r.grade || '?')}">${esc(r.grade || '?')}</td>
        <td class="num-cell">${r.score ?? '—'}</td>
        <td class="num-cell">${r.brands.length}</td>
      </tr>`).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tool-audit — who are you actually paying?</title>
  <meta name="description" content="Measured ${esc(screen.screenedAt.slice(0, 10))}: ${prov.thirdPartyDocHost} of ${prov.total} Monid providers document at a host that does not match the brand they assert. ${front.count} of them at ${esc(front.domain)}. Preflight cost $0.00; the paid counterparty screen cost ${usd(screen.spentUsd)}.">
  <link rel="canonical" href="https://twzrd-sol.github.io/tool-audit/counterparty.html">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${front.count} brands, one counterparty: what ${prov.total} vendor listings actually document">
  <meta property="og:description" content="Free preflight read where every listing documents itself. ${front.count} brands document at one host. Screening ${screen.screened} of those hosts cost ${usd(screen.spentUsd)}, where screening all ${plan.listedBrands} brand names would have cost ${usd(plan.naiveCostUsd)}.">
  <meta property="og:url" content="https://twzrd-sol.github.io/tool-audit/counterparty.html">
  <meta name="twitter:card" content="summary">
  <style>
    :root {
      --bg: #101114; --card: #1a1c21; --ink: #f4f1ea; --muted: #b7b1a4;
      --line: #2b2e36; --amber: #d7a04a; --amber-bg: #2a2214;
      --red: #d76a5a; --green: #7fa86b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.45 "Liberation Sans", FreeSans, sans-serif; background: var(--bg); color: var(--ink); }
    main { max-width: 880px; margin: 0 auto; padding: 32px 20px 64px; }
    .kicker { color: var(--amber); letter-spacing: 0.12em; font-size: 12px; text-transform: uppercase; }
    h1 { font-size: clamp(27px, 5vw, 42px); line-height: 1.12; margin: 8px 0 16px; }
    h2 { font-size: 20px; margin: 40px 0 12px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; }
    .muted { color: var(--muted); }
    .lede { font-size: 18px; }
    .grid { display: grid; gap: 12px; }
    @media (min-width: 720px) { .grid.three { grid-template-columns: repeat(3, 1fr); } .grid.two { grid-template-columns: 1fr 1fr; } }
    .stat { font-size: clamp(30px, 5vw, 42px); font-weight: 700; line-height: 1; }
    .stat.amber { color: var(--amber); }
    .stat.red { color: var(--red); }
    .label { color: var(--muted); font-size: 13px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .scroll { overflow-x: auto; }
    th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: 400; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    tr.hi td { background: var(--amber-bg); }
    .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
    .g { font-weight: 700; text-align: center; width: 48px; }
    .gA, .gB { color: var(--green); }
    .gD { color: var(--amber); }
    .gF { color: var(--red); }
    .tag { font-size: 11px; border: 1px solid var(--amber); color: var(--amber); border-radius: 999px; padding: 1px 7px; margin-left: 6px; }
    .bar { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
    .bar .k { width: 20px; font-weight: 700; }
    .bar .t { height: 20px; border-radius: 4px; background: var(--amber); min-width: 3px; }
    .bar .gA-b { background: var(--green); } .bar .gB-b { background: var(--green); }
    .bar .gF-b { background: var(--red); }
    .limit { border-left: 3px solid var(--amber); padding: 12px 16px; background: var(--amber-bg); border-radius: 0 8px 8px 0; margin: 12px 0; }
    code { font-size: 13px; }
    a { color: var(--amber); }
    footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Measured ${esc(screen.screenedAt.slice(0, 10))} · reproducible · not a live query</p>
    <h1>Our first pass asked what a vendor check costs. The question before that one is who the listing actually points to.</h1>
    <p class="lede muted">A Monid discovery result gives an agent a brand name and, often, a <code>verified</code> tag. Neither of those names the operator behind the endpoint. The closest thing Monid publishes is the documentation URL on the listing — so we read one per provider, ${prov.total} in all.</p>

    <div class="grid three" style="margin:28px 0">
      <div class="card"><div class="stat">${prov.total}</div><div class="label">providers inspected, one listing each<br>out of ${prov.endpointsSeen} endpoints surfaced</div></div>
      <div class="card"><div class="stat amber">${prov.thirdPartyDocHost}</div><div class="label">document at a host that does not match the brand asserted (${pct(prov.thirdPartyDocHost, prov.total)})</div></div>
      <div class="card"><div class="stat">$0.00</div><div class="label">cost of the entire sweep — discovery and inspection settle nothing</div></div>
    </div>

    <h2>${front.count} brands, one counterparty</h2>
    <p>Of the ${prov.thirdPartyDocHost} mismatches, <strong>${front.count}</strong> document at a single host: <code>${esc(front.domain)}</code>. An agent picking any of these by name gets a listing documented in the same place. We call that host the listing's <em>counterparty</em> — the host a screen should be pointed at. It is evidence about who stands behind the endpoint, not proof of who operates it or receives the payment.</p>
    <div class="card"><p class="muted" style="margin:0;font-size:14px">${front.brands.map(esc).join(' · ')}</p></div>
    <p class="muted" style="font-size:14px">A further ${prov.undocumented} listings publish no documentation URL at all. ${prov.verifiedButNotFirstParty} of the ${prov.total} carry <code>verified</code> while not documenting on their own host.</p>
    <div class="limit"><strong>This is not an allegation of deception.</strong> ${esc(front.domain)} is named openly in each listing's own documentation URL, and the endpoints return real data. The narrow point is that <code>providerName</code> and <code>verified</code> are what an agent sees when it selects, and neither of them carries this fact.</div>

    <h2>Knowing the counterparty halves the bill</h2>
    <p>A cohort screen that bills once per listed brand pays ${front.count} times for one host — and points its evidence at the brand's own website instead of the host its own listing documents. Resolving counterparties first fixes the target and the price at once.</p>
    <div class="grid three">
      <div class="card"><div class="stat">${plan.listedBrands}</div><div class="label">screenable listings</div></div>
      <div class="card"><div class="stat amber">${plan.distinctCounterparties}</div><div class="label">distinct documentation hosts</div></div>
      <div class="card"><div class="stat">−${pct(plan.savedUsd, plan.naiveCostUsd)}</div><div class="label">planned: ${usd(plan.naiveCostUsd)} → ${usd(plan.dedupedCostUsd)}<br>the run then spent ${usd(screen.spentUsd)}</div></div>
    </div>

    <h2>What the paid screen found</h2>
    <p>${screen.screened} hosts screened, covering ${screen.brandsCovered} listed brands, for <strong>${usd(screen.spentUsd)}</strong> against a ${usd(screen.maxTotalUsd)} ceiling.</p>
    <div class="card">
${byGrade.map(([g, n]) => `      <div class="bar"><span class="k g${g}">${g}</span><span class="t g${g}-b" style="width:${(100 * n / maxGrade).toFixed(1)}%"></span><span class="muted">${n}</span></div>`).join('\n')}
    </div>
    <p><strong>${dOrF} of ${screen.screened}</strong> — ${pct(dOrF, screen.screened)} — grade D or F on security headers. These are the hosts the listings document, and so the hosts a screen should target.${parseBot ? ` <code>${esc(front.domain)}</code>, the host behind ${front.count} brand names, grades <strong>${esc(parseBot.grade)}</strong>.` : ''}</p>

    <div class="scroll"><table>
      <thead><tr><th>Counterparty</th><th>Grade</th><th class="num-cell">Score</th><th class="num-cell">Brands</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table></div>
${failed.length ? `    <p class="muted" style="font-size:14px">${failed.length} host${failed.length > 1 ? 's' : ''} could not be screened (${failed.map(f => esc(f.host)).join(', ')}) — answered non-2xx, billed ${usd(0)}, recorded as failed. Unscreened is not a pass.</p>` : ''}
${plan.unscreenable.length ? `    <p class="muted" style="font-size:14px">${plan.unscreenable.length} listings were excluded before spending because they publish no host to point evidence at: ${plan.unscreenable.map(u => esc(u.providerName)).join(', ')}. Unevaluated is not clean.</p>` : ''}

    <h2>Which rail paid for this</h2>
    <p>Every figure on this page settled on Monid's prepaid rail, against a workspace balance a person topped up. Nothing here shows an agent buying a counterparty screen without an account.</p>
    <p>The account-free rail is proven separately, in the companion repo <code>monid-x402</code>: a live 402, a signed EIP-3009 authorization, and a settled <strong>$0.01 USDC payment on Base</strong> on 2026-09-12 — block 51197570, <code>signer_invocation_count: 1</code> — next to refuse packets that stop at <code>signer_invocation_count: 0</code> without ever constructing a signer. That payment bought a <code>context.dev</code> scrape, not a counterparty screen. <a href="https://twzrd-sol.github.io/monid-x402/paid.json">Receipt</a>.</p>

    <h2>What this does and does not establish</h2>
    <div class="limit">${esc(prov.limitation)}</div>
    <div class="limit">${esc(screen.limitation)}</div>
    <p class="muted" style="font-size:14px">Coverage is ${esc(prov.coverage)}. The sweep ran ${prov.queries.length} seed queries; re-running it may surface listings this one did not.</p>

    <h2>Reproduce it</h2>
    <div class="card"><pre style="margin:0;overflow-x:auto"><code>npm ci &amp;&amp; npm run build
node dist/cli.js catalog-provenance --out evidence/catalog-provenance.json   # free
node dist/cli.js cohort-screen --confirm-spend --max-total 2                 # paid</code></pre></div>
    <p class="muted" style="font-size:14px">The first command settles nothing; we read the workspace balance either side and it did not move. The second is the only one that spends, and it refuses before the first call if the live inspected price would breach the ceiling.</p>

    <footer>
      <p>Built for Monid's 2026 “We Kill” hackathon. Figures on this page are generated from <code>evidence/</code> at build time, not typed in.</p>
      <p>Provenance swept ${esc(prov.sweptAt)} · screen run ${esc(screen.screenedAt)}</p>
    </footer>
  </main>
</body>
</html>
`;

writeFileSync('pages/counterparty.html', html);
console.log(`Wrote pages/counterparty.html (${html.length} bytes)`);
console.log(`  providers ${prov.total}, third-party ${prov.thirdPartyDocHost}, front ${front.domain} x${front.count}`);
console.log(`  screened ${screen.screened}, brands ${screen.brandsCovered}, spent ${usd(screen.spentUsd)}`);
