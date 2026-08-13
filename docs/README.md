# MillOS Documentation

This directory contains maintained operational guidance, subsystem references,
research specifications, historical audits, and continuation records. A dated
historical banner means the document preserves evidence and should not be used
as a current source map.

## Maintained guidance

| Document                                          | Purpose                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| [Repository README](../README.md)                 | Product overview, current architecture, setup, and controls          |
| [Architecture](./architecture.md)                 | High-level application and protocol boundaries                       |
| [Development](./development.md)                   | Supported Node versions, local workflow, conventions, and validation |
| [Deployment](./deployment.md)                     | Static application and optional SCADA proxy deployment               |
| [Multiplayer](./multiplayer.md)                   | Current host-authoritative PeerJS trust model                        |
| [AI integration](./ai-integration.md)             | Session-only Gemini key and local fallback behavior                  |
| [Visual fidelity loop](./VISUAL_FIDELITY_LOOP.md) | Candidate-bound art and operational capture workflow                 |
| [Security policy](../SECURITY.md)                 | Reporting, supported surfaces, and industrial boundary               |
| [SCADA proxy README](../scada-proxy/README.md)    | Proxy configuration and local operation                              |

## Historical and design references

The component, 3D scene, audio, safety, state-management, GPU-resource, SCADA
plan, audit, migration, and refactoring documents record earlier designs or
point-in-time evidence. Their banners and dates define their authority. The
current source tree and the exhaustive improvement ledgers under
`../_contprompts/` take precedence when a historical file disagrees.

## Current entry points

- Application: `src/App.tsx`
- Authored scene: `src/components/MillScene.tsx`
- Operational UI: `src/components/DeferredOperationalUI.tsx`
- Stores: `src/stores/`
- Browser SCADA: `src/scada/`
- Protocol proxy: `scada-proxy/src/index.ts`
- Multiplayer: `src/multiplayer/`
- Deterministic checks: `package.json` scripts and `.github/workflows/ci.yml`

Current application version: **v0.40**
