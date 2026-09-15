# Submission post copy — extended round

`#monid` must appear in every post body, YouTube title or first description
line, and Instagram/TikTok caption. Do not put it only in a reply.

## The three lines

```text
Vendorapp Startup: $149/month for 200 AI pre-screens.
Monid, 62 providers resolved and 30 counterparties screened: $1.7820.
Total measured campaign spend across both runs: $2.0214.
```

Breakdown, if asked:

| Run | Date | Spend |
| --- | --- | ---: |
| v1 three-call vendor pre-screen chain | 2026-09-11 | $0.2385 |
| v1 earlier failed attempt (`01M272SPTD953E3M0WVHF2WSN2`) | 2026-09-11 | $0.0009 |
| v2 counterparty screen, 30 hosts covering 58 brands | 2026-09-15 | $1.7820 |
| **Total** | | **$2.0214** |

Provenance sweep, 409 endpoints surfaced and 62 providers inspected, cost
**$0.00** — discovery and inspection settle nothing. Workspace balance $22.46
before, $20.68 after; the $1.78 delta is the paid screen alone and matches the
receipts exactly.

## X / LinkedIn post

```text
We set out to undercut Vendorapp's $149/mo vendor pre-screens. We found something the price would never have caught.

Before an agent pays a vendor, the real question isn't what the check costs. It's who it's actually paying.

We asked that of Monid's own catalog. 25 free discovery queries surfaced 409 endpoints across 62 providers, and we read the documentation host on one listing per provider. Cost: $0.00.

30 of 62 document at a host that doesn't match the brand they advertise. 29 of those are the same host. 32 carry a "verified" tag while not documenting on their own domain.

Knowing the counterparty then halved the paid work: 59 listings collapse to 31 documentation hosts. Screening those planned $1.84 against $3.50 per brand name; the run spent $1.78 across 30 of them, one having answered HTTP 400 for $0. 16 of the 30 grade D or F on security headers.

Including the two suppliers our own first demo paid. Both F.

https://twzrd-sol.github.io/tool-audit/counterparty.html
#monid
```

## YouTube title

```text
29 AI vendors, one documentation host: reading 62 Monid listings for $0 #monid
```

## Short caption (Instagram / TikTok, only if a clean 9:16 cut exists)

```text
Checked where 62 AI data vendors document their endpoints. 30 point to a host that isn't the brand on the listing — and 29 of those point to the same one. The check cost $0.00.

Then screening 30 of those hosts cost $1.78, where screening all 59 brand names would have cost $3.50.
#monid
```

## Reply to Jasper's thread

```text
Thanks for the extension and the credits — both got used.

v1 undercut Vendorapp's first-pass evidence check on price. The extension went
after the question underneath it: before an agent pays a vendor, who is it
actually paying?

Answered across your catalog with discovery and inspection only, so it cost
nothing: 25 seed queries surfaced 409 endpoints across 62 providers, and we
read the documentation host on one listing per provider. 30 document at a host
that doesn't match the brand they assert, 29 of those at parse.bot, and 3
publish no docs at all.
32 of the 62 carry `verified` while not documenting on their own host. That's
a metadata observation, not an accusation — parse.bot is named openly in each
listing's own docUrl. The point is that providerName and the verified tag are
what an agent sees at selection time, and neither carries it.

That finding then paid for itself: deduplicating 59 listings onto 31
documentation hosts planned $1.8414 against $3.5046 per brand name, on work
that would otherwise have audited the wrong host 29 times. The run spent
$1.7820 across 30 of them, one having answered HTTP 400 for $0. 16 of those 30
grade D or F on security headers — including context.dev and strale.io, the two
suppliers our own v1 demo paid.

Total measured spend across both runs: $2.0214.

Links and the three lines below. Happy to hand over the per-provider
provenance data if it's useful to you — it's a map of your own marketplace's
metadata, and you may want it regardless of how this places.
```

## What we are not claiming

This screen settled on Monid's prepaid rail, not x402. No post may say or imply
that an agent bought a counterparty screen with no account and no human.

The x402 rail itself is proven separately in `monid-x402`: a settled $0.01 USDC
payment on Base on 2026-09-12, transaction `0x4a87dcf1…`, block 51197570,
`signer_invocation_count: 1`, next to refuse packets that stop at
`signer_invocation_count: 0`. It bought a context.dev scrape, not a
counterparty screen. Receipt: https://twzrd-sol.github.io/monid-x402/paid.json

The `counterparty-provenance` SKU is priced, schema'd and costed against
measured COGS, and has not been sold.

The provenance signal is a documentation host. It identifies who documents an
endpoint, not who operates it, receives payment, or holds the data. Coverage is
what 25 seed queries surfaced, not a full enumeration.

## Post registry

Register each URL within 24 hours. At least one registered post is required.

| platform | post URL | published | registered |
| --- | --- | --- | --- |
| X | | | |
| LinkedIn | | | |
| YouTube | | | |

## Registration status

Team `tool-audit`, member `TWZRD`, X handle `@twzrd_xyz`, Monid account
`zohaibmohd@utexas.edu`. Registered target is Vendorapp's published $149/month
offer. Report **$2.0214** as the measured campaign cost.
