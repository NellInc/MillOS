# Build and Deployment

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

MillOS builds the browser application with Vite and deploys static output from
`dist/`. The optional `scada-proxy/` is a separately built Node service for OPC
UA and Modbus ownership. Static publication, proxy image publication, and
Kubernetes deployment use distinct workflows and authority gates.

## Maintained commands

- `npm run typecheck`, production and test TypeScript contracts
- `npm run lint` and `npm run format:check`, maintained source and tooling
- `npm test` and `npm run test:coverage`, deterministic behavior and coverage
- `npm run check:dead-code`, scoped reachability, dependency, and cycle gate
- `npm run validate:assets`, `validate:credits`, `validate:security`,
  `validate:depth`, `validate:shaders`, and `validate:bundle`
- `npm run build`, production Vite output
- `npm --prefix scada-proxy run build`, proxy compilation

Generated runtime evidence belongs under ignored `test-results/`. A build or
source check does not establish browser behavior, plant safety, rights, or
publication approval.

## Workflows

- `.github/workflows/ci.yml`, deterministic repository validation
- `.github/workflows/deploy.yml`, static Pages deployment
- `.github/workflows/docker.yml`, validated and scanned proxy image publication
- `.github/workflows/release.yml`, tag-matched deterministic release archive
- `.github/workflows/deploy-k8s.yml`, authenticated single-owner proxy rollout

Actions are commit pinned and checkout credential persistence is disabled. The
Kubernetes base deliberately runs one replica because the process owns stateful
industrial connections. Availability scaling requires leader election or
endpoint partitioning first.

## SCADA proxy boundary

`scada-proxy/src/index.ts` exposes authenticated REST and WebSocket services.
Production requires separate read and write credentials, exact browser origins,
explicit write enablement, and encrypted OPC UA configuration. Kubernetes base
manifests live under `scada-proxy/k8s/`; site ingress, egress, secrets, PKI, and
tag mapping remain environment-owned overlays.

## Provenance

- Sources: `package.json`, `.github/workflows/`, `vite.config.ts`,
  `scada-proxy/package.json`, `scada-proxy/k8s/`
- Last verified: 2026-08-13

## See Also

- [[millos:systems/scada-layer]]
- [[millos:systems/testing-infrastructure]]
- [[millos:systems/graphics-rendering]]
