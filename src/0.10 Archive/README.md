<div align="center">
<img width="900" alt="MillOS Digital Twin" src="assets/Screenshot.png" />

<br/>

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Three.js-R169-black?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

# MillOS

### AI-Powered Grain Mill Digital Twin Simulator

*An Agentic AI Experiment by Nell Watson*

<br/>

A browser-based 3D industrial simulation featuring autonomous workers, intelligent forklifts,<br/>real-time production metrics, and an AI command center — all visualizing a complete grain milling operation.

[View in AI Studio](https://ai.studio/apps/drive/1dzg8VQBWvFW1SYHiqYyClsvakjN8uidt)

</div>

---

## Overview

MillOS is a fully interactive digital twin of a grain mill factory, built with React Three Fiber. Watch 10 autonomous workers patrol the factory floor, observe 2 intelligent forklifts navigate around obstacles, and monitor real-time production data as 14 machines process grain across 4 production zones.

<table>
<tr>
<td align="center"><strong>14</strong><br/>Interactive Machines</td>
<td align="center"><strong>10</strong><br/>Autonomous Workers</td>
<td align="center"><strong>4</strong><br/>Production Zones</td>
<td align="center"><strong>500+</strong><br/>Animated Particles</td>
</tr>
<tr>
<td align="center"><strong>1,240</strong><br/>Tonnes/Hour</td>
<td align="center"><strong>42</strong><br/>Bags/Minute</td>
<td align="center"><strong>99.7%</strong><br/>Uptime</td>
<td align="center"><strong>98.2%</strong><br/>Efficiency</td>
</tr>
</table>

---

## Features

### Four Production Zones

| Zone | Equipment | Function |
|:----:|-----------|----------|
| **1** | 5 Silos (Alpha–Epsilon) | Raw material storage with real-time capacity tracking |
| **2** | 6 Roller Mills (RM-101–106) | Milling floor with RPM, temperature & vibration monitoring |
| **3** | 3 Plansifters (A–C) | Elevated sifting platforms with oscillation animation |
| **4** | 3 Packer Lines | High-speed packaging at 42 bags/minute |

### Autonomous Worker System

Ten individually modeled workers with:
- **Role-based uniforms** — Supervisors, Engineers, Operators, QC, Maintenance, Safety Officers
- **Realistic walk cycles** — Full limb animation with natural movement
- **Intelligent patrolling** — Workers navigate aisles and avoid obstacles
- **Forklift evasion** — Workers detect approaching vehicles and step aside
- **Detailed profiles** — Experience levels, certifications, shift schedules

### Smart Forklift Fleet

Two autonomous forklifts with:
- Path-based navigation using waypoint systems
- Dynamic collision avoidance (workers and other forklifts)
- Visual cargo states (loaded/empty pallets)
- Warning lights (amber = moving, red = stopped for safety)

### AI Command Center

Real-time decision feed simulating agentic AI operations:

| Type | Icon | Example |
|------|:----:|---------|
| Assignment | 👤 | Dispatching workers to machines |
| Optimization | ⚡ | Adjusting production parameters |
| Prediction | 🔮 | Scheduling preventive maintenance |
| Maintenance | 🔧 | Component care recommendations |
| Safety | 🛡️ | Hazard detection and alerts |

Each decision includes confidence scores, reasoning, and expected business impact.

### Live Production Metrics

Real-time KPIs with 30-minute historical trends:
- Throughput (tonnes/hour)
- Overall Equipment Efficiency
- Quality Grade (Grade A certification)
- System Uptime
- Energy Consumption

### Immersive 3D Environment

- **Grain spouting** — Curved pipes (Catmull-Rom splines) connecting all zones
- **Conveyor system** — Animated belt with 60 flour bags and 25 rotating rollers
- **Loading bay** — Two cycling delivery trucks (GRAIN CO & FLOUR EXPRESS)
- **Holographic displays** — Status billboards floating in 3D space
- **Atmospheric effects** — 500+ dust particles with instanced rendering
- **Industrial lighting** — Colored accent spots and skylights

---

## Quick Start

### Prerequisites

- Node.js 18+
- Gemini API key (for AI features)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/millos.git
cd millos

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Add your GEMINI_API_KEY to .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the simulation.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build locally |

---

## Controls

| Input | Action |
|-------|--------|
| **Left-drag** | Orbit camera around scene |
| **Right-drag** | Pan camera position |
| **Scroll** | Zoom in/out |
| **Click machine** | Open machine detail panel |
| **Click worker** | Open worker profile |
| **Z** | Toggle safety zone visibility |
| **A** | Toggle AI Command Center |

---

## Architecture

```
src/
├── App.tsx                     # Root component, canvas setup, event handlers
├── store.ts                    # Zustand state management
├── types.ts                    # TypeScript interfaces & worker roster
│
├── components/
│   ├── MillScene.tsx           # Main 3D scene composition
│   │
│   │   # 3D Systems
│   ├── Machines.tsx            # Silos, mills, sifters, packers
│   ├── ConveyorSystem.tsx      # Animated belt & flour bags
│   ├── SpoutingSystem.tsx      # Curved grain pipes
│   ├── WorkerSystem.tsx        # Worker avatars & pathfinding
│   ├── ForkliftSystem.tsx      # Autonomous vehicles
│   ├── DustParticles.tsx       # Instanced particle effects
│   ├── Environment.tsx         # Lighting & factory structure
│   ├── HolographicDisplays.tsx # In-scene 3D UI billboards
│   │
│   │   # UI Overlays (React DOM)
│   ├── UIOverlay.tsx           # Production controls & machine info
│   ├── AICommandCenter.tsx     # AI decision slide-out panel
│   ├── WorkerDetailPanel.tsx   # Worker profile modal
│   ├── ProductionMetrics.tsx   # Charts & KPIs
│   └── AlertSystem.tsx         # Toast notifications
```

### State Management

MillOS uses **Zustand** for lightweight, performant global state:

```typescript
interface MillStore {
  // Entities
  workers: Worker[]           // 10 workers with positions, tasks, status
  machines: Machine[]         // 14 machines with metrics and status

  // AI System
  aiDecisions: AIDecision[]   // Rolling feed (max 20)

  // Production
  metrics: ProductionMetrics  // Throughput, efficiency, quality, uptime
  productionSpeed: number     // Animation multiplier (0-2.0)

  // UI State
  selectedWorker: string | null
  selectedMachine: string | null
  showZones: boolean
  showAIPanel: boolean
}
```

### Collision System

A custom **PositionRegistry** singleton coordinates inter-entity awareness:
- Workers register positions each frame
- Forklifts check path clearance 5 units ahead
- Safety radii: 2.5 units (workers), 4 units (forklifts)

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **3D Rendering** | React Three Fiber, @react-three/drei |
| **State Management** | Zustand |
| **UI Animation** | Framer Motion |
| **Charts** | Recharts |
| **Styling** | Tailwind CSS |
| **Build Tool** | Vite |
| **Language** | TypeScript |
| **AI Integration** | Google Gemini API |

---

## Roadmap

- [ ] Live Gemini API integration for dynamic AI decisions
- [ ] WebSocket support for multi-user observation
- [ ] VR mode with WebXR controls
- [ ] Historical playback and time-travel debugging
- [ ] Custom scenario editor
- [ ] Mobile touch controls

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Built with [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- State management by [Zustand](https://github.com/pmndrs/zustand)
- UI animations with [Framer Motion](https://www.framer.com/motion/)
- Charts powered by [Recharts](https://recharts.org)
- Styled with [Tailwind CSS](https://tailwindcss.com)

---

<div align="center">

**MillOS v2.0**

*Transforming grain milling through digital twin technology*

<br/>

Made with 🌾 by [Nell Watson](https://github.com/nellwatson)

</div>
