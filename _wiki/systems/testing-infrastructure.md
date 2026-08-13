# Testing Infrastructure

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-12 -->
<!-- wiki:status = active -->

## Summary

MillOS separates deterministic source tests, browser journeys, bundle and asset gates, native runtime benchmarks, and authored visual review. Each evidence class has its own command and does not substitute for another. (package.json:6-38; playwright.config.ts:7-73; vitest.config.ts:5-42)

## Deterministic source tests

Vitest discovers test and spec files under src/, runs in jsdom, and executes one fork at a time because the suite imports large Three.js modules. (vitest.config.ts:7-16) The setup entry is src/test/setup.ts. (vitest.config.ts:40) Coverage includes production TypeScript and TSX source, excludes tests, declarations, and main.tsx, and enforces repository-wide statement, branch, function, and line floors. (vitest.config.ts:17-33)

Maintained commands are npm test, npm run test:coverage, and npm run bench. (package.json:11-14)

## Browser journeys

Playwright uses the e2e/ directory, one Chromium worker, serial execution, and a dedicated strict port at localhost:5180. (playwright.config.ts:7-19; playwright.config.ts:23-34; playwright.config.ts:49-63) Local runs are headed for native GPU use, while CI is headless and allows longer startup because software WebGL is slower. (playwright.config.ts:42-46; playwright.config.ts:65-72)

The maintained journeys are e2e/master-refinement.spec.ts and e2e/ai-command-center.spec.ts. (e2e/master-refinement.spec.ts; e2e/ai-command-center.spec.ts) A local process already owning port 5180 must be identified before the suite runs, because local reuse could otherwise test the wrong application. (playwright.config.ts:24-29; playwright.config.ts:57-62)

## Static validation

The typecheck command covers production and tests through separate TypeScript projects. (package.json:19) Lint and formatting cover source, E2E, scripts, configuration, and workflows. (package.json:20-22) Knip rejects unused files and dependencies, unresolved imports, binaries, and dependency cycles. (package.json:38) Dedicated validators cover assets, credits, depth policy, shaders, and the release bundle. (package.json:33-37)

## Native runtime and art evidence

npm run benchmark:runtime invokes scripts/run-performance-benchmark.mjs. (package.json:15) The benchmark can start its own preview or use an explicit base URL, fixes named scenes and simulation settings, records network and system-isolation variants, and stores evidence under test-results/runtime-benchmarks by default. (scripts/run-performance-benchmark.mjs:7-28; scripts/run-performance-benchmark.mjs:40-71; scripts/run-performance-benchmark.mjs:80-90)

npm run capture:art invokes scripts/capture-art-review.mjs. (package.json:17) The wrapper validates scene names, builds fresh by default, records candidate provenance, creates a contact sheet, and can pair visual capture with a separate performance gate. (scripts/capture-art-review.mjs:1-43) Its default art set covers 12 named scenes. (scripts/capture-art-review.mjs:56-77)

Runtime timing is valid only on an owned port and a resource-stable host. A screenshot establishes rendered output, while authored visual quality remains a review judgment. (scripts/capture-art-review.mjs:22-26; scripts/run-performance-benchmark.mjs:60-70)

## Provenance

- Sources consulted: package.json, vitest.config.ts, playwright.config.ts, e2e/, scripts/run-performance-benchmark.mjs, scripts/capture-art-review.mjs
- Last verified against sources: 2026-08-12

## See Also

- [[millos:systems/build-deployment]] — release and hosting surfaces
- [[millos:systems/graphics-rendering]] — rendering quality and depth rules
