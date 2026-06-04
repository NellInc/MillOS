> # DRAFT — NOT PUBLISHED — for owner review
> This document is an internal draft. It is **not** linked from, wired into, or published by the MillOS app. It exists only in `_audit/legal_drafts/` for the owner to review.
>
> **This is a template for informational purposes. Consult with a qualified attorney for legal advice specific to your situation.**

# MillOS — Cookies & Consent Assessment (DRAFT)

**Question:** Does MillOS need a cookie consent banner?
**Short answer:** A traditional **cookie** banner is almost certainly **not** required, because the app sets no cookies and its local storage is strictly functional. **However**, the more relevant question under the UK PECR / ePrivacy Directive and UK/EU GDPR is the remaining **third-party connections that fire on every page load** and transmit the visitor's IP — now just GitHub Pages (as host) and the jsDelivr font-glyph CDN, since Google Fonts and the DRACO decoder have been self-hosted. That, not cookies, is the issue worth a decision.

---

## 1. Does the app set cookies? No.

> **Verified in code:** there is **no use of `document.cookie`** anywhere in the source, and `index.html` sets no cookies. The app uses no cookie-based analytics, tag manager, or advertising SDK.

So there is no first-party cookie to consent to.

## 2. Does the app use local storage? Yes — functional only.

> **Note from code review:** the app persists settings and game state in `localStorage` under `millos-*` keys (e.g. `millos-settings`, `millos-game-simulation`, `millos-graphics`, `millos-ai-config`), and registers a **service worker** that caches static app files for performance/offline use. The in-game analysis loop also writes `vcp-outcome-tracker`, `vcp-pattern-store`, and `vcp-hypothesis-engine` keys (not prefixed `millos-`) automatically on every session.

Consent rules under PECR / the ePrivacy Directive apply to storing or accessing information on a user's device (which includes `localStorage` and service-worker caches), but they **exempt** storage that is **strictly necessary** to provide a service the user has explicitly requested.

**Honest nuance:** MillOS's `localStorage` is used to remember the user's own settings and game progress, and the service-worker cache holds the app's own files. These are functional/necessary to deliver the experience the user came for; there is **no** tracking, profiling, advertising, or cross-site identification. On that basis the storage is best characterised as **strictly necessary / functional and therefore exempt from consent**. The honest caveat: the "strictly necessary" exemption is interpreted narrowly, and regulators have not blessed every functional `localStorage` use by name. The risk here is low because none of it tracks the user, but a short, plain-language explanation in the privacy notice (already drafted, Section 5) is the appropriate treatment — not a consent wall.

## 3. The real issue: third-party connections on page load

Consent/transparency obligations are driven less by cookies than by **whose servers your browser contacts and what they receive**. MillOS contacts these third parties **unconditionally, on every visit, before any interaction**:

| Connection | What happens on load | Sets a cookie? |
|---|---|---|
| **GitHub Pages** (host) | Serves the site; sees the visitor IP/headers as host. | Not under the operator's control; GitHub Pages for static sites is not known to set tracking cookies, but GitHub is an independent controller for what it logs. |
| **jsDelivr font-glyph CDN** (`cdn.jsdelivr.net`) | The 3D text renderer (troika-three-text, used by `@react-three/drei <Text>`) fetches Unicode font-glyph data from jsDelivr on every visit, because the default scene's machine-label, zone-label, and holographic display `<Text>` components specify no local `font=` prop. | IP address and request headers sent to jsDelivr on every visit. |

> **Self-hosting completed:** Google Fonts ("Inter", "JetBrains Mono") and the DRACO 3D decoder are **no longer** contacted on load. Fonts are now delivered from `./assets/fonts/` via `@font-face` declarations in `src/fonts.css`, and the DRACO decoder is self-hosted from `public/draco/` (loaded via a local `${import.meta.env.BASE_URL}draco/` path in `src/utils/dracoLoader.ts`). Neither transmits visitor IP to Google any longer; only the connections in the table above remain unmitigated.

And these are contacted **only if the user uses an optional feature** (not on a plain visit): Google Gemini (`generativelanguage.googleapis.com`, only with a user-supplied key), the PeerJS Cloud (`0.peerjs.com`, only in multiplayer), and user-configured SCADA endpoints (WebSocket/MQTT/REST, only if the user enters an external endpoint in the SCADA panel — default is local simulation).

**Why the remaining every-visit connection matters:** the jsDelivr font-glyph CDN transmits visitor IP addresses before any user interaction. This is the same disclosure class as the *LG München* Google Fonts decision (Jan 2022) — the Google Fonts and DRACO decoder transfers that previously fell in this class have since been self-hosted and no longer fire. It is a **transparency / data-transfer** matter, not a cookie-consent matter, and a consent banner would not address it. This assessment **discloses** the behaviour and recommends a fix; it does **not** assert that the current setup is unlawful.

## 4. Conclusion and recommendation

1. **No cookie banner is required.** The app sets no cookies, and its `localStorage` / service-worker storage is strictly-necessary/functional, not tracking. A consent banner would be misleading (implying cookies that don't exist) and is not warranted.
2. **Do disclose the third-party connections** in the privacy notice (done in the draft), clearly separating *every-visit* connections (GitHub Pages as host, jsDelivr font glyphs) from *opt-in* ones (Gemini, multiplayer, SCADA external endpoints). Google Fonts and the DRACO decoder have been self-hosted and no longer appear here.
3. **Recommended technical fix (the highest-value remaining action):** Google Fonts and the DRACO decoder have been self-hosted. The highest-value remaining action is to eliminate the jsDelivr connection by supplying a local `font=` prop on all `<Text>` components, so the page makes no third-party IP transfers on load.
4. **Also recommended:** add a SCADA disclosure to the privacy notice covering user-configured external endpoints (WebSocket/MQTT/REST). Already added to the privacy notice draft Section 4.3.

> **Implementation note (self-hosting fonts — completed):** the Inter and JetBrains Mono `woff2` files have been bundled into the app (under `src/assets/fonts/`) and declared with `@font-face` in `src/fonts.css`; there are no `fonts.googleapis.com` / `fonts.gstatic.com` `<link>` tags in `index.html`. The DRACO decoder is likewise self-hosted from `public/draco/`. The MedievalSharp 3D-scene font is also loaded locally. The remaining open item is supplying a local `font=` prop on the 3D `<Text>` components to remove the jsDelivr glyph fetch.

---

*End of DRAFT cookies & consent assessment.*
