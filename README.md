# tool-audit

First-pass vendor evidence before an agent spends.

Built for Monid's 2026 "We Kill" Hackathon.

- Live demo: https://twzrd-sol.github.io/tool-audit/
- Measured receipts: https://twzrd-sol.github.io/tool-audit/receipt.html
- Reproducible snapshot: [`evidence/measured-demo.json`](evidence/measured-demo.json)

## What it replaces

Vendorapp's public Startup plan is **$149/month for 200 AI pre-screens**.
Its Basic plan includes **15 pre-screens free**.

`tool-audit` replaces one narrower workflow: collect live, before-spend vendor
evidence without buying a seat first. It does not replace continuous
monitoring, remediation, contracts, vendor lifecycle management, or human
judgment.

The measured demo used three live Monid calls:

| Purpose | Provider and endpoint | Cost |
| --- | --- | ---: |
| Retrieve the incumbent's current public offer | `context.dev:/web/scrape/markdown` | $0.0009 |
| Inspect target security headers | `api.strale.io:/x402/header-security-check` | $0.0594 |
| Inspect target cookie/consent evidence | `api.strale.io:/x402/v2/cookie-scan` | $0.1782 |
| **Measured total** | | **$0.2385** |

At 200 identical checks, raw Monid call cost would be $47.70 versus the
$149 subscription. That comparison excludes hosting and engineering, and the
product scopes are not identical.

## Safety boundary

The paid path is deliberately hard to trigger:

1. A Monid key must be supplied through `MONID_API_KEY`.
   Missing credentials fail closed; there is no fixture or simulated fallback.
2. Every required endpoint must appear in live `discover` results.
3. `inspect` must return a supported, bounded price and schema.
4. The local policy audits all three contracts before the first paid call.
5. Their advertised total must fit `--max-total`.
6. The CLI requires the literal `--confirm-spend` flag.
7. Every run must end `COMPLETED` with a 2xx provider response and a cost
   receipt.

`--max-total` is a preflight over inspected prices, not an atomic price lock.
For unattended production use, also configure Monid's workspace run cap in
the Monid dashboard so a price change between `inspect` and `run` is enforced
server-side.

Paid requests are never retried automatically. If transport fails before a
run ID is received, the client reports an ambiguous outcome and instructs the
operator to reconcile recent Monid runs before trying again.

Unknown evidence is never converted into approval. The measured cookie result
is explicitly limited: only partial HTML was analyzed and JavaScript-set
cookies were not observed. The combined demo verdict is therefore
`review_required`, not a green check.

## Install

```bash
npm ci
npm run build
npm test
```

Store the Monid credential outside the repository:

```bash
export MONID_API_KEY='monid_live_...'
```

`.env` files are ignored. Never commit the key.

Verify the saved run IDs and costs against Monid without creating a new paid
run:

```bash
npm run verify:evidence
```

## Free pre-spend path

Discovery, inspection, and local policy evaluation do not execute the selected
tool:

```bash
node dist/cli.js discover-audit "vendor security compliance"
```

Inspect and audit an exact endpoint:

```bash
node dist/cli.js audit api.strale.io:/x402/header-security-check
```

## Paid vendor pre-screen

This command makes three paid calls. It first checks the complete advertised
cost against a $0.24 ceiling:

```bash
node dist/cli.js prescreen https://monid.ai \
  --max-total 0.24 \
  --confirm-spend
```

Catalog prices can change. If their sum rises above the ceiling, the command
refuses before spending.

## Library use

```typescript
import { discoverInspectAndAudit, runVendorPrescreen } from 'tool-audit';

// Free: discover -> inspect -> local audit.
const preflight = await discoverInspectAndAudit('vendor security compliance');

// Paid: explicit confirmation and aggregate ceiling required.
const report = await runVendorPrescreen('https://example.com', {
  confirmSpend: true,
  maxTotalUsd: 0.24
});
```

## Local HTTP surface

```bash
npm start
```

- `GET /health`
- `GET /v1/demo` — the measured, non-secret receipt snapshot
- `POST /v1/audit` — local audit of a supplied Monid endpoint contract

There is intentionally no unauthenticated HTTP route that spends the server's
Monid balance.

## License

MIT
