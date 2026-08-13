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

| Software | Version | Purpose            |
| -------- | ------- | ------------------ |
| Node.js  | 20+     | JavaScript runtime |
| npm      | 9+      | Package manager    |
| Git      | 2.x     | Version control    |

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

### 3. AI backends

No Gemini key is read from a frontend environment file. For cloud inference, open the in-app Gemini settings and connect a Google API key for the current browser session. MillOS keeps that key in memory, clears it on reload or tab close, and never persists it.

Without a key, heuristic mode remains available. A compatible browser and GPU can also run the optional local WebGPU model. Model weights may be browser-cached, while the runtime engine is reloaded for each session.

### 4. Start Development Server

```bash
npm run dev
```

The server listens on localhost and runs at `http://localhost:3000` by default. For deliberate
testing from another device on a trusted network, run `npm run dev -- --host 0.0.0.0`. Treat that
as an explicit exposure choice and stop the server when the device test is complete.

---

## Development Workflow

### Available Scripts

| Command                     | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `npm run dev`               | Start dev server on port 3000                             |
| `npm run build`             | Create production build                                   |
| `npm run preview`           | Preview production build                                  |
| `npm run typecheck`         | Typecheck production and test projects                    |
| `npm run lint`              | Lint source, E2E, scripts, and configuration              |
| `npm run format:check`      | Check maintained formatting                               |
| `npm test`                  | Run Vitest plus maintained Node tool tests                |
| `npm run test:coverage`     | Run coverage with repository floors                       |
| `npm run test:e2e`          | Run serial Chromium journeys                              |
| `npm run check:dead-code`   | Check files, dependencies, unresolved imports, and cycles |
| `npm run validate:docs`     | Validate maintained links and source references           |
| `npm run validate:security` | Validate the current HTML script policy and inline hashes |

### Development Server

- **Hot Module Replacement (HMR)** - Changes reflect instantly
- **Local by default** - Binds to `127.0.0.1`; pass `--host 0.0.0.0` only for an owned device test
- **Default port** - 3000

### Build Process

```bash
# Production build
npm run build

# Output directory: dist/
```

---

## Project Structure

```text
MillOS/
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── MillScene.tsx
│   │   ├── machines/CompactMachines.tsx
│   │   ├── environment/
│   │   ├── infrastructure/
│   │   ├── physics/
│   │   ├── multiplayer/
│   │   └── ui-new/
│   ├── stores/
│   ├── scada/
│   ├── multiplayer/
│   ├── systems/
│   ├── protocols/vcp/
│   ├── runtime/
│   ├── utils/
│   └── test/
├── scada-proxy/
├── scripts/
├── e2e/
├── public/
└── docs/
```

### Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`:

```typescript
// Use @ to reference project root
import { sanitizePlayerName } from '@/src/utils/sanitize';
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
<span>{icon}</span>;

// Good
import { Siren } from 'lucide-react';
<Siren className="w-5 h-5" />;
```

**Exception:** The mill emoji is permitted in these branding locations only:

- `index.html` - Favicon and loading screen
- `ui-new/sidebar/ContextSidebar.tsx` - Header and sidebar logo

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

| Purpose        | Color     | Hex     |
| -------------- | --------- | ------- |
| Background     | Slate 950 | #0a0f1a |
| Surface        | Slate 900 | #0f172a |
| Border         | Slate 700 | #334155 |
| Text Primary   | White     | #ffffff |
| Text Secondary | Slate 400 | #94a3b8 |
| Accent         | Cyan 500  | #06b6d4 |
| Success        | Green 500 | #22c55e |
| Warning        | Amber 500 | #f59e0b |
| Error          | Red 500   | #ef4444 |

---

## Adding Features

### Adding a New Machine Type

1. **Define type** in `types.ts`:

```typescript
export enum MachineType {
  // existing types...
  NEW_MACHINE = 'NEW_MACHINE',
}
```

2. **Add geometry** in `src/components/machines/CompactMachines.tsx`:

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

2. **Add appearance** through `src/components/workers/WorkerAppearance.ts` and the current worker components:

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

| Issue             | Solution                                |
| ----------------- | --------------------------------------- |
| Audio not playing | Click/interact first (Web Audio policy) |
| Black screen      | Check console for WebGL errors          |
| Slow performance  | Reduce `dpr` or particle count          |
| TypeScript errors | Run `npm install` to update types       |
| Hot reload broken | Restart dev server                      |

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
