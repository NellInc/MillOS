# MillOS SCADA Proxy

The SCADA proxy bridges validated OPC UA and Modbus tag definitions to authenticated REST and WebSocket clients. It is an optional production service. MillOS can continue to use simulated SCADA without it.

## Safety boundary

The proxy is an industrial protocol gateway. It is not a safety instrumented system, a PLC interlock, or an authorization authority for plant operations. Physical interlocks, PLC permissions, network segmentation, change control, and operator procedures remain authoritative.

The checked in configuration is deliberately fail closed:

1. Production startup requires an API key.
2. Production browser requests require an exact origin allowlist.
3. Industrial writes are disabled unless `SCADA_ENABLE_WRITES=true`.
4. Production writes require a second API key that differs from the read key.
5. The canonical `tags.json` contains read only tags.
6. Invalid or missing production tag configuration stops startup.
7. The Kubernetes base has no public ingress and no industrial network egress.
8. One replica owns the industrial connections. Horizontal scaling remains disabled until ownership coordination exists.

## Local verification

```bash
npm ci
npm run build
npm run lint
npm test
npm audit --audit-level=high
```

The test suite covers configuration parsing, write value validation, Modbus encoding and operation serialization, OPC UA data types, REST and WebSocket authentication, health probes, and graceful shutdown.

## Development start

```bash
cp .env.example .env
npm run dev
```

A local `.env` is supported for development convenience, but it is plaintext. Do not place production credentials there. Inject production values from the deployment secret manager.

## Configuration

| Variable                                                            |                   Default | Production rule                               | Purpose                                                                       |
| ------------------------------------------------------------------- | ------------------------: | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`                                                          |             `development` | Must be `production`                          | Selects production authentication and OPC UA transport security               |
| `PORT`                                                              |                    `3001` | Integer from 1 to 65535                       | REST and WebSocket listener                                                   |
| `POLL_INTERVAL`                                                     |                    `1000` | 100 to 60000 ms                               | Industrial polling interval                                                   |
| `ALLOWED_ORIGINS`                                                   | Local development origins | Required for browser access                   | Comma separated exact HTTP or HTTPS origins; wildcards and paths are rejected |
| `TRUST_PROXY_HOPS`                                                  |                       `0` | Match the real trusted proxy chain            | Controls Express client IP handling for rate limits                           |
| `SCADA_API_KEY`                                                     |                     Empty | Required                                      | Read credential; 32 to 4096 printable ASCII characters                        |
| `SCADA_ENABLE_WRITES`                                               |                   `false` | Explicit opt in                               | Enables the write surface                                                     |
| `SCADA_WRITE_API_KEY`                                               |                     Empty | Required and distinct when writes are enabled | Write credential; 32 to 4096 printable ASCII characters                       |
| `RATE_LIMIT_MAX`                                                    |                    `2000` | Tune from measured client load                | Authenticated HTTP requests per IP in 15 minutes                              |
| `WRITE_RATE_LIMIT_MAX`                                              |                     `120` | Tune conservatively                           | HTTP writes per IP in 15 minutes                                              |
| `WS_MESSAGE_RATE_MAX`                                               |                     `120` | Tune conservatively                           | Client WebSocket messages per minute                                          |
| `WS_MAX_CLIENTS`                                                    |                     `100` | Size to capacity                              | Concurrent WebSocket connections                                              |
| `OPCUA_ENDPOINT`                                                    |                     Empty | Must use `opc.tcp://`                         | OPC UA server endpoint                                                        |
| `OPCUA_USERNAME` and `OPCUA_PASSWORD`                               |                     Empty | Configure as a pair                           | Optional OPC UA session identity                                              |
| `OPCUA_CLIENT_CERTIFICATE_FILE` and `OPCUA_CLIENT_PRIVATE_KEY_FILE` |                     Empty | Configure as a pair                           | Optional client certificate identity                                          |
| `MODBUS_HOST`                                                       |                     Empty | Exact plant host                              | Modbus TCP device host                                                        |
| `MODBUS_PORT`                                                       |                     `502` | Integer from 1 to 65535                       | Modbus TCP port                                                               |

The general request allowance is intentionally above 900 requests per 15 minutes because one client polling once per second already produces that rate. Writes have a separate, much lower allowance.

## Authentication

REST accepts either header:

```http
Authorization: Bearer <read-or-write-key>
X-API-Key: <read-or-write-key>
```

Only the write key authorizes a `PUT` when writes are enabled. A read key can never acquire write capability through request data.

Browsers cannot set arbitrary WebSocket headers. The client therefore sends its credential in a base64url WebSocket subprotocol:

```text
millos-scada
millos-scada-key.<base64url-encoded-key>
```

The server selects only `millos-scada`, so the credential is not echoed as the negotiated protocol. Query-string credentials are rejected because URLs commonly reach access logs and monitoring systems.

## Probes

`GET /health` reports process liveness. It does not require a credential.

`GET /ready` returns 200 only when every configured industrial adapter is connected. It returns 503 when a configured OPC UA or Modbus connection is unavailable. An unconfigured adapter does not block readiness.

Neither route exposes tag values, credentials, or endpoint details.

## REST API

| Method | Path           | Result                                               |
| ------ | -------------- | ---------------------------------------------------- |
| `GET`  | `/tags/:tagId` | One current value or 404                             |
| `POST` | `/tags/batch`  | Up to 256 current values                             |
| `GET`  | `/tags`        | All current values                                   |
| `PUT`  | `/tags/:tagId` | Validated write when the capability is enabled       |
| `GET`  | `/status`      | Adapter state, tag count, and WebSocket client count |

A write must satisfy all of these conditions:

1. Global writes are enabled.
2. The request has the distinct write credential.
3. The tag exists.
4. The tag access mode permits writing.
5. The value matches the declared data type.
6. Integers fit their intrinsic width.
7. Numbers are finite and within engineering bounds.
8. The configured adapter is present and accepts the write.

## WebSocket API

Connect to `/ws`, then subscribe to known tag identifiers. The server returns a filtered snapshot after a valid subscription and broadcasts only updates for that client's current subscription set.

```json
{ "type": "subscribe", "tagIds": ["RM101.ST001.PV"] }
```

```json
{
  "type": "snapshot",
  "tags": [
    {
      "tagId": "RM101.ST001.PV",
      "value": 1450.5,
      "quality": "GOOD",
      "timestamp": 1234567890
    }
  ]
}
```

A client can send `subscribe`, `unsubscribe`, or `write`. Subscription changes accept only known identifiers, deduplicate values, and cap each client at 256 tags. An invalid message receives the canonical `error` field and a mirrored legacy `message` field for one compatibility window. Payloads are capped at 32 KiB, message rates are bounded per connection, dead connections are terminated by heartbeat, and total clients are capped.

## Tag configuration

`tags.json` is the canonical runtime configuration. Production requires a nonempty file with at most 10,000 unique tags. Identifiers, protocols, data types, access modes, engineering bounds, and protocol addresses are validated before any industrial connection opens.

```json
{
  "id": "SILO_ALPHA.LT001.PV",
  "name": "Silo Alpha Level",
  "protocol": "modbus",
  "address": "40001",
  "dataType": "FLOAT32",
  "accessMode": "READ",
  "engineeringUnits": "%",
  "engLow": 0,
  "engHigh": 100,
  "modbusRegister": "holding",
  "modbusOffset": 0,
  "modbusSlave": 1,
  "modbusByteSwap": false,
  "modbusWordSwap": false
}
```

Bit registers require `BOOL`. Input and discrete registers are read only. Modbus byte and word order are explicit and are applied symmetrically on reads and writes. Concurrent operations are serialized with slave selection so an overlapping poll and write cannot target the wrong unit.

OPC UA writes use the tag's declared data type. An integer shaped JavaScript value for a `FLOAT32` tag is still sent as an OPC UA Float.

## Container and Kubernetes deployment

`docker compose config --quiet` validates the development composition. The optional simulator profiles use third party images and are development aids, not production dependencies.

The Kubernetes base is rendered with:

```bash
kubectl kustomize k8s
```

Before applying it, the deployment owner must provide:

1. An externally managed `scada-proxy-secrets` Secret with `SCADA_API_KEY` and any selected OPC UA identity values.
2. `SCADA_WRITE_API_KEY` only if writes are intentionally enabled.
3. Real OPC UA or Modbus endpoints in an environment overlay.
4. A NetworkPolicy overlay that permits only the exact plant CIDRs and ports.
5. A reviewed ingress derived from `k8s/ingress.example.yaml`, with the real host, TLS secret, controller class, and issuer.
6. OPC UA certificate mounts and trust exchange when certificate identity is used.

`k8s/secret.example.yaml` and `k8s/ingress.example.yaml` are references. They are not part of the base kustomization. Real secrets must never be committed.

## Deliberate limits

Subscription filtering limits data volume, but it is not per-tag authorization. Any client holding the read credential may subscribe to any configured tag. The service currently has no Prometheus `/metrics` endpoint, durable write audit sink, per-tag authorization policy, high availability leader election, or multi-device Modbus connection pool. The exhaustive improvement backlog records these as follow-up architecture work rather than pretending the current service provides them.
