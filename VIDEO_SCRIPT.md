# Submission video

Final export:

- Duration: **56.496 seconds**
- Format: H.264 video + AAC audio in MP4
- Resolution: 1280×720
- Captions: burned in
- File: `tool-audit-submission.mp4` (kept outside Git)

## Frames

1. `0:00–0:03` — tool-audit outcome
2. `0:03–0:10` — Vendorapp's live public pricing page
3. `0:10–0:32` — three completed Monid receipts and measured cost
4. `0:32–0:51` — evidence, uncertainty, and `review_required`
5. `0:51–0:57` — live demo and source call to action

## Narration

> Vendorapp charges 149 dollars a month. We replaced its first-pass check
> with three Monid calls costing 23 cents. Context dot dev retrieves the
> current price for nine hundredths of a cent. Then Strale measures security
> headers for 5.94 cents, and cookie-consent evidence for 17.82 cents. Total
> measured cost: 23.85 cents, before an agent spends on the downstream tool.
> The report found six missing headers and refused to call the cookie result
> clean, because JavaScript cookies and full HTML were not verified. The
> answer is review required. Narrower workflow; not a full Vendorapp
> replacement. Check the measured snapshot and source. Hashtag Monid.

Public pages are static measured snapshots from 2026-09-11, not live queries.
Show the actual discovery queries (`extract web page content`, `website
security headers`, `website cookie consent scan`), not
`monid discover -q "vendor security pre-screen"`.

## Public surfaces shown

- https://vendorapp.co/pricing/
- https://twzrd-sol.github.io/tool-audit/receipt.html
- https://twzrd-sol.github.io/tool-audit/
