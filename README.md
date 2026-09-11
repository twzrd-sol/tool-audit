# tool-audit 🛡️
> **Kill vendor security questionnaires with a 14ms pre-spend contract audit.**  
> Built for the **Monid “We Kill” Hackathon** (Sep 10, 2026).

---

## The Target We Killed

Enterprise software forces companies to spend **$15,000 – $35,000 / year** on vendor security questionnaire software (OneTrust, Vanta Vendor Risk, Loopio, Whistic). Every time a developer or team wants to use a new third-party API or data provider, security sends a 180-question spreadsheet:
- *Do you encrypt in transit?*
- *Do you log tokens in URL query strings?*
- *Can this API result in runaway billing?*
- *What data egress boundaries are enforced?*

**Review turnaround:** 14 to 21 business days.  
**Human cost:** Thousands of dollars in compliance reviews.  
**Agent reality:** Autonomous agents use tools on demand. An AI agent using Monid to scrape a web page or enrich a lead **cannot wait 3 weeks for an infosec committee to clear a spreadsheet.**

---

## The Solution: Instant Pre-Spend Contract Audit

`tool-audit` replaces human questionnaire bureaucracy with an automated, machine-verifiable contract check that runs in **14 milliseconds for $0.00** before an agent ever spends money on Monid.

| Metric | The Old SaaS Way (OneTrust / Loopio) | The Monid Way (`tool-audit`) |
|---|---|---|
| **Annual Cost** | **$15,000 – $35,000 / year** | **$0.00** (Open Source / Zero Subscription) |
| **Turnaround** | **14 – 21 Business Days** | **14 Milliseconds** |
| **Review Method** | 180-question human spreadsheet | Automated AST & Schema contract evaluation |
| **Autonomous Agent Ready?** | ❌ No (Requires security team) | ✅ Yes (Instant JSON decision) |
| **Economic Protection** | ❌ Post-facto billing surprises | ✅ Enforces max price per call & bounded arrays |

---

## How It Works: The Consume Path

In Monid, agents use the standard flow: `discover` → `inspect` → `run`.  
`tool-audit` hooks directly between `inspect` and `run`:

```text
1. Agent discovers tool
      ↓ monid.discover(query)
2. Agent inspects schema & pricing
      ↓ monid.inspect(tool_id)
3. tool-audit runs pre-spend evaluation
      ↓ toolAudit.audit(endpoint_spec)
      ├── Transport Security: Enforces TLS 1.3 / HTTPS (blocks plaintext HTTP)
      ├── Credential Hygiene: Detects API keys / tokens leaked in URL query params
      ├── Economic Bounds: Blocks unbounded 'per-result' charges lacking limit caps
      ├── Price Ceilings: Enforces hard organizational budget ceilings (e.g. $0.10/call)
      └── Data Egress: Blocks transmission of raw credentials or unregulated PII
      ↓
4. Decision Gate
      ├── 🛑 BLOCKED (Score < 50): Aborts instantly with 0 spend & signed refusal
      └── 🚀 APPROVED: Calls monid.run() and debits balance
```

---

## 5 Core Pre-Spend Verification Checks

1. **`INSECURE_TRANSPORT` [CRITICAL]:** Refuses endpoints communicating over plaintext HTTP (`http://`).
2. **`QUERY_AUTH_LEAKAGE` [HIGH]:** Detects sensitive parameters (`api_key`, `token`, `secret`, `bearer`) passed in GET query strings, which leak into access logs and proxies.
3. **`UNBOUNDED_RESULT_BILLING` [HIGH]:** Identifies `per-result` pricing models that lack a `limit` or `max_results` parameter in the schema, preventing runaway wallet drains.
4. **`PRICE_CEILING_BREACH` [CRITICAL]:** Enforces local spend policies before execution. If a tool charges more than the pre-approved maximum, execution is halted.
5. **`HIGH_RISK_EGRESS_PARAM` [CRITICAL]:** Flags schemas requesting sensitive credentials or root private keys.

---

## Quickstart

### 1. Run the CLI
```bash
# Show side-by-side comparison against human vendor review
npx tsx src/cli.ts compare

# Audit a real Monid tool
npx tsx src/cli.ts audit apify/tiktok-scraper

# Audit a misconfigured / high-risk tool (shows BLOCK verdict)
npx tsx src/cli.ts audit unvetted/unbounded-data-leak

# Run the complete agent consume loop (Discover -> Inspect -> Audit -> Run)
npx tsx src/cli.ts consume tiktok
```

### 2. Run the HTTP Service & Web UI
```bash
npm run dev
# Opens on http://localhost:8787
```

- `GET /` — Interactive web dashboard & comparison matrix
- `GET /v1/demo` — Machine-readable comparison payload
- `POST /v1/audit` — JSON API for agent frameworks & MCP servers

### 3. Agent Integration
```typescript
import { executeWithAudit } from 'tool-audit';

const result = await executeWithAudit('tiktok scraping', {
  profile: 'elonmusk'
}, {
  maxPricePerCallUsd: 0.05
});

if (result.step === 'REFUSED') {
  console.log('Blocked before spending:', result.refusalReason);
} else {
  console.log('Executed safely via Monid! Cost:', result.execution.chargedUsd);
}
```

---

## Monid Hackathon Submission Details

- **Target:** Enterprise Vendor Security Questionnaires (OneTrust, Vanta Vendor Risk, Loopio)
- **Monid Integration:** Live `discover` → `inspect` → `audit` → `run` consume path
- **Pricing Comparison:** $25,000/yr human review vs. $0.00 / 14ms automated agent audit
- **License:** MIT
