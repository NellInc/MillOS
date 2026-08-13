# SCADA Proxy Security Deployment Guide

This guide describes the controls that must hold around a production SCADA proxy deployment. The checked in manifests provide a fail closed base. Site-specific trust, identity, and network facts remain deployment gates.

## Required production invariants

| Control          | Required state                                                         | Proof                                                                           |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Environment      | `NODE_ENV=production`                                                  | Pod environment and startup log                                                 |
| Read identity    | Strong `SCADA_API_KEY` from secret management                          | Authorized read succeeds; missing and incorrect keys return 401                 |
| Write state      | `SCADA_ENABLE_WRITES=false` unless an approved control use case exists | Rendered configuration                                                          |
| Write identity   | Distinct `SCADA_WRITE_API_KEY` when writes are enabled                 | Read key receives 403 on write; write key reaches tag validation                |
| Browser origins  | Exact HTTPS origins only                                               | Disallowed browser origin lacks CORS approval and WebSocket upgrade is rejected |
| Proxy trust      | `TRUST_PROXY_HOPS` equals the real trusted hop count                   | Rate limit test through the deployed ingress                                    |
| OPC UA transport | SignAndEncrypt with Basic256Sha256                                     | Server channel diagnostics and packet inspection                                |
| OPC UA identity  | Reviewed anonymous, username, or certificate identity                  | Server session audit and trust store                                            |
| Modbus boundary  | Private segmented route to exact devices only                          | Effective NetworkPolicy and firewall rules                                      |
| Tag contract     | Reviewed canonical `tags.json`                                         | Startup validation and independent PLC address review                           |
| Availability     | One active connection owner                                            | Replica count 1 until coordination is implemented                               |
| Observability    | Central logs and alerts collect security and connection events         | Log sink query and alert exercise                                               |

## Credentials

Production startup fails without a read key. Writes fail closed independently.

Generate and store keys in the deployment secret manager. Do not write them into `.env`, shell history, Kubernetes YAML, CI logs, or command arguments. The committed secret file is an empty example only.

Rotate read and write keys independently. A safe rotation needs an overlap mechanism at the ingress or application layer because the current process accepts one value for each capability. Until such a mechanism exists, rotate during a controlled maintenance window and verify reconnect behavior.

## Browser origin policy

`ALLOWED_ORIGINS` accepts comma separated exact origins such as `https://scada.example.org`. The parser rejects wildcards, paths, and non-HTTP schemes.

The CORS layer permits a missing Origin for authenticated machine clients. A browser request must match the allowlist. Production WebSocket upgrades require an allowlisted Origin because WebSocket does not enforce CORS itself.

Origin checks supplement credentials. They do not replace them.

## Write enable procedure

Keep writes disabled unless the deployment has a reviewed operational need.

Before enabling writes:

1. Review every tag whose access mode is `WRITE` or `READ_WRITE` against the PLC program and physical interlocks.
2. Confirm data types, engineering ranges, Modbus byte order, Modbus word order, slave IDs, offsets, and OPC UA NodeIds independently.
3. Create a write key distinct from the read key.
4. Exercise rejected out-of-range, wrong-type, read-only, and unavailable-adapter writes in a non-production environment.
5. Verify the durable external audit sink. The service currently emits structured write events to stdout only.
6. Confirm the write rate limit and incident response procedure.
7. Set `SCADA_ENABLE_WRITES=true` only in the reviewed deployment overlay.

The browser can use the write key as its connection credential when write capability is intended. Read-only clients should receive only the read key.

## OPC UA

Development uses no OPC UA message security and logs a warning. Production uses `MessageSecurityMode.SignAndEncrypt` and `SecurityPolicy.Basic256Sha256`.

Username and password must be configured together. Client certificate and private key paths must also be configured together. The OPC UA server still decides whether to trust the client certificate and which nodes the session may access.

Production acceptance requires evidence from the real server:

1. The endpoint supports Basic256Sha256 and SignAndEncrypt.
2. The server certificate chain or pinned certificate is trusted through the node-opcua PKI workflow.
3. The client certificate, when used, is trusted by the server.
4. The session identity has the minimum node permissions needed.
5. A packet capture shows encrypted application traffic.
6. Certificate expiry and rotation are monitored.

## Modbus

Modbus TCP has no native confidentiality, peer authentication, or authorization. Protect it with network architecture:

1. Permit egress only to the exact device IP ranges and TCP ports.
2. Keep devices on a segmented control network.
3. Do not expose TCP 502 through public ingress.
4. Prefer a secure industrial gateway or tunnel when traffic crosses trust zones.
5. Treat device identity, register maps, and byte order as commissioned plant configuration.

The base NetworkPolicy intentionally permits no industrial egress. Add exact plant routes in a deployment overlay. Broad private address ranges are not an acceptable production rule.

## HTTP and WebSocket edge

Terminate TLS at a reviewed ingress or service mesh. Derive an ingress from `k8s/ingress.example.yaml`; replace its placeholder host and TLS secret. The base kustomization does not expose the service publicly.

The service bounds request bodies, batch sizes, HTTP rates, write rates, WebSocket payloads, per-connection message rates, and concurrent clients. Tune the limits from measured load. One client polling once per second needs 900 requests per 15 minutes, so the general default is 2,000 rather than the former self-denial limit of 100.

WebSocket query credentials are rejected because URL credentials commonly appear in logs. Browser clients use the base64url credential subprotocol, while machine clients may use an authorization header.

Each WebSocket starts with no tag subscriptions. Clients must subscribe explicitly, and the proxy sends only subscribed values. This controls disclosure volume between authenticated clients, but it is not authorization. A read credential can still subscribe to any configured tag until a reviewed per-tag policy exists.

## Kubernetes

The container runs as UID 1001 with no added capabilities, no privilege escalation, and a read-only root filesystem. `/tmp` is a bounded writable volume. Health and readiness are separate.

The base uses one replica. Do not add an HPA or second replica until the service has leader election or an explicit read and write ownership model. Multiple unsynchronized replicas can duplicate industrial polls and commands.

The base has no metrics scrape annotation because no `/metrics` route exists. Add metrics and authenticated or internally restricted scraping as one coherent change.

## Verification commands

```bash
npm ci
npm run build
npm run lint
npm test
npm audit --audit-level=high
docker compose config --quiet
kubectl kustomize k8s > /tmp/millos-scada-rendered.yaml
```

Static rendering proves schema and composition only. It does not prove cluster admission, ingress behavior, certificate trust, PLC addressing, or physical safety.
