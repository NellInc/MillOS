# Legal Drafts — MillOS (DRAFT, NOT PUBLISHED)

**Nothing here is published, linked from, or wired into the MillOS app.** These are internal drafts for the owner (Nell Watson) to review, edit, and decide on. Each file carries a "DRAFT — NOT PUBLISHED" banner and the standard "consult a qualified attorney" disclaimer.

| File | What it is |
|---|---|
| `PRIVACY_NOTICE_DRAFT.md` | UK/EU-GDPR-aware privacy notice. Core point: operator collects nothing server-side; discloses third parties the browser contacts on **every visit** (GitHub Pages host, Google Fonts, DRACO decoder via gstatic, jsDelivr font glyphs) vs **only on opt-in** (Gemini with user's own key, PeerJS multiplayer, SCADA external endpoints). Covers `localStorage` (`millos-*` and `vcp-*` keys), service-worker cache, how to fully clear data, and rights calibrated to "operator holds no data". |
| `TERMS_OF_USE_DRAFT.md` | Short, honest ToS: fictional/educational simulator, **not** real SCADA/industrial-control/safety software; MIT licence (code) vs hosted-app terms; user bears own Gemini API costs; no warranty; liability limitation. |
| `COOKIES_ASSESSMENT.md` | Assessment: **no cookie banner needed** (app sets no cookies; `localStorage` is strictly-necessary/functional). The real GDPR point is three unconditional IP transfers on load: Google Fonts, DRACO decoder (gstatic), and jsDelivr font glyphs — recommends self-hosting all three. |

**Remaining [OWNER DECISION] items (collected):**
- Legal identity of controller (individual vs. company) + rights-contact email.
- Governing law and jurisdiction/venue (owner is UK-based; left open).
- Liability-cap approach.
- Effective date / version handling.
- Self-host Google Fonts + DRACO decoder + `<Text>` local font (recommended): yes/no.
- Optional minimum-age statement.

**Verification basis:** factual claims were checked against the repo at time of drafting (no analytics/cookies; `millos-ai-config` plaintext key; PeerJS public signaling; DRACO from `www.gstatic.com`; CSP host list; service worker present; `vcp-*` localStorage keys; troika `<Text>` jsdelivr fetch). Re-verify if the code changes before publishing; connection-timing claims in particular depend on default-scene component rendering and library internals.

---

## Correction log

**2026-06-04 — L10 audit findings applied**

| What | Why |
|---|---|
| DRACO/gstatic moved from Section 4.3 (opt-in) to Section 3 (every-visit) in PRIVACY_NOTICE_DRAFT.md | `dracoLoader.ts:49` calls `preload()` eagerly; `WorkerModel.tsx:46` and `ForkliftModel.tsx:48` call `useDracoGLTF` in the default scene, so the gstatic IP transfer fires on every page load (L10_s0 finding 1, L10_s1 finding 2). |
| DRACO/gstatic likewise moved to every-visit table in COOKIES_ASSESSMENT.md; "only unconditional Google IP transfer" wording corrected | Same root cause — it is a second unconditional Google transfer alongside Google Fonts (L10_s0 finding 3, L10_s1 finding 3). |
| jsdelivr recharacterised: removed "physics/WebAssembly" description, moved from opt-in to every-visit in both documents | Rapier WASM is bundled locally; the real jsdelivr contact is `troika-three-text` / `unicode-font-resolver` fetching font-glyph data for unstyled `<Text>` components in `Machines.tsx`, `ZoneLabels.tsx`, `HolographicDisplays.tsx` — fires on default scene load (L10_s0 finding 2). |
| Added Section 4.3 SCADA disclosure to PRIVACY_NOTICE_DRAFT.md; added SCADA to opt-in list in COOKIES_ASSESSMENT.md | `ConnectionConfig` (`src/scada/types.ts`) supports user-supplied WebSocket/MQTT/REST/OPC-UA endpoints; adapters open browser connections to those URLs; CSP allows broad `ws:`/`wss:`. Default is local simulation (opt-in). Neither document previously disclosed this external-connection class (L10_s0 finding 4). |
| localStorage prefix claim corrected: "all prefixed millos-" → "mostly millos-*, also vcp-* keys" | `vcp-outcome-tracker`, `vcp-pattern-store`, `vcp-hypothesis-engine` written by the VCP update loop (starts unconditionally on app mount); `millos.stutterMonitor` debug key also exists. Cleanup instructions updated to note `vcp-*` filter needed alongside `millos-` (L10_s1 finding 1). |
| "Verified in code" framing softened on connection-timing claims in Section 3 note | The DRACO/jsdelivr timing was previously labelled implicitly verified; it was wrong. Replaced with a note that connection timing should be re-verified before publishing (L10_s0 finding 5). |
