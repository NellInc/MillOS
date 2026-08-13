# SCADA Proxy Security Remediation Record

**Review date:** 2026-08-12
**Scope:** Source, dependencies, REST, WebSocket, OPC UA, Modbus, Docker, Kubernetes, and CI configuration
**Method:** Manual source review, deterministic tests, dependency audit, manifest rendering, and workflow linting

This is an engineering remediation record. It is not a penetration test, a plant commissioning certificate, or proof about an external PLC, cluster, network, or certificate authority.

## Current verdict

The original proxy was not safe to deploy as an industrial gateway. The local candidate now has a substantially stronger fail closed boundary. Production deployment remains gated on real identities, exact network routes, certificate trust, reviewed tag addresses, and plant authority.

## Closed findings

| Finding                            | Prior failure                                                          | Remediation                                                                                           | Local evidence                                  |
| ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Missing application authentication | Reads and writes were reachable without credentials                    | Production requires a read key; REST and WebSocket validate credentials with constant-time comparison | Server integration tests                        |
| Unseparated write authority        | One reachable route could issue industrial writes                      | Writes default off; production enablement requires a distinct write key                               | REST and WebSocket capability tests             |
| Unsafe write values                | Values were forwarded without tag-aware validation                     | Access mode, type, finite number, integer width, string length, and engineering bounds are enforced   | Validation unit tests                           |
| Wrong OPC UA write type            | JavaScript integer shape could override a declared float tag           | Registered tag data type controls the OPC UA Variant                                                  | Adapter unit test                               |
| Unused configured addresses        | Protocol adapters were never registered from canonical tag definitions | Startup registers OPC UA NodeIds and Modbus mappings before polling                                   | Source path and tests                           |
| Modbus cross-slave race            | Concurrent poll and write could interleave `setID` with I/O            | Slave selection and each operation are serialized                                                     | Concurrency unit test                           |
| Modbus byte order asymmetry        | Read and write transformations were inconsistent                       | Byte and word swaps are explicit and symmetric                                                        | Codec round-trip tests                          |
| Guessed Modbus address             | Missing configuration could silently read slave 1, register 0          | Unknown mapping returns BAD and never guesses                                                         | Source path                                     |
| Invalid tag configuration fallback | Production could silently replace broken config with demo tags         | Production missing or malformed configuration stops startup                                           | Registry tests and production startup path      |
| Overbroad CORS                     | Wildcard or malformed origins could be accepted                        | Exact HTTP or HTTPS origin parser; production browser allowlist                                       | Security tests                                  |
| URL-only WebSocket credential      | Credential could be recorded in access logs                            | Browser adapter uses a base64url WebSocket subprotocol                                                | Client and server tests                         |
| Unbounded WebSocket surface        | Payload, connection, and message counts were unbounded                 | 32 KiB payload cap, heartbeat, message rate, and client cap                                           | Source and server tests                         |
| Self-denial HTTP limiter           | 100 requests per 15 minutes blocked a single one-second poller         | General default raised to 2,000; writes separately limited to 120                                     | Configuration and server behavior               |
| Probe authentication conflict      | Kubernetes health checks hit auth and CORS middleware                  | Minimal `/health` and `/ready` routes are registered first                                            | Production integration test                     |
| False readiness                    | A configured disconnected adapter could still look ready               | `/ready` returns 503 until configured adapters connect                                                | Source and probe test for unconfigured baseline |
| Unsafe horizontal scaling          | Two replicas could independently poll and write the same devices       | Base replica count is 1; HPA removed                                                                  | Rendered manifest                               |
| Committed placeholder secret       | Empty Secret looked deployable and encouraged in-repo secret edits     | Secret moved to an excluded example; workflow requires an external Secret                             | Kustomize output and workflow preflight         |
| Broad private network egress       | Compromise could reach all RFC1918 hosts on industrial ports           | Base permits DNS only; exact plant CIDRs require an overlay                                           | Rendered NetworkPolicy                          |
| Placeholder public ingress         | Base apply created a fake public host and TLS dependency               | Ingress moved to an excluded example                                                                  | Kustomize output                                |
| Phantom metrics                    | Deployment advertised `/metrics` although no route existed             | Scrape annotations and monitoring ingress removed                                                     | Rendered manifest                               |
| Dependency vulnerabilities         | Root and proxy lockfiles reported high severity issues                 | Compatible dependency updates and audit fixes applied                                                 | `npm audit` in both packages                    |
| Mutable CI actions                 | Workflows trusted moving tags, including Trivy `master`                | Every action reference is pinned to a full commit SHA                                                 | Workflow scan and actionlint                    |
| Missing proxy CI gates             | Proxy tests and lint could be skipped                                  | Proxy build, lint, and tests are mandatory                                                            | CI workflow                                     |

## Residual risks and gates

| Priority                 | Residual risk                                             | Why it remains                                                | Required closure evidence                                                                      |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Critical deployment gate | Real tag addresses and permissions are unverified         | No local source check can confirm a PLC map                   | Independent controls review plus staged read and write commissioning                           |
| Critical deployment gate | OPC UA server and client trust are unverified             | Requires the real server PKI and certificates                 | Encrypted channel evidence, trust store review, expiry monitoring                              |
| Critical deployment gate | Exact plant egress is unknown                             | Site CIDRs are external facts                                 | Reviewed NetworkPolicy overlay and effective cluster policy                                    |
| High                     | Write audit is stdout only                                | Durable, tamper-aware retention needs external infrastructure | Central sink receipt, access control, retention, and alert exercise                            |
| High                     | API keys have no overlap rotation                         | Current configuration accepts one read key and one write key  | Dual-key rotation design and live rotation test                                                |
| High                     | Authorization is capability-wide, not per tag             | One write key can reach every configured writable tag         | Per-tag or role policy with negative tests                                                     |
| High                     | No active owner election                                  | Multiple replicas remain unsafe                               | Leader election or explicit connection ownership, failover test                                |
| High                     | No real industrial simulator integration in CI            | Unit tests do not speak to an OPC UA or Modbus server         | Containerized protocol integration tests with read, write, reconnect, and malformed data cases |
| Medium                   | Query-string WebSocket key remains accepted               | Backward compatibility is still active                        | Client inventory and removal after migration                                                   |
| Medium                   | Subscription messages do not filter tags                  | Every client receives all values                              | Server-side subscription state and authorization tests                                         |
| Medium                   | No `/metrics` endpoint                                    | Operational visibility is log based                           | Bounded metrics design, internal scrape policy, cardinality tests                              |
| Medium                   | Rate limits are process local                             | A restart resets counters; multiple replicas would split them | Edge or shared limiter if scaling becomes necessary                                            |
| Medium                   | Modbus is plaintext                                       | Protocol limitation                                           | Segmentation, secure gateway, or tunnel evidence                                               |
| Medium                   | Container base and simulator images are not digest pinned | Pinning needs an update owner and rebuild cadence             | Approved image digests plus automated refresh policy                                           |

## Verification status

Local tests prove source behavior around the implemented controls. Kubernetes rendering proves manifest composition. Docker Compose rendering proves configuration syntax. Neither substitutes for running the image, applying to a cluster, connecting to industrial devices, or conducting an independent security assessment.
