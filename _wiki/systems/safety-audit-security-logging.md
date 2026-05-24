# Safety Incident Tracking and Audit Security Logging

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

Two Zustand stores handle runtime safety and security concerns in MillOS. `safetyStore.ts` tracks forklift and worker safety incidents with a spatial heatmap; `auditStore.ts` implements client-side OWASP A09 security event logging. Both use persisted Zustand with `safeJSONStorage`.

## Safety Store (`src/stores/safetyStore.ts`)

### Safety Metrics

Tracks four counters and a timestamp (`safetyStore.ts:14–23`):

- `nearMisses`, `safetyStops`, `workerEvasions`, `lastIncidentTime`, `daysSinceIncident`
- Mutation actions: `recordSafetyStop`, `recordWorkerEvasion`, `incrementDaysSafe`, `recordNearMiss`

### Incident History

Full incident log (`safetyStore.ts:25–43`): each entry has `id`, `type` (`stop | evasion | near_miss | emergency`), `timestamp`, `description`, optional `location {x, z}`, `forkliftId`, `workerId`.

### Spatial Heatmap

`IncidentHeatMapIndex` maps grid keys (`x_z` rounded to threshold) to `{x, z, intensity, type}`. Used to identify accident hotspots in the 3D factory scene (`safetyStore.ts:5–9`).

### Forklift Emergency Stop and Metrics

`forkliftEmergencyStop` boolean is the kill-switch for all forklift movement. `forkliftMetrics` tracks per-forklift `totalMovingTime`, `totalStoppedTime`, and `isMoving` — efficiency data for the Compliance Dashboard. `forkliftUpdateTimes` debounces rapid metric updates (`safetyStore.ts:44–60`).

## Audit Store (`src/stores/auditStore.ts`)

Client-side OWASP A09-compliant security logging. Captures (`auditStore.ts:29–56`):

**Categories:**
- Auth: `auth_attempt`, `auth_success`, `auth_failure`, `auth_logout`, `token_expired`
- Input validation: `validation_failure`, `xss_attempt_blocked`, `injection_attempt_blocked`
- Rate limiting: `rate_limit_exceeded`, `rate_limit_warning`
- API: `api_error`, `api_timeout`, `api_unauthorized`
- Session: `session_start`, `session_end`, `session_timeout`
- Suspicious: `suspicious_input`, `unusual_pattern`, `brute_force_detected`
- Multiplayer: `multiplayer_connect`, `multiplayer_disconnect`, `chat_message_blocked`

Note from source: "This is client-side logging only. In production, events should be forwarded to a server-side logging system." (`auditStore.ts:14–16`)

## Provenance

- Sources: `src/stores/safetyStore.ts:1–60`, `src/stores/auditStore.ts:1–60`
- Last verified: 2026-05-23

## See Also

- [[millos:flows/fire-drill-evacuation]] — evacuation flow uses safetyStore incidents
- [[millos:systems/worker-agent-system]] — worker agents that trigger evasion events
- [[millos:systems/multiplayer-architecture]] — multiplayer events logged in auditStore
