# MillOS Documentation

Welcome to the MillOS Digital Twin Simulator documentation. This directory contains complete documentation for the AI-powered grain mill digital twin with industrial SCADA integration.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture.md) | System architecture, tech stack, and design patterns |
| [Components Reference](./components.md) | Detailed reference for all React components |
| [State Management](./state-management.md) | Zustand store structure and data flow |
| [3D Scene System](./3d-scene.md) | Three.js/R3F scene composition and rendering |
| [SCADA Integration](../SCADA_PLAN.md) | Full SCADA system with protocol adapters, alarms, and history |
| [Audio System](./audio-system.md) | Web Audio API implementation for factory sounds |
| [Safety System](./safety-system.md) | Collision avoidance and safety metrics |
| [AI Integration](./ai-integration.md) | AI Command Center and decision simulation |
| [Development Guide](./development.md) | Setup, development workflow, and conventions |
| [Deployment Guide](./deployment.md) | Build process and production deployment |

## Quick Links

- **Main Entry:** `src/App.tsx`
- **State Store:** `src/store.ts`
- **Type Definitions:** `src/types.ts`
- **3D Scene:** `src/components/MillScene.tsx`
- **SCADA Service:** `src/scada/SCADAService.ts`
- **SCADA Panel:** `src/components/SCADAPanel.tsx`

## Project Structure

```
src/
├── App.tsx                 # Root component with Canvas setup
├── main.tsx                # Application entry point
├── store.ts                # Zustand global state store
├── types.ts                # TypeScript interfaces and types
├── index.css               # Global styles (Tailwind)
│
├── components/             # React components
│   ├── MillScene.tsx       # Main 3D scene composition
│   ├── Machines.tsx        # Machine rendering (silos, mills, etc.)
│   ├── WorkerSystem.tsx    # Worker avatars and animations
│   ├── ForkliftSystem.tsx  # Forklift vehicles and safety
│   ├── ConveyorSystem.tsx  # Conveyor belts and product flow
│   ├── UIOverlay.tsx       # Main UI control panel
│   ├── AICommandCenter.tsx # AI decisions slide-out panel
│   ├── SCADAPanel.tsx      # SCADA monitor with 5 tabs
│   ├── AlertSystem.tsx     # Toast notifications
│   └── ...                 # Additional components
│
├── scada/                  # SCADA Integration Layer
│   ├── types.ts            # TypeScript interfaces
│   ├── tagDatabase.ts      # 90 process tags (ISA-5.1 naming)
│   ├── AlarmManager.ts     # ISA-18.2 alarm state machine
│   ├── HistoryStore.ts     # IndexedDB with 24h retention
│   ├── SCADAService.ts     # Main orchestration service
│   ├── SCADABridge.ts      # SCADA-to-3D visual mapping
│   ├── useSCADA.ts         # React hooks
│   ├── useSCADAVisuals.ts  # 3D visualization hooks
│   └── adapters/           # Protocol adapters
│       ├── SimulationAdapter.ts
│       ├── RESTAdapter.ts
│       ├── MQTTAdapter.ts
│       └── WebSocketAdapter.ts
│
├── hooks/                  # Reusable React Hooks
│   ├── useKeyboardShortcuts.ts
│   ├── useProceduralTextures.ts
│   └── useDisposable.ts
│
├── utils/                  # Utility modules
│   ├── audioManager.ts     # Web Audio API sound system
│   ├── positionRegistry.ts # Entity position tracking
│   └── frameThrottle.ts    # Performance throttling
│
└── test/                   # Test suite
    └── setup.ts            # Vitest configuration

scada-proxy/                # Backend Proxy Service
├── src/
│   ├── index.ts            # Express server
│   ├── TagRegistry.ts      # Tag management
│   └── adapters/
│       ├── OPCUAAdapter.ts # OPC-UA client
│       └── ModbusAdapter.ts# Modbus TCP client
├── Dockerfile
└── docker-compose.yml
```

## Version

Current Version: **v3.0**
