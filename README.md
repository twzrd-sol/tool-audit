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
**$0.2394** cumulative, **$0.0006** under the $0.24 ceiling. That $0.2385
retry is the final paid E2E. Do not spend again for this submission.

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
| **Total measured campaign spend** | | **$0.2394** |

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
per-call cost against a $0.24 ceiling. Do not re-run it for this submission;
the measured $0.2385 chain is the final paid E2E. Campaign spend is $0.2394.

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
