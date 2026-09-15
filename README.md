# tool-audit

First-pass vendor evidence before an agent spends on the downstream tool.

Built for Monid's 2026 "We Kill" Hackathon.

- Measured snapshot (static, 2026-09-11): https://twzrd-sol.github.io/tool-audit/
- Snapshot receipts: https://twzrd-sol.github.io/tool-audit/receipt.html
- Canonical snapshot: [`evidence/measured-demo.json`](evidence/measured-demo.json)

Those GitHub Pages files are **static measured snapshots**, not a live Monid
query. They reprint the 2026-09-11 retry. Re-verify locally with
`npm run verify:snapshot` (no network) or `npm run verify:evidence`
(read-only Monid `runs get`, no new spend).

A prior $0.0009 pricing-only attempt plus this $0.2385 retry settled at
**$0.2394** cumulative, **$0.0006** under the $0.24 ceiling. That closed the
first submission.

The hackathon was then extended and $20 of Monid credit was granted, so a
second measured run followed on 2026-09-15 at **$1.7820** — see the update
below. **Total measured campaign spend across both runs: $2.0214.** Workspace
balance $22.46 before, $20.68 after; receipts and balance agree.

## Update, 2026-09-15: who are you actually paying?

The first pass asked what a vendor check costs. That is the cheap question.
Before an agent pays, the harder one is who will answer the call.

A Monid discovery result gives an agent a brand name and often a `verified`
tag. Neither names the operator. The closest thing Monid publishes is the
documentation URL on the listing, so we read one per provider.

Swept with discovery and inspection only — 25 seed queries surfaced **409
endpoints across 62 providers**, and we inspected **one endpoint per provider,
62 in all**, for **$0.00**. Workspace balance $22.46 before and $22.46 after:

| | Count | Share |
| --- | ---: | ---: |
| Documented on their own host | 29 | 47% |
| Documented at a host that does not match the brand asserted | **30** | 48% |
| No documentation URL at all | 3 | 5% |
| Carrying `verified` while not documenting on their own host | **32** | 52% |

Read that last row with its base rate: `verified` is on **58 of the 62**
listings, 94%, including 26 of the 29 that do document on their own host. The
tag is not a discriminator. It appears either side of the split, so it cannot
tell an agent which side a listing is on.

Of the 30 mismatches, **29 document at a single host**, `parse.bot`. An agent
selecting Nasdaq, Crunchbase, G2, Trustpilot, Zillow, Indeed, Y Combinator,
Yahoo Finance, Capterra or Wellfound by name gets a listing documented at the
same place. We call that host the listing's counterparty: the host a screen
should be pointed at. It is evidence about who stands behind the endpoint, not
proof of who operates it or receives the payment.

This is not an allegation of deception. `parse.bot` is named openly in each
listing's own documentation URL. We called none of these endpoints, so we make
no claim about the data they return. The narrow point is that `providerName`
and `verified` are what an agent sees when it selects, and neither carries this
fact.

### Knowing the counterparty halves the paid work

A cohort screen billing once per listed brand pays 29 times for one host, and
points its evidence at the brand's website instead of the host its own listing
documents. Resolving counterparties first corrects the target and the price
together.

| | |
| --- | ---: |
| Screenable listings | 59 |
| Distinct documentation hosts | **31** |
| Naive per-brand cost | $3.5046 |
| Counterparty-deduplicated cost | **$1.8414** |

Measured run: 31 targets, **30 screened**, 1 failed, **58 brands covered for
$1.7820** against a $2.00 ceiling. `api.kadec0.xyz` answered HTTP 400, was
billed $0.00, and is recorded failed — a non-2xx is not evidence.

Security-header grades across those 30 documentation hosts:

| A | B | C | D | F |
| ---: | ---: | ---: | ---: | ---: |
| 6 | 1 | 7 | 5 | **11** |

**16 of 30 — 53% — grade D or F.** `parse.bot`, the host behind 29 brand
names, grades C.
`context.dev` and `strale.io` — the two suppliers the frozen v1 demo itself
paid — both grade **F**. Each host was screened at its registrable domain, so
for Strale that is `https://strale.io`, not the `api.strale.io` host that
actually served the v1 call.

Full write-up: <https://twzrd-sol.github.io/tool-audit/counterparty.html>

```bash
node dist/cli.js catalog-provenance --out evidence/catalog-provenance.json   # free
node dist/cli.js cohort-screen --confirm-spend --max-total 2                 # paid
node scripts/market-scan.mjs                                                 # free
```

### What this does not establish

A documentation host identifies who documents an endpoint, not who operates
it, receives payment, or holds the data. A matching host is not proof of
first-party operation; it only means this signal raised no mismatch. A passing
header grade is not an approval to spend. Undocumented listings are returned
unevaluated, and unevaluated is not clean. Coverage is what 25 seed queries
surfaced, not a guaranteed enumeration of the catalog.

### Which rail paid for this

Every figure above settled on Monid's prepaid rail against the workspace
balance. None of it was bought over x402, so nothing here demonstrates an agent
buying a counterparty screen without an account.

The x402 rail itself is proven separately in the companion repo `monid-x402`:
a live 402, a signed EIP-3009 authorization, and a settled **$0.01 USDC payment
on Base** on 2026-09-12 — transaction `0x4a87dcf1…`, block 51197570,
`signer_invocation_count: 1` — alongside refuse packets that end at
`signer_invocation_count: 0` without ever constructing a signer. That payment
bought a `context.dev` scrape. Receipt:
<https://twzrd-sol.github.io/monid-x402/paid.json>

The `counterparty-provenance` SKU defined there is priced, schema'd and costed
against measured COGS. It has not been sold. No agent has bought a counterparty
screen over x402.

## What it replaces

Vendorapp's public Startup plan is **$149/month for 200 AI pre-screens**.
Vendorapp Basic includes **15 AI pre-screens per month, always free**.

This replaces first-pass evidence collection before downstream tool spend—not
monitoring, remediation, contracts, or human review. It is not a full
Vendorapp replacement.

The measured snapshot used three live Monid calls:

| Purpose | Provider and endpoint | Cost |
| --- | --- | ---: |
| Retrieve the incumbent's current public offer | `context.dev:/web/scrape/markdown` | $0.0009 |
| Inspect target security headers | `api.strale.io:/x402/header-security-check` | $0.0594 |
| Inspect target cookie/consent evidence | `api.strale.io:/x402/v2/cookie-scan` | $0.1782 |
| **Successful three-call chain** | | **$0.2385** |
| Earlier failed/ambiguous attempt (`01M272SPTD953E3M0WVHF2WSN2`) | `context.dev:/web/scrape/markdown` | $0.0009 |
| **v1 measured subtotal** | | **$0.2394** |

200 repetitions at those measured rates would cost **$47.70**. Those
repetitions are not equivalent to 200 Vendorapp AI pre-screens. Hosting and
engineering are excluded.

Discovery queries used for the measured run:

```text
extract web page content
website security headers
website cookie consent scan
```

## Safety boundary

The paid path is deliberately hard to trigger:

1. A Monid key must be supplied through `MONID_API_KEY`.
   Missing credentials fail closed; there is no fixture or simulated fallback.
2. Every required endpoint must appear in live `discover` results.
3. `inspect` must return the requested identity, `PER_CALL` USD pricing, and a
   typed schema.
4. The local policy audits all three contracts before the first paid call.
5. Their advertised per-call total must fit `--max-total`.
6. The CLI requires the literal `--confirm-spend` flag.
7. Every run must end `COMPLETED` with an explicit 2xx provider HTTP status
   and a USD cost receipt.

`--max-total` is a preflight over inspected per-call prices, not an atomic
price lock. For unattended production use, also configure Monid's workspace
run cap in the Monid dashboard so a price change between `inspect` and `run`
is enforced server-side.

Paid requests are never retried automatically. If transport fails before a
run ID is received, the client reports an ambiguous outcome and instructs the
operator to reconcile recent Monid runs before trying again.

Unknown evidence is never converted into approval. The measured cookie result
is explicitly limited: only partial HTML was analyzed and JavaScript-set
cookies were not observed. The combined snapshot verdict is therefore
`review_required`, not a green check.

## Quickstart

Requires **Node 20+** and the committed `package-lock.json`. The documented
install path is `npm ci` (npm 10.9.2 via `packageManager`). Do not use a
lockfile-free `npm install` if you want a reproducible tree.

```bash
git clone https://github.com/twzrd-sol/tool-audit.git
cd tool-audit
npm ci
npm test
node dist/cli.js compare
```

`npm test` builds, runs the local suite, and checks
`evidence/measured-demo.json` without calling Monid. The package is not
published to npm; inspect the local tarball with `npm run pack:check`.

Store a Monid credential outside the repository only if you intend to
reconcile saved run IDs or make a new paid run:

```bash
export MONID_API_KEY='monid_live_...'
```

`.env` files are ignored. Never commit the key.

Read-only reconciliation of the saved receipts (no new spend):

```bash
npm run verify:evidence
```

## Non-executing preflight

Discovery, inspection, and local policy evaluation do not execute the selected
tool. They still require a Monid API key. They are not claimed as a
zero-balance operation unless Monid documents that separately.

```bash
node dist/cli.js discover-audit "vendor security compliance"
node dist/cli.js audit api.strale.io:/x402/header-security-check
```

## Paid vendor pre-screen

This command makes three paid calls. It first checks the complete advertised
per-call cost against a $0.24 ceiling. The measured $0.2385 chain is the final
paid run of the v1 pre-screen; its subtotal is $0.2394. The 2026-09-15
counterparty screen added $1.7820, for a campaign total of $2.0214.

```bash
node dist/cli.js prescreen https://monid.ai \
  --max-total 0.24 \
  --confirm-spend
```

Catalog prices can change. If their sum rises above the ceiling, the command
refuses before spending.

## Library use

After `npm ci && npm run build` in this clone:

```typescript
import { discoverInspectAndAudit, runVendorPrescreen } from './dist/index.js';

const preflight = await discoverInspectAndAudit('vendor security compliance');

const report = await runVendorPrescreen('https://example.com', {
  confirmSpend: true,
  maxTotalUsd: 0.24
});
```

The package is not published to npm. Use the local `./dist/index.js` entry or
`npm pack` / `npm link` from this repository.

## Local HTTP surface

```bash
npm start
```

- `GET /health`
- `GET /v1/demo` — the measured snapshot from `evidence/measured-demo.json`
- `POST /v1/audit` — local audit of a supplied Monid endpoint contract

There is intentionally no unauthenticated HTTP route that spends the server's
Monid balance.

## License

MIT
