# MillOS Documentation

Welcome to the MillOS Digital Twin Simulator documentation. This directory contains full documentation for the AI-powered grain mill digital twin.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture.md) | System architecture, tech stack, and design patterns |
| [Components Reference](./components.md) | Detailed reference for all React components |
| [State Management](./state-management.md) | Zustand store structure and data flow |
| [3D Scene System](./3d-scene.md) | Three.js/R3F scene composition and rendering |
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

## Project Structure

```
src/
├── App.tsx                 # Root component with Canvas setup
├── main.tsx                # Application entry point
├── store.ts                # Zustand global state store
├── types.ts                # TypeScript interfaces and types
├── index.css               # Global styles (Tailwind)
├── components/             # React components
│   ├── MillScene.tsx       # Main 3D scene composition
│   ├── Machines.tsx        # Machine rendering (silos, mills, etc.)
│   ├── WorkerSystem.tsx    # Worker avatars and animations
│   ├── ForkliftSystem.tsx  # Forklift vehicles and safety
│   ├── ConveyorSystem.tsx  # Conveyor belts and product flow
│   ├── UIOverlay.tsx       # Main UI control panel
│   ├── AICommandCenter.tsx # AI decisions slide-out panel
│   ├── AlertSystem.tsx     # Toast notifications
│   └── ...                 # Additional components
└── utils/                  # Utility modules
    ├── audioManager.ts     # Web Audio API sound system
    └── positionRegistry.ts # Entity position tracking for collision avoidance
```

## Version

Current Version: **v0.10**
