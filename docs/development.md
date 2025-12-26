# Development Guide

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

Create `.env.local` file:

```bash
# .env.local
GEMINI_API_KEY=your_gemini_api_key_here
```

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
│   │   ├── UIOverlay.tsx
│   │   ├── WorkerDetailPanel.tsx
│   │   └── WorkerSystem.tsx
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
- `UIOverlay.tsx` - Top-left header logo

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

### Adding a New Worker Role

1. **Update type** in `types.ts`:
```typescript
role: 'Operator' | 'Engineer' | ... | 'NewRole';
```

2. **Add appearance** in `WorkerSystem.tsx`:
```typescript
case 'NewRole':
  return {
    uniformColor: '#color',
    hatColor: '#color',
    tool: 'toolType'
  };
```

3. **Add to roster** in `types.ts`:
```typescript
WORKER_ROSTER.push({
  id: 'w11',
  name: 'New Worker',
  role: 'NewRole',
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
