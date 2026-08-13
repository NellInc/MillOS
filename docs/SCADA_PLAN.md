# SCADA Integration Plan for MillOS

> **Historical record.** This document preserves an earlier audit, plan, or implementation snapshot. It is not current status or operating instruction. See [the 12 August 2026 exhaustive improvement ledger](../_contprompts/millos_exhaustive_improvements_2026-08-12.md) and [its second pass](../_contprompts/millos_exhaustive_improvements_second_pass_2026-08-12.md) for current evidence, dispositions, and remaining gates.

## Status: COMPLETE

All phases of the SCADA integration have been implemented, serving as both the original architecture plan and current usage documentation.

---

## Implementation Summary

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Core Data Model (Tag System) | Complete |
| Phase 2 | Protocol Adapter Interface | Complete |
| Phase 3 | SCADA Service Layer | Complete |
| Phase 4 | Zustand Integration | Complete |
| Phase 5 | UI Components | Complete |
| Phase 6 | Backend Proxy (OPC-UA/Modbus) | Complete |
| Phase 7 | Testing & Documentation | Complete |

### Files Created

```
src/scada/
├── types.ts                    # All TypeScript interfaces
├── tagDatabase.ts              # 90 SCADA tags (ISA naming)
├── AlarmManager.ts             # ISA-18.2 alarm state machine
├── HistoryStore.ts             # IndexedDB with 24h retention
├── SCADAService.ts             # Main orchestration service
├── SCADABridge.ts              # SCADA-to-3D visual mapping
├── useSCADA.ts                 # React hooks
├── useSCADAVisuals.ts          # 3D visualization hooks
├── index.ts                    # Module exports
├── __tests__/
│   ├── SimulationAdapter.test.ts
│   └── SCADABridge.test.ts
└── adapters/
    ├── SimulationAdapter.ts    # Physics-based simulation
    ├── RESTAdapter.ts          # HTTP polling
    ├── MQTTAdapter.ts          # MQTT over WebSocket
    └── WebSocketAdapter.ts     # Direct WebSocket

src/components/
├── SCADAPanel.tsx              # Full SCADA monitor with 5 tabs

scada-proxy/                    # Backend proxy service
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── tags.json
├── mosquitto/config/
│   └── mosquitto.conf
└── src/
    ├── index.ts
    ├── TagRegistry.ts
    └── adapters/
        ├── OPCUAAdapter.ts
        └── ModbusAdapter.ts
```

---

## Quick Start

### Using Simulation Mode (Default)

The SCADA system starts automatically in simulation mode:

```tsx
// In your component
import { useSCADA, useSCADAAlarms } from './scada';

function MyComponent() {
  const { values, isConnected, mode } = useSCADA();
  const { alarms, acknowledge } = useSCADAAlarms();

  // values is a Map<string, TagValue>
  const temp = values.get('RM101.TT001.PV');

  return (
    <div>
      <p>Temperature: {temp?.value}°C</p>
      <p>Quality: {temp?.quality}</p>
    </div>
  );
}
```

### Switching to Live Mode

Use the Config tab in SCADAPanel or programmatically:

```tsx
import { getSCADAService } from './scada';

// Switch to REST API
const service = getSCADAService();
await service.setConnectionConfig({
  type: 'rest',
  baseUrl: 'http://localhost:3001',
  pollInterval: 1000
});

// Switch to MQTT
await service.setConnectionConfig({
  type: 'mqtt',
  brokerUrl: 'ws://localhost:8883',
  topicPrefix: 'scada'
});

// Switch to WebSocket
await service.setConnectionConfig({
  type: 'websocket',
  proxyUrl: 'ws://localhost:3001/ws'
});
```

### Running the Backend Proxy

For OPC-UA or Modbus connections:

```bash
cd scada-proxy
npm install
npm run dev

# Or with Docker
docker compose up
```

Configure environment:
```bash
# .env
PORT=3001
POLL_INTERVAL=1000
OPCUA_ENDPOINT=opc.tcp://192.168.1.100:4840
MODBUS_HOST=192.168.1.101
MODBUS_PORT=502
```

---

## Architecture

### Protocol Browser Compatibility

| Protocol | Browser-Native? | Implementation |
|----------|----------------|----------------|
| **Simulation** | Yes | In-browser physics engine |
| **REST API** | Yes | Direct `fetch()` calls |
| **MQTT** | Yes | Native WebSocket MQTT |
| **WebSocket** | Yes | Direct WebSocket |
| **OPC-UA** | No | Via backend proxy |
| **Modbus TCP** | No | Via backend proxy |

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (React App)                                 │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           MillOS UI                                         │ │
│  │        (React Three Fiber, Zustand Store, AI Engine)                       │ │
│  └─────────────────────────────────┬──────────────────────────────────────────┘ │
│                                    │                                             │
│  ┌─────────────────────────────────▼──────────────────────────────────────────┐ │
│  │                    SCADA Abstraction Layer                                  │ │
│  │  ┌─────────────┬─────────────┬─────────────┬───────────────────┐           │ │
│  │  │ Tag Manager │ Data Engine │ Alarm Mgr   │ History (IndexedDB)│          │ │
│  │  └─────────────┴─────────────┴─────────────┴───────────────────┘           │ │
│  └─────────────────────────────────┬──────────────────────────────────────────┘ │
│                                    │                                             │
│  ┌─────────────────────────────────▼──────────────────────────────────────────┐ │
│  │                    Protocol Adapter Interface                               │ │
│  │            (Common interface - all adapters implement this)                │ │
│  └──┬────────────┬──────────────┬──────────────┬────────────────┬─────────────┘ │
│     │            │              │              │                │               │
│  ┌──▼────────┐ ┌─▼──────────┐ ┌─▼──────────┐ ┌─▼────────────┐ ┌─▼───────────┐  │
│  │Simulation │ │REST Adapter│ │MQTT Adapter│ │WebSocket    │ │Proxy Adapter│  │
│  │Adapter    │ │            │ │            │ │Adapter      │ │             │  │
│  │Physics    │ │fetch() API │ │MQTT/WS     │ │Direct WS    │ │REST to proxy│  │
│  └───────────┘ └────────────┘ └────────────┘ └─────────────┘ └──────┬──────┘  │
│                                                                      │          │
└──────────────────────────────────────────────────────────────────────┼──────────┘
                                                                       │
                                                              ┌────────▼────────┐
                                                              │ BACKEND PROXY   │
                                                              │ (Node.js)       │
                                                              │ ┌─────────────┐ │
                                                              │ │OPC-UA Client│ │
                                                              │ │Modbus Client│ │
                                                              │ └──────┬──────┘ │
                                                              └────────┼────────┘
                                                                       │
                                                                       ▼
                                                                 [Real PLCs]
```

---

## API Reference

### useSCADA Hook

```tsx
const {
  isConnected,        // boolean - connection status
  mode,               // 'simulation' | 'live' | 'hybrid' | 'disconnected'
  tagCount,           // number - total tags
  values,             // Map<string, TagValue> - all current values
  tags,               // TagDefinition[] - all tag definitions
  getValue,           // (tagId: string) => TagValue | undefined
  getHistory,         // (tagId: string, durationMs: number) => Promise<TagHistoryPoint[]>
  writeSetpoint,      // (tagId: string, value: number) => Promise<boolean>
  injectFault,        // (fault: FaultInjection) => void
  clearFault,         // (tagId: string) => void
  clearAllFaults,     // () => void
  activeFaults,       // ActiveFault[]
  exportToCSV,        // (tagIds: string[], duration: number) => Promise<void>
  exportToJSON,       // (tagIds: string[], duration: number) => Promise<void>
} = useSCADA();
```

### useSCADAAlarms Hook

```tsx
const {
  alarms,             // Alarm[] - active alarms sorted by priority
  summary,            // { total, unacknowledged, critical, high, suppressed }
  hasCritical,        // boolean - any critical alarms?
  acknowledge,        // (alarmId: string) => void
  acknowledgeAll,     // () => void
  suppress,           // (tagId: string, reason: string, durationMs?: number) => void
  unsuppress,         // (tagId: string) => void
} = useSCADAAlarms();
```

### useSCADAMachineVisuals Hook

```tsx
const visuals = useSCADAMachineVisuals(machineId, machineStatus);

// Returns:
{
  derivedStatus,       // 'running' | 'idle' | 'warning' | 'critical'
  statusColor,         // hex color string
  temperatureColor,    // hex color (blue→green→yellow→red gradient)
  temperatureGlow,     // 0-1 emissive intensity
  vibrationColor,      // hex color
  vibrationIntensity,  // multiplier for animation amplitude
  rpmMultiplier,       // 0-1 for animation speed
  hasActiveAlarm,      // boolean
  alarmPriority,       // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
  alarmPulseSpeed,     // 0-4 (0 = no pulse)
  fillLevel,           // number | null (for silos)
  fillColor,           // hex color | null
  tagValues: {         // extracted numeric values
    temperature?: number,
    vibration?: number,
    rpm?: number,
    current?: number,
    level?: number,
  }
}
```

---

## Tag Database

90 SCADA tags organized by zone:

| Zone | Equipment | Tags per Unit | Total |
|------|-----------|---------------|-------|
| Zone 1 | 5 Silos | 4 (Level, Temp, Moisture, Vibration) | 20 |
| Zone 2 | 6 Roller Mills | 6 (Speed, Temp, Vibration, Current, Feed, Setpoint) | 36 |
| Zone 3 | 3 Plansifters | 4 (Vibration, Temp, Current, Sieve) | 12 |
| Zone 4 | 3 Packers | 4 (Count, Weight, Speed, Pressure) | 12 |
| Utility | Ambient + Systems | 10 | 10 |
| **Total** | | | **90** |

### Tag Naming Convention (ISA-5.1)

```
AREA.TAG_TYPE.INSTANCE.ATTRIBUTE
```

Examples:
- `RM101.TT001.PV` - Roller Mill 101, Temperature Transmitter 001, Process Value
- `SILO_ALPHA.LT001.PV` - Silo Alpha, Level Transmitter 001, Process Value
- `RM101.ST001.SP` - Roller Mill 101, Speed Transmitter 001, Setpoint

---

## Alarm System (ISA-18.2)

### Alarm States

```
         ┌─────────────────────────────────────────────────┐
         │                                                 │
         ▼                                                 │
      NORMAL ──(threshold exceeded)──► UNACK              │
         ▲                               │                │
         │                               │                │
         │                          (operator ACK)        │
         │                               │                │
         │                               ▼                │
    (clear+ACK)                        ACKED             │
         │                               │                │
         │                          (value normal)        │
         │                               │                │
         │                               ▼                │
         └────────(ACK)──────────── RTN_UNACK            │
                                         │                │
                                    (operator ACK)        │
                                         │                │
                                         └────────────────┘
```

### Alarm Priorities

| Priority | Pulse Speed | Color | Use Case |
|----------|-------------|-------|----------|
| CRITICAL | 4x | Red | Immediate action required |
| HIGH | 2.5x | Orange | Action required soon |
| MEDIUM | 1.5x | Yellow | Investigate when possible |
| LOW | 0.8x | Blue | Informational |

---

## Fault Injection (Testing)

Inject faults via the SCADA Panel Test tab or programmatically:

```tsx
const { injectFault, clearFault } = useSCADA();

// Sensor failure (BAD quality)
injectFault({
  tagId: 'RM101.TT001.PV',
  faultType: 'sensor_fail',
  duration: 10000  // 10 seconds, 0 = permanent
});

// Value spike
injectFault({
  tagId: 'RM101.VT001.PV',
  faultType: 'spike',
  severity: 1.5  // 1.0 = normal, higher = more severe
});

// Accelerated drift
injectFault({
  tagId: 'RM101.TT001.PV',
  faultType: 'drift',
  duration: 30000
});

// Stuck value (no change)
injectFault({
  tagId: 'RM101.ST001.PV',
  faultType: 'stuck'
});

// Increased noise
injectFault({
  tagId: 'RM101.VT001.PV',
  faultType: 'noise',
  severity: 2.0
});

// Clear specific fault
clearFault('RM101.TT001.PV');
```

---

## Backend Proxy API

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check, connection status |
| GET | `/tags` | All tag values |
| GET | `/tags/:tagId` | Single tag value |
| POST | `/tags/batch` | Multiple tag values |
| PUT | `/tags/:tagId` | Write to tag |
| GET | `/status` | Detailed connection status |

### WebSocket Messages

Connect: `ws://localhost:3001/ws`

**Server → Client:**
```json
{ "type": "snapshot", "tags": [...] }
{ "type": "update", "tagId": "...", "value": ..., "quality": "...", "timestamp": ... }
```

**Client → Server:**
```json
{ "type": "subscribe", "tagIds": [...] }
{ "type": "write", "tagId": "...", "value": ... }
```

---

## Docker Deployment

### Basic

```bash
cd scada-proxy
docker compose up
```

### With MQTT Broker

```bash
docker compose --profile mqtt up
```

### With Simulators

```bash
docker compose --profile opcua-sim --profile modbus-sim up
```

### Production

```bash
Production used a deployment-specific overlay that is not retained in this repository.
```

---

## Testing

```bash
# Run all tests
npm test

# Run SCADA tests only
npm test -- --grep "SCADA"

# Run with coverage
npm test -- --coverage
```

---

## Benefits of This Architecture

1. **Decoupled**: UI code doesn't care where data comes from
2. **Testable**: Fault injection for edge case testing
3. **Portable**: Same tag definitions work with real PLCs
4. **Standards-based**: OPC-UA node IDs, ISA-18.2 alarms
5. **Scalable**: IndexedDB can be replaced with time-series DB
6. **Extensible**: Add protocols by implementing IProtocolAdapter

---

## External Integration

### Import Data

```bash
POST /api/scada/values
Content-Type: application/json

{
  "tags": [
    { "id": "RM101.TT001.PV", "value": 52.3, "timestamp": 1699999999999 }
  ]
}
```

### Export Data

```bash
# WebSocket stream
ws://localhost:3001/ws

# JSON export
GET /api/scada/export?from=1699999900000&to=1699999999999

# CSV export (via SCADAPanel)
```

---

## Configuration

### Connection Types

| Type | Config Required |
|------|-----------------|
| `simulation` | None (default) |
| `rest` | `baseUrl`, `pollInterval` |
| `mqtt` | `brokerUrl`, `topicPrefix` |
| `websocket` | `proxyUrl` |
| `opcua` | `proxyUrl` (via backend) |
| `modbus` | `proxyUrl` (via backend) |

### Environment Variables (Backend Proxy)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `POLL_INTERVAL` | 1000 | Polling interval (ms) |
| `OPCUA_ENDPOINT` | - | OPC-UA server URL |
| `MODBUS_HOST` | - | Modbus TCP host |
| `MODBUS_PORT` | 502 | Modbus TCP port |
