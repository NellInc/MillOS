# Development Guide

**Status:** topical reference, verify commands against `package.json` and rules against `AGENTS.md`

**Agent orientation:** [`.claude/README.md`](../.claude/README.md) and [Documentation Map](./README.md)

Development workflow, environment setup, and coding conventions for MillOS.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Development Workflow](#development-workflow)
4. [Project Structure](#project-structure)
5. [Coding Conventions](#coding-conventions)
6. [Adding Features](#adding-features)
7. [Debugging](#debugging)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | JavaScript runtime |
| npm | 9+ | Package manager |
| Git | 2.x | Version control |

### Recommended Tools

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - TypeScript and JavaScript Language Features

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/NellWatson/MillOS.git
cd MillOS
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Copy the example file:

```bash
cp .env.local.example .env.local
```

There is no build-time Gemini key. Enter it at runtime in the in-app AI/Gemini settings modal; it is
stored only in browser localStorage under `millos-ai-config`. The only variable the example documents
is the optional `VITE_ENABLE_SW=true` for testing the service worker on the dev server.

### 4. Start Development Server

```bash
npm run dev
```

Server runs at `http://localhost:3000`

---

## Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build |

### Development Server

- **Hot Module Replacement (HMR)** - Changes reflect instantly
- **Accessible on network** - `host: '0.0.0.0'`
- **Default port** - 3000

### Build Process

```bash
# Production build
npm run build

# Output directory: dist/
```

### Playtest instruments

Three review instruments, run by name. None is a gate: `npm test` skips the two
vitest ones (77 tests, all skipped unless their output variable is set), and
the capture tool is not a test file. Times are from the 4 vCPU gate VM.

| Command | Writes (default) | Measures | Does not measure | Time |
|---|---|---|---|---|
| `npm run playtest:plant [-- --out=<file> --suite=<arm set> --shifts=N]` | `test-results/playtest/plant-measure.json` | The real central tick and stores for whole shifts at the standard pace: what the plant made, shipped, earned and spent per shift, per player arm (`plantMeasure.playtest.test.ts`; `--suite` picks levers, demand, packer, shipment, partner, grade, maintenance or ask) | A browser, rendering or the 3D scene; components' own steps are mirrored (trucks, the offline machine model, button presses), each named in the file's header; no safety hold or SCADA | About 1 minute for the default ten-shift run |
| `npm run playtest:chronicle [-- --out=<dir> --seeds=N --styles=a,b --lengths=short,full --shard=i/n]` | `test-results/playtest/chronicle-probe/` (one JSON per run) | A signed Chronicle played on that same plant, every close read from the report the real tick wrote: trial medals, the fund and the score, for the idle, attentive and skilled styles (`chronicleProbe.playtest.test.ts`); `--gates=<dir>` reads earlier runs and checks the gates without playing | Real players: three fixed styles; what the plant harness leaves out; no E-stop | About 1 minute for one idle 27-shift run; the default sweep is 48 runs, so split it with `--shard` |
| `npm run playtest:surfaces -- --base-url=<served build> [--out=<dir> --only=a,b\|final --lang=en\|pt-BR\|all --viewport=desktop,narrow,phone,upright\|all --seed-dir=<dir>]` | `test-results/playtest-surfaces/` (JPEGs and `manifest.json`) | A built app in headless Chromium, played as a player (dock, keys, 4x waits): one frame per changed surface in English and Brazilian Portuguese, on a desktop, a 390 px window, a landscape touch phone (844x390, scale 2) and one upright frame (the rotate notice), with console errors, page errors, failed requests, `title` tooltips and cut text per frame. `--seed-dir` loads far states as a returning player's saved game (one JSON of localStorage keys per state), and the manifest names the seed of every frame taken on one | The 3D scene (render-only systems are off unless `--full-scene`, so it is dark); a real phone's browser chrome and safe areas; frame rate; seeded states are not reached by play | 3 to 22 minutes a variant on software GL (about 3 FPS), after a build and `vite preview` |

The default suite (`measure`) runs the older arms a, b and c, which answer
every service "run on"; it does not produce the no-input figures quoted in
`CLAUDE.md` and the decision log. Those come from
`npm run playtest:plant -- --suite=partner`, arm p: ten shifts, 52 orders on
time, none late, net 42,593.2, graded A in every shift (about 1.2 minutes for
its three arms). `--suite=ask` runs the arms behind `DELEGATION_EVIDENCE`
(about 7 minutes) and checks every claim there, the null ones included.

The floor arms behind the delegation rule's intake, temper and incident claims
(`plantFloor.playtest.test.ts`, on the same plant) run by their output
variable: `MILLOS_PLANT_INTAKE_OUT=<file> npx vitest run src/systems/__tests__/plantFloor.playtest.test.ts`
(or `MILLOS_PLANT_TEMPER_OUT`, `MILLOS_PLANT_INCIDENT_OUT`). The sprouted intake
arms run twenty shifts, the length their evidence was measured at
(`MILLOS_PLANT_INTAKE_SHIFTS` overrides); the rest run ten. About 5 minutes
for the intake suite.

The capture tool is headless only and takes the repository's capture lock
(`scripts/lib/capture-lock.mjs`) for its whole run, so it never renders beside
another capture or benchmark.

---

## Project Structure

```
MillOS/
├── docs/                    # Documentation (this folder)
├── public/                  # Static assets
├── src/
│   ├── components/          # React components
│   │   ├── AICommandCenter.tsx
│   │   ├── AlertSystem.tsx
│   │   ├── ConveyorSystem.tsx
│   │   ├── DustParticles.tsx
│   │   ├── Environment.tsx
│   │   ├── FactoryInfrastructure.tsx
│   │   ├── ForkliftSystem.tsx
│   │   ├── HolographicDisplays.tsx
│   │   ├── Machines.tsx
│   │   ├── MillScene.tsx
│   │   ├── PostProcessing.tsx
│   │   ├── ProductionMetrics.tsx
│   │   ├── SpoutingSystem.tsx
│   │   ├── TruckBay.tsx
│   │   └── ui-new/GameInterface.tsx
│   ├── utils/
│   │   ├── audioManager.ts  # Web Audio API manager
│   │   └── positionRegistry.ts  # Collision detection
│   ├── App.tsx              # Root component
│   ├── main.tsx             # Entry point
│   ├── store.ts             # Zustand store
│   ├── types.ts             # TypeScript types
│   └── index.css            # Global styles
├── index.html               # HTML template
├── package.json             # Dependencies
├── tailwind.config.js       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
└── CLAUDE.md                # AI assistant guidelines
```

### Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`:

```typescript
// Use @ to reference project root
import { something } from '@/src/utils/something';
```

---

## Coding Conventions

### TypeScript

- **Strict mode** enabled
- **Explicit types** for function parameters
- **Interfaces** for object shapes
- **Enums** for fixed sets of values

```typescript
// Good
function updateMachine(id: string, status: MachineStatus): void {
  // ...
}

// Avoid
function updateMachine(id, status) {
  // ...
}
```

### React Components

- **Functional components** only
- **Named exports** for components
- **Props interfaces** defined inline or separately

```typescript
interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  // ...
};
```

### Icons - No Emojis

**Critical Rule:** Never use emoji characters in the codebase. Use Lucide React icons instead.

```tsx
// Bad
const icon = '🚨';
<span>{icon}</span>

// Good
import { Siren } from 'lucide-react';
<Siren className="w-5 h-5" />
```

**Exception:** The mill emoji is permitted in these branding locations only:
- `index.html` - Favicon and loading screen
- `ui-new/sidebar/ContextSidebar.tsx` - Header logo

### Available Lucide Icons

```typescript
// Alerts
import { Siren, AlertTriangle, CheckCircle, Info, Shield } from 'lucide-react';

// AI/Tech
import { Bot, Brain, Zap, Eye } from 'lucide-react';

// Workers
import { User, Briefcase, HardHat, Wrench, FlaskConical, Shield } from 'lucide-react';

// Time
import { Sun, Sunset, Moon } from 'lucide-react';
```

### Styling

Use Tailwind CSS utility classes:

```tsx
<div className="bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 px-4 py-2 rounded-lg shadow-2xl">
  <h2 className="text-lg font-bold text-white">Title</h2>
</div>
```

### Color Palette

| Purpose | Color | Hex |
|---------|-------|-----|
| Background | Slate 950 | #0a0f1a |
| Surface | Slate 900 | #0f172a |
| Border | Slate 700 | #334155 |
| Text Primary | White | #ffffff |
| Text Secondary | Slate 400 | #94a3b8 |
| Accent | Cyan 500 | #06b6d4 |
| Success | Green 500 | #22c55e |
| Warning | Amber 500 | #f59e0b |
| Error | Red 500 | #ef4444 |

---

## Adding Features

### Adding a New Machine Type

1. **Define type** in `types.ts`:
```typescript
export enum MachineType {
  // existing types...
  NEW_MACHINE = 'NEW_MACHINE'
}
```

2. **Add geometry** in `Machines.tsx`:
```typescript
case MachineType.NEW_MACHINE:
  return (
    <group position={[0, size[1] / 2, 0]}>
      {/* Machine geometry */}
    </group>
  );
```

3. **Add sound** in `audioManager.ts`:
```typescript
playNewMachineSound(machineId: string) {
  // Sound implementation
}
```

4. **Add to scene** in `MillScene.tsx`:
```typescript
_machines.push({
  id: 'new-machine-1',
  type: MachineType.NEW_MACHINE,
  // ...
});
```

### Adding a New Sound

1. **Add method** to `AudioManager`:
```typescript
playNewSound() {
  if (this.getEffectiveVolume() === 0) return;

  const ctx = this.getContext();
  const masterGain = this.getMasterGain();

  // Create oscillator/noise
  // Configure envelope
  // Connect to master gain
  // Start and stop
}
```

2. **Call from component**:
```typescript
import { audioManager } from '../utils/audioManager';
audioManager.playNewSound();
```

---

## Debugging

### React DevTools

Install browser extension for:
- Component hierarchy inspection
- Props and state viewing
- Performance profiling

### Three.js Debugging

```typescript
// Add helpers to scene
<axesHelper args={[10]} />
<gridHelper args={[100, 100]} />

// Log mesh positions
useFrame(() => {
  console.log(meshRef.current?.position);
});
```

### Zustand DevTools

```typescript
// Enable Redux DevTools
import { devtools } from 'zustand/middleware';

export const useMillStore = create<MillStore>()(
  devtools((set) => ({
    // store implementation
  }))
);
```

### Audio Debugging

```typescript
// Check audio context state
console.log(audioManager.audioContext?.state);

// Monitor active sounds
console.log(audioManager.machineNodes.size);
```

### Performance Monitoring

```typescript
import { useFrame } from '@react-three/fiber';

useFrame((state) => {
  // Log FPS
  console.log(`FPS: ${Math.round(1 / state.clock.getDelta())}`);
});
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Audio not playing | Click/interact first (Web Audio policy) |
| Black screen | Check console for WebGL errors |
| Slow performance | Reduce `dpr` or particle count |
| TypeScript errors | Run `npm install` to update types |
| Hot reload broken | Restart dev server |

---

## Git Workflow

### Branch Naming

```
feature/add-new-machine
bugfix/fix-audio-timing
refactor/optimize-workers
```

### Commit Messages

```
feat: Add new roller mill animation
fix: Correct forklift path collision
refactor: Simplify worker state management
docs: Update component documentation
```

### Pull Request Process

1. Create feature branch
2. Make changes
3. Test locally
4. Create PR with description
5. Request review
6. Merge after approval
