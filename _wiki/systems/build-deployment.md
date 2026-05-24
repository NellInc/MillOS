# Build and Deployment

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS is a React/Three.js application built with Vite. The repo serves a static `dist/` output at a CNAME-configured domain. A `scada-proxy/` directory suggests a proxy server for SCADA protocol bridging. Build artifacts go to `dist/`. (vite.config.ts; CNAME; scada-proxy/)

## Build Stack

- **Bundler**: Vite (`vite.config.ts`)
- **TypeScript config**: `tsconfig.json` (strict), `tsconfig.typecheck.json` (type-check only, no emit)
- **CSS**: Tailwind v4 (`tailwind.config.js`, `postcss.config.js`). Known issue: Tailwind v4 CSS layer ordering causes conflicts with Three.js canvas — documented in [[millos:systems/graphics-rendering]].
- **Entry**: `index.html` at repo root; `src/main.tsx`

## Output

`dist/` — built output. `CNAME` at repo root — custom domain configuration (for GitHub Pages or equivalent static host).

## SCADA Proxy

`scada-proxy/` — standalone proxy server for SCADA protocol adapters. Runs independently of the main Vite build. Provides the bridging layer for [[millos:systems/scada-layer]] adapters that connect to real OT systems.

## Scripts

Utility Python scripts at repo root:
- `analyze-useMillStore.cjs` — analyzes useMillStore usage patterns
- `optimize_truckbay.py` — Truck Bay optimization analysis
- `split_ambient_details.py` — splits ambient detail assets

## Logs and Metadata

`logs/` — runtime logs. `metadata.json` — build or runtime metadata. `output/` — generated analysis output.

## Prototypes

`prototypes/` and `src/prototypes/` — experimental implementations not in the main build. Iteration surface for new systems before integration.

## Make Targets

From CLAUDE.md: `make format-fix` + `make python-format` for formatting; `make quick-fix` for automated lint fixes; `make validate-all` for full validation before release.

## Provenance

- Sources: `vite.config.ts` (filename), `tsconfig.json` (filename), `tailwind.config.js` (filename), `scada-proxy/` (directory), `CNAME` (file), repo root listing
- Last verified: 2026-05-23

## See Also

- [[millos:systems/scada-layer]] — SCADA adapters bridged by scada-proxy/
- [[millos:systems/graphics-rendering]] — Tailwind v4 CSS layer bug affecting Three.js
