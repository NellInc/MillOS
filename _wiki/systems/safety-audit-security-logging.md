# Safety Incidents and Security Logging

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

Runtime safety state is split between `src/stores/safetyStore.ts` and
`src/stores/gameSimulationStore.ts`. The former records forklift incidents,
metrics, and heat-map locations. The latter owns drills, facility stops, crises,
and recovery events. MillOS currently has no client-side security audit store.

## Safety state

`safetyStore.ts` tracks near misses, safety stops, worker evasions, incident
history, the spatial incident heat map, forklift movement metrics, and the
forklift emergency-stop flag. Persisted state is sanitized through
`src/stores/storage.ts` before it is merged with current defaults and actions.

`gameSimulationStore.ts` owns the active fire drill, evacuation progress,
facility emergency state, structured safety events, crisis interlocks, and the
clear/recovery transition. User controls live in
`src/components/ui-new/panels/SafetyPanel.tsx`; the visible alarm layer lives in
`src/components/EmergencyOverlay.tsx`.

## Security event boundary

The SCADA proxy logs bounded authentication, origin, validation, connection, and
adapter failures without logging credentials. These process logs are operational
diagnostics. They are not a tamper-evident audit trail. A durable external sink,
retention policy, alert ownership, and incident-response integration remain an
external operations programme.

## Provenance

- Sources: `src/stores/safetyStore.ts`, `src/stores/gameSimulationStore.ts`,
  `src/components/ui-new/panels/SafetyPanel.tsx`, `scada-proxy/src/index.ts`
- Last verified: 2026-08-13

## See Also

- [[millos:flows/fire-drill-evacuation]]
- [[millos:systems/scada-layer]]
- [[millos:systems/worker-agent-system]]
