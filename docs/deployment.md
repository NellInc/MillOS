# Deployment Guide

This guide describes the maintained MillOS frontend and optional SCADA proxy deployment paths. The browser simulator and the industrial proxy have different trust and safety boundaries.

## Supported runtime

MillOS development and CI use Node.js 20. Install the exact lockfile before building:

    npm ci

## Frontend release gate

Run the same deterministic checks required by the maintained workflows:

    npm run typecheck
    npm run lint
    npm run format:check
    npm run check:dead-code
    npm run validate:assets
    npm run validate:depth
    npm run validate:shaders
    npm run validate:credits
    npm test
    npm run build
    npm run validate:bundle

The Vite build writes the current release to dist/. Preview it locally with npm run preview. A successful build proves compilation and packaging. It does not prove browser interaction, native visual quality, accessibility with assistive technology, performance on representative hardware, rights clearance, or publication approval.

## GitHub Pages

.github/workflows/deploy.yml is the authoritative Pages workflow. It:

1. uses Node.js 20 and npm ci;
2. runs the complete deterministic validation gate;
3. builds the current package.json release line;
4. validates the bundle;
5. stages the current release plus retained legacy release lines;
6. generates a script-free root redirect with a restrictive meta CSP and no-referrer policy;
7. copies the custom-domain CNAME;
8. publishes through GitHub Pages.

The workflow has only the permissions needed to read repository content and publish Pages artifacts. It does not inject a Gemini credential.

## Gemini configuration

MillOS is a static browser application. Never expose a Gemini key through Vite define, a VITE\_\* variable, committed files, GitHub Actions output, or the built bundle.

Users connect a Gemini key in the in-app settings. The browser sends requests directly to Google. MillOS keeps the key only in live memory and clears it on reload or tab close. Without a key, heuristic mode works locally. A compatible WebGPU browser can instead load the optional local model.

A centrally managed Gemini integration would require a separately designed backend that owns authentication, authorization, quotas, abuse controls, audit, privacy review, and secret rotation. No such backend is claimed here.

## Static hosting outside GitHub Pages

Any static host can serve dist/. The host must:

1. serve hashed assets with appropriate immutable caching;
2. serve the HTML shell with revalidation;
3. preserve the configured base path;
4. set an HTTPS-only transport policy after validating the domain;
5. add response-level security headers, because HTML meta policies cannot express every header;
6. verify the service worker and legacy release paths in the deployed environment.

Recommended response headers include a reviewed Content Security Policy, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, and an explicit framing policy. Validate the actual response with browser network tooling. Source configuration alone is insufficient evidence.

## Optional SCADA proxy

The proxy lives in scada-proxy/ and is not part of the static frontend build.

### Local integration

    cd scada-proxy
    npm ci
    npm run build
    npm run lint
    npm run format:check
    npm test
    npm audit --audit-level=high
    docker compose config --quiet
    docker compose up

Optional simulator profiles are development aids:

    docker compose --profile mqtt up
    docker compose --profile opcua-sim --profile modbus-sim up

There is no docker-compose.prod.yml. Production deployment requires a site-specific Kubernetes overlay or an equivalently reviewed platform configuration.

### Kubernetes base

Render the checked-in base without applying it:

    cd scada-proxy
    kubectl kustomize k8s > /tmp/millos-scada-rendered.yaml

The base runs one non-root replica with a read-only root filesystem, no Linux capabilities, no privilege escalation, RuntimeDefault seccomp, and no service-account token. It deliberately grants no Kubernetes API Role, no public ingress, and no industrial network egress.

Before any apply, the deployment owner must provide:

1. an externally managed scada-proxy-secrets Secret;
2. a strong SCADA_API_KEY;
3. a distinct SCADA_WRITE_API_KEY only when writes are approved;
4. exact HTTPS browser origins;
5. reviewed OPC UA or Modbus endpoints and identities;
6. exact network egress rules;
7. TLS ingress derived from the example;
8. an external audit sink, monitoring, alerting, and incident ownership.

The GitHub Kubernetes workflow expects a base64-encoded kubeconfig secret and an explicit environment approval policy. Repository workflow syntax does not establish cluster admission, authorization, certificate trust, network policy enforcement, or physical safety.

## Industrial safety boundary

The proxy is a protocol gateway. It is not a safety instrumented system, PLC interlock, plant authorization authority, or commissioning record. Writes remain disabled by default. Connecting physical equipment requires qualified site review, tag and address verification, interlock testing, safe-state and rollback exercises, segmented networking, key rotation, and retained operational evidence.

Use scada-proxy/README.md, scada-proxy/SECURITY_CONFIG.md, and SECURITY.md as the current configuration and boundary references.
