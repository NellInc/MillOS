# Security Policy

## Supported surfaces

Security fixes target the current `v0.40` application line and the current `scada-proxy` source. The static `public/v0.10` and `public/v0.20` directories are retained historical builds. They may be withdrawn rather than patched when a defect cannot be corrected without rebuilding the archived release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue for a suspected vulnerability, credential exposure, or industrial control weakness. Include the affected revision, reproduction steps, expected impact, and any suggested containment. Do not include live credentials, personal data, or plant network details.

## Industrial safety boundary

MillOS is a simulator. The SCADA proxy has authentication, validation, rate limits, read-only defaults, and encrypted OPC UA requirements in production. Those controls do not constitute plant certification or a safety case. Do not connect it to physical equipment until a qualified site owner has supplied and independently accepted:

1. Network segmentation and exact egress rules.
2. Managed credentials, client certificates, and key rotation.
3. A site-specific tag map and engineering limits.
4. Independent hazard analysis and fail-safe behavior.
5. Integration, load, recovery, and penetration testing against representative equipment.
6. Operational ownership, monitoring, incident response, and rollback procedures.

Production writes are disabled by default. Enabling them requires a distinct write credential and remains an external authorization decision.

## Browser keys and private data

Gemini credentials entered in the UI remain in that browser's local storage and are sent directly to Google's API. They must never be committed to the repository or embedded in a build. Treat multiplayer rooms as untrusted peer input and avoid sharing secrets or personal data in chat.

## Dependency and workflow policy

GitHub Actions are pinned to immutable commit SHAs. Dependency audits and repository validation run in CI. Major dependency migrations, container digest refreshes, and externally managed secrets require explicit review because they change runtime or deployment contracts.
