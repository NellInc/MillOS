> # DRAFT — NOT PUBLISHED — for owner review
> This document is an internal draft. It is **not** linked from, wired into, or published by the MillOS app. It exists only in `_audit/legal_drafts/` for the owner to review, edit, and decide whether/how to publish.
>
> **This is a template for informational purposes. Consult with a qualified attorney for legal advice specific to your situation.**

# MillOS — Privacy Notice (DRAFT)

**Last updated:** [OWNER DECISION — effective date]
**Operator / data controller:** Nell Watson [OWNER DECISION — individual or registered company; add legal identity and a rights-contact email]
**Service:** MillOS, a browser-based 3D grain-mill simulator at https://millos.net

---

## 1. The short version

MillOS runs entirely in your web browser. **The operator runs no server of its own, sets no cookies, creates no user accounts, and collects no personal data on any server it controls.** There is no MillOS database, no login, and no analytics or tracking in the app.

That does **not** mean nothing leaves your device. A client-side app still loads files and, for some features, talks directly to third parties. This notice explains exactly which third parties your browser may contact, and when. The honest distinction is between connections that happen on **every visit** and connections that happen **only if you choose** to use an optional feature.

---

## 2. What the operator collects: nothing server-side

The operator does not operate any backend, API, log server, or storage that receives your data. The operator therefore holds no personal data about you and cannot identify you. Game progress and settings are saved **locally in your own browser** (see Section 5); they are never transmitted to the operator.

> **Verified in code:** No analytics, tag manager, or tracking SDK is present in the source or the page (`index.html`). The app contains no first-party server endpoints.

---

## 3. Third parties your browser contacts on EVERY visit

These connections happen automatically when the page loads, before you interact with anything. Each recipient is an **independent data controller** for the data it receives, and your data is handled under **its** privacy policy, not the operator's.

> **Note on connection timing:** the entries in this table were checked against the code at the time of drafting. Connection timing can change with library updates; re-verify before publishing.

| Third party | Why | What it can see | Their policy |
|---|---|---|---|
| **GitHub Pages** (GitHub, Inc.) | Hosts and serves the website files. | As the host, GitHub processes connection data such as your **IP address** and request headers, per its own logging. | GitHub Privacy Statement: https://docs.github.com/site-policy/privacy-policies/github-privacy-statement |
| **jsDelivr font-glyph CDN** (`cdn.jsdelivr.net`) | The app's 3D text renderer (troika-three-text, used by `@react-three/drei <Text>`) fetches Unicode font-glyph data (`.woff` files + JSON) from jsDelivr's CDN on every visit, because the default machine-label, zone-label, and holographic display `<Text>` components specify no local `font=` prop. | Your **IP address** and request headers. | jsDelivr Privacy Policy: https://www.jsdelivr.com/privacy-policy-jsdelivr-net |

> **Note for the operator (GDPR-relevant):** The "Inter" and "JetBrains Mono" web fonts and the DRACO 3D decoder have **already been self-hosted** (fonts via `src/fonts.css` / local WOFF2 files; the DRACO decoder via `public/draco/`), removing the Google IP transfer that previously occurred at page load. The Google Fonts IP-transfer issue is the one addressed by the *LG München* ruling (2022); that exposure no longer applies here. The remaining every-visit third-party connection to remove is **jsDelivr**, which the 3D text renderer (troika-three-text) contacts for Unicode font-glyph data because the default `<Text>` components specify no local `font=` prop. **Recommended:** ship a local font for `<Text>` components (setting a `font=` prop) so no third-party IP transfer to jsDelivr occurs on load. See `COOKIES_ASSESSMENT.md`. [OWNER DECISION — self-host 3D-text font: yes/no]

---

## 4. Third parties contacted ONLY if you choose to use a feature

None of the following happens unless you take a specific action.

### 4.1 Google Gemini AI — only if you supply your own API key
MillOS has an optional AI mode. If (and only if) you enter your own Google Gemini API key in **Gemini AI Settings** and select "Gemini" or "Hybrid" mode:

- Your browser sends your **API key** and the current **simulation state** (a text summary of the virtual factory) **directly** to Google's Gemini API (`generativelanguage.googleapis.com`). It is **never** routed through any operator server.
- Google processes this under **your** agreement with Google and the Google Privacy Policy (https://policies.google.com/privacy) and the Gemini API / Google APIs Terms of Service.
- The "Heuristic" mode (the default) runs entirely on your device and sends **nothing** to Google.
- You are responsible for any usage costs Google charges against your key.

> **Verified in code:** the key is stored only in your browser's `localStorage` (key `millos-ai-config`) and used by an in-browser Google SDK call. There is no MillOS server in this path.
>
> **Security caution:** the API key is stored in `localStorage` in **plain text** (not encrypted). On a shared or public computer, treat it like any other credential: use **Clear Config** in the AI Settings panel when you finish, and consider revoking the key in Google AI Studio. Use a key scoped/limited to the minimum you need.

### 4.2 Multiplayer (peer-to-peer) — only if you join or host a room
If you start or join a multiplayer room:

- Connections use **WebRTC**, which is **peer-to-peer**. Your chosen **display name**, in-game **position**, and any **chat messages** are sent **directly to the other players** in your room — never to the operator.
- A **public signaling server** (the PeerJS Cloud, `0.peerjs.com`) is used only to help peers find each other. It can see the **room code** and connection/signaling metadata.
- Because WebRTC connects devices directly, **the other players in your room may be able to observe your IP address** (this is inherent to peer-to-peer connections). Only join rooms with people you are willing to connect to directly.
- Choose a display name that does not reveal more about you than you intend.

> **Verified in code:** signaling uses the public PeerJS cloud by default (`src/multiplayer/SignalingService.ts`); game data flows peer-to-peer, not through any operator backend.

### 4.3 SCADA / industrial-connection mode — only if you configure an external endpoint

MillOS includes a SCADA integration panel. By default it runs in **local simulation mode** and makes **no external connections**. If you enter an external endpoint in the SCADA panel (an OPC-UA, Modbus, MQTT broker, REST, or WebSocket URL), your browser will connect directly to that user-specified server and exchange machine-tag data with it. The operator has no visibility into, or control over, that connection — it goes from your browser to whichever server address you supply.

This opt-in connection is in the same disclosure class as the Gemini and multiplayer connections above: it happens only if you configure it, it bypasses any operator server, and the third party you connect to is its own independent data controller. The app's content-security policy deliberately allows broad `ws:`/`wss:` connections to support this feature.

> **Note for SCADA users:** you are responsible for understanding the privacy and security implications of the external SCADA endpoint you choose to connect to.

---

## 5. Local storage on your device (no cookies)

> **Verified in code:** the app sets **no cookies** (no `document.cookie` use anywhere in the source).

MillOS saves your settings and game progress in your browser's **`localStorage`**. This data stays on your device; the operator cannot read it. Most stored items are prefixed `millos-` and include, for example: `millos-ai-config` (AI mode + your Gemini key, if set), `millos-game-simulation`, `millos-settings`, `millos-graphics`, and several other `millos-*` keys for audio, UI, and simulation state. The app's in-game analysis loop also writes three `vcp-*` keys (`vcp-outcome-tracker`, `vcp-pattern-store`, `vcp-hypothesis-engine`) automatically on every session, and may create a `millos.stutterMonitor` debug key.

The app also registers a **service worker** that caches the site's files so it can load faster and work offline. Cached files are static app assets, not personal data.

### How to clear everything
Because of the service worker cache, clearing `localStorage` alone may not fully reset the app. To remove all locally stored MillOS data:
1. Open your browser's developer tools → **Application** (or **Storage**) tab.
2. Under **Local Storage**, delete the entries beginning `millos-` **and** `vcp-` (or use **Clear site data** — this is the most reliable path, as it removes all keys including `vcp-*` entries that a `millos-` filter alone would miss).
3. Under **Service Workers**, click **Unregister** for this site, then reload.

Alternatively, clearing the site's data / cache for `millos.net` in your browser settings achieves the same result. The in-app **Clear Config** button removes the stored AI configuration (including your Gemini key) specifically.

---

## 6. Children

MillOS is a general-audience simulator and is **not directed at children**. It collects no personal data on any operator-controlled server and asks for no age or identity information. [OWNER DECISION — optional minimum-age statement, e.g. "intended for users aged 13+"]

---

## 7. Your rights (UK GDPR / EU GDPR)

If you are in the UK or EU, the GDPR gives you rights over your personal data, including access, rectification, erasure, restriction, objection, and portability.

The practical position for MillOS is:

- **Against the operator:** the operator holds **no personal data** about you on any server it controls, so there is nothing for it to access, correct, export, or erase. You control the only data the app stores (the `millos-*` items in your browser) and can delete it yourself at any time using Section 5.
- **Against third parties:** for data they receive as independent controllers — **GitHub** (hosting/IP), **Google** (Gemini, only if you supply your own API key and use it), **jsDelivr** (3D-text font glyphs/IP on every visit), **SCADA endpoint operators** (if you configure one) — please exercise your rights with them directly via the policies linked above.
- **International transfers:** GitHub and Google are US-based; connections to them involve transfers outside the UK/EU, governed by their own safeguards and policies.

This notice is governed by **UK data protection law (UK GDPR and the Data Protection Act 2018)**. If you have a question, you may contact: **nell@ethicsnet.com**. You also have the right to complain to your data-protection authority (in the UK, the **ICO**, https://ico.org.uk).

---

## 8. Changes to this notice

This notice may be updated to reflect changes in the app or applicable law. The "Last updated" date at the top will change accordingly. [OWNER DECISION — version/effective-date handling]

---

*End of DRAFT privacy notice.*
