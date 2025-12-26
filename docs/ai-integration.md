# AI Integration

MillOS includes an AI Command Center that simulates autonomous factory management decisions.

## Table of Contents

1. [Overview](#overview)
2. [AI Command Center UI](#ai-command-center-ui)
3. [Decision Types](#decision-types)
4. [Decision Generation](#decision-generation)
5. [System Status](#system-status)
6. [Future Integration](#future-integration)

---

## Overview

The AI Command Center demonstrates how an AI system might manage a grain mill factory autonomously. Currently, decisions are simulated locally, but the architecture supports integration with external AI services.

### Key Features

- **Live Decision Feed** - Real-time display of AI decisions
- **System Metrics** - CPU, memory, and decision count
- **Decision Categories** - Multiple types of autonomous actions
- **Confidence Scoring** - Each decision includes confidence level
- **Impact Assessment** - Expected outcome of each decision

---

## AI Command Center UI

### Component Location

`src/components/AICommandCenter.tsx`

### Props

```typescript
interface AICommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
}
```

### Layout

```
┌─────────────────────────────────┐
│  AI Command Center              │
│  Autonomous Operations Intel    │
├─────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌─────────┐ │
│ │ CPU   │ │Memory │ │Decisions│ │
│ │ 23%   │ │ 45%   │ │   12    │ │
│ └───────┘ └───────┘ └─────────┘ │
├─────────────────────────────────┤
│ Live Decision Feed    [Live]    │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ [type] decision             │ │
│ │ Action description          │ │
│ │ Reasoning text              │ │
│ │ ↗ Impact statement          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ [type] decision             │ │
│ │ ...                         │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ Model: MillOS-AI v0.10          │
│ All systems nominal        [●]  │
└─────────────────────────────────┘
```

---

## Decision Types

### Type Definitions

```typescript
type AIDecisionType = 'assignment' | 'optimization' | 'prediction' | 'maintenance' | 'safety';
```

### Type Details

| Type | Icon | Color | Purpose |
|------|------|-------|---------|
| `assignment` | User | Blue | Worker task assignments |
| `optimization` | Zap | Green | Process improvements |
| `prediction` | Eye | Purple | Predictive maintenance |
| `maintenance` | Wrench | Yellow | Scheduled maintenance |
| `safety` | Shield | Red | Safety interventions |

### Visual Styling

```typescript
const getTypeColor = (type: string) => {
  switch (type) {
    case 'assignment': return 'from-blue-500 to-blue-600';
    case 'optimization': return 'from-green-500 to-green-600';
    case 'prediction': return 'from-purple-500 to-purple-600';
    case 'maintenance': return 'from-yellow-500 to-yellow-600';
    case 'safety': return 'from-red-500 to-red-600';
    default: return 'from-gray-500 to-gray-600';
  }
};
```

---

## Decision Generation

### Action Templates

```typescript
const AI_ACTIONS = [
  {
    type: 'assignment',
    action: 'Dispatching {worker} to {machine}',
    reasoning: 'Detected elevated vibration levels requiring immediate inspection',
    impact: 'Preventing potential equipment failure'
  },
  {
    type: 'optimization',
    action: 'Adjusting roller gap on Mill #3 by 0.2mm',
    reasoning: 'Flour particle size trending above optimal range',
    impact: '+2.1% extraction rate improvement'
  },
  {
    type: 'prediction',
    action: 'Scheduling maintenance for Sifter #1 in 48 hours',
    reasoning: 'Bearing wear pattern indicates 72-hour remaining life',
    impact: 'Avoiding unplanned 4-hour downtime'
  },
  {
    type: 'safety',
    action: 'Alerting {worker} about Zone 3 congestion',
    reasoning: 'Forklift traffic pattern creating potential collision risk',
    impact: 'Maintaining zero-incident record'
  },
  // ... more templates
];
```

### Decision Generation Logic

```typescript
useEffect(() => {
  if (!isOpen) return;

  const interval = setInterval(() => {
    setIsThinking(true);

    setTimeout(() => {
      // Select random template
      const template = AI_ACTIONS[Math.floor(Math.random() * AI_ACTIONS.length)];

      // Select random worker and machine
      const worker = WORKER_ROSTER[Math.floor(Math.random() * WORKER_ROSTER.length)];
      const machine = MACHINE_NAMES[Math.floor(Math.random() * MACHINE_NAMES.length)];

      // Create decision with substituted values
      const newDecision: AIDecision = {
        id: `decision-${Date.now()}`,
        timestamp: new Date(),
        type: template.type as AIDecision['type'],
        action: template.action
          .replace('{worker}', worker.name)
          .replace('{machine}', machine),
        reasoning: template.reasoning,
        confidence: 85 + Math.random() * 14,  // 85-99%
        impact: template.impact,
        workerId: worker.id,
      };

      setDecisions(prev => [newDecision, ...prev].slice(0, 15));
      setSystemStatus(prev => ({ ...prev, decisions: prev.decisions + 1 }));
      setIsThinking(false);
    }, 800);  // Thinking delay
  }, 4000);  // Decision interval

  return () => clearInterval(interval);
}, [isOpen]);
```

### AIDecision Interface

```typescript
interface AIDecision {
  id: string;
  timestamp: Date;
  type: 'assignment' | 'optimization' | 'prediction' | 'maintenance' | 'safety';
  action: string;
  reasoning: string;
  confidence: number;
  impact: string;
  workerId?: string;
  machineId?: string;
}
```

---

## System Status

### Metrics Display

```typescript
const [systemStatus, setSystemStatus] = useState({
  cpu: 23,
  memory: 45,
  decisions: 0
});
```

### Metric Fluctuation

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    setSystemStatus(prev => ({
      ...prev,
      cpu: Math.max(15, Math.min(35, prev.cpu + (Math.random() - 0.5) * 5)),
      memory: Math.max(40, Math.min(55, prev.memory + (Math.random() - 0.5) * 3)),
    }));
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### Status Indicators

| Metric | Range | Color |
|--------|-------|-------|
| CPU | 15-35% | Cyan |
| Memory | 40-55% | Green |
| Decisions | Cumulative | Purple |

### Thinking State

Visual indicator when AI is "processing":

```tsx
{isThinking && (
  <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
)}

{isThinking && (
  <span className="text-xs text-cyan-400 animate-pulse">thinking...</span>
)}
```

---

## Future Integration

### Gemini API Configuration

> **SECURITY WARNING**: Never embed API keys in client-side bundles. Use a backend proxy instead.

For AI integration, use a serverless function or backend API:

```typescript
// api/ai-decision.ts (serverless function)
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY; // Server-side only
  // Make API call here
}
```

### Environment Setup

```bash
# .env.local (for local backend/serverless)
GEMINI_API_KEY=your_api_key_here
```

**Note**: The `.env.local` file is gitignored and should never be committed.

### Potential Integration Points

1. **Sensor Data Analysis**
   - Feed machine metrics to LLM
   - Generate maintenance predictions

2. **Natural Language Commands**
   - Voice/text control of factory
   - Ask questions about production

3. **Anomaly Detection**
   - Real-time pattern recognition
   - Automated alert generation

4. **Optimization Suggestions**
   - Production scheduling
   - Energy efficiency recommendations

### Example Integration Pattern

```typescript
async function generateAIDecision() {
  const machineMetrics = getMachineMetrics();
  const workerPositions = getWorkerPositions();

  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    body: JSON.stringify({
      metrics: machineMetrics,
      workers: workerPositions,
      context: 'factory_optimization'
    })
  });

  const decision = await response.json();
  addAIDecision(decision);
}
```

### SCADA Data Integration

The AI system can use real-time SCADA data for more accurate decision-making:

```typescript
import { useSCADA, useSCADAAlarms } from '../scada';

async function generateSCADAInformedDecision() {
  const { values, getValue } = useSCADA();
  const { alarms, hasCritical } = useSCADAAlarms();

  // Get current sensor readings
  const rm101Temp = getValue('RM101.TT001.PV')?.value;
  const rm101Vibration = getValue('RM101.VT001.PV')?.value;

  // Build context with real sensor data
  const scadaContext = {
    temperatures: Array.from(values.entries())
      .filter(([id]) => id.includes('.TT'))
      .map(([id, val]) => ({ tagId: id, value: val.value, quality: val.quality })),
    activeAlarms: alarms.map(a => ({
      tagId: a.tagId,
      priority: a.priority,
      state: a.state,
      message: a.message
    })),
    hasCriticalAlarms: hasCritical
  };

  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    body: JSON.stringify({
      scadaData: scadaContext,
      context: 'predictive_maintenance'
    })
  });

  return response.json();
}
```

**Available SCADA Hooks for AI Integration:**

| Hook | Data Provided |
|------|---------------|
| `useSCADA()` | Tag values, history, fault injection |
| `useSCADAAlarms()` | Active alarms, summaries, acknowledge controls |
| `useSCADAMachineVisuals()` | Derived visual states from SCADA data |

See [SCADA_PLAN.md](../SCADA_PLAN.md) for complete SCADA API documentation.

---

## Store Integration

### AI Decisions in Zustand

```typescript
interface MillStore {
  aiDecisions: AIDecision[];
  addAIDecision: (decision: AIDecision) => void;
}

// Implementation
aiDecisions: [],
addAIDecision: (decision) => set((state) => ({
  aiDecisions: [decision, ...state.aiDecisions].slice(0, 20)
}))
```

### Maximum Decision History

- Keeps last 20 decisions in memory
- Older decisions automatically removed
- New decisions prepended to list

---

## Decision Card UI

### Card Structure

```tsx
<motion.div
  initial={{ opacity: 0, y: -20, scale: 0.95 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  className="bg-slate-900/80 rounded-lg border border-slate-700/50"
>
  {/* Color bar based on type */}
  <div className={`h-1 bg-gradient-to-r ${getTypeColor(decision.type)}`} />

  <div className="p-3">
    {/* Type badge and timestamp */}
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800">
      {decision.type}
    </span>
    <span className="text-[10px] text-slate-600">
      {decision.timestamp.toLocaleTimeString()}
    </span>
    <span className="text-[10px] text-cyan-400">
      {decision.confidence.toFixed(1)}% conf
    </span>

    {/* Action description */}
    <p className="text-sm text-white font-medium">{decision.action}</p>

    {/* Reasoning */}
    <p className="text-xs text-slate-400">{decision.reasoning}</p>

    {/* Impact */}
    <div className="text-[10px] text-green-400">
      ↗ {decision.impact}
    </div>
  </div>
</motion.div>
```

### Animation

Decisions animate in using Framer Motion:
- Fade in from above
- Slight scale up
- Smooth exit animation
