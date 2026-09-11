# 60-Second Video Script: `tool-audit` 🛡️
**Monid "We Kill" Hackathon Submission**  
**Target Duration:** ~65 seconds (Hard limit: < 90 seconds)

---

### [0:00 – 0:15] The Hook & The Incumbent
**Visual:** Show OneTrust / Vanta Vendor Risk pricing page or an ugly 180-question Vendor Security Questionnaire spreadsheet on screen.  
**Voiceover:**  
> *"In enterprise software, whenever an engineer wants to call a third-party API, security hands them a 180-question vendor risk questionnaire. It costs $25,000 a year for OneTrust or Vanta, and it takes 3 weeks of human review before anyone can make a single request.*  
> *For autonomous AI agents calling tools on Monid, a 3-week human questionnaire is a non-starter. So we killed it."*

---

### [0:15 – 0:40] The Kill: Terminal Demo
**Visual:** Terminal showing `tool-audit` running live.  
**Action 1:** Run `tool-audit compare`  
**Voiceover:**  
> *"Meet `tool-audit`. We replaced the 21-day questionnaire with a 14-millisecond automated pre-spend contract audit for $0.00."*

**Action 2:** Run `tool-audit audit apify/tiktok-scraper`  
**Voiceover:**  
> *"When an agent discovers a tool on Monid, `tool-audit` inspects the contract before spending a single cent. It checks transport encryption, credential hygiene, and pricing ceilings. Apify TikTok scraper? Approved in 12 milliseconds for $0.0057 per call."*

**Action 3:** Run `tool-audit audit unvetted/unbounded-data-leak`  
**Voiceover:**  
> *"Now watch what happens when an endpoint leaks an API key in the query string or has an unbounded per-result multiplier: Instantly BLOCKED. Zero dollars spent, wallet protected, and a cryptographic refusal card issued."*

---

### [0:40 – 0:55] Live Web Surface & Architecture
**Visual:** Switch to browser showing `https://rental-registered-graph-nec.trycloudflare.com` with the live audit matrix and API docs.  
**Voiceover:**  
> *"It's live right now at our public HTTPS endpoint. Any agent framework can call our POST /v1/audit API or import the SDK directly into their Monid consume loop: Discover, Inspect, Audit, Run."*

---

### [0:55 – 1:05] The Outro
**Visual:** Split screen showing:  
- Left: OneTrust $25,000 / 21 Days  
- Right: tool-audit $0.00 / 14 Milliseconds  
**Voiceover:**  
> *"OneTrust charges $25,000 a year for human bureaucracy. `tool-audit` gives agents instant trust for zero dollars. We killed vendor questionnaires."*

---

## Recording Checklist:
1. Terminal open with clean font (e.g., JetBrains Mono 16pt).
2. Browser tab open to `https://rental-registered-graph-nec.trycloudflare.com`.
3. Commands ready to paste:
   ```bash
   node dist/cli.js compare
   node dist/cli.js audit apify/tiktok-scraper
   node dist/cli.js audit unvetted/unbounded-data-leak
   ```
4. Export as MP4 (< 90 seconds).
