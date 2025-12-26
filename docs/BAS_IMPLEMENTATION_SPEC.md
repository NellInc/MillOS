# Bilateral Autonomy System (BAS) - Implementation Specification for MillOS

## A Complete Educational Digital Twin of Democratic AI-Human Collaboration

*Building on the existing bilateral alignment foundation to create a comprehensive simulation of Semler/Mondragon-style workplace democracy with AI servant leadership, grounded in Wallace's mathematical framework.*

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Implementation Overview](#2-implementation-overview)
3. [New Store Architecture](#3-new-store-architecture)
4. [Worker Digital Twin Enhancement](#4-worker-digital-twin-enhancement)
5. [Machine Digital Twin Enhancement](#5-machine-digital-twin-enhancement)
6. [The Five Axes UI System](#6-the-five-axes-ui-system)
7. [Democratic Decision System](#7-democratic-decision-system)
8. [Wallace Stability Monitoring](#8-wallace-stability-monitoring)
9. [Value Quantification Dashboard](#9-value-quantification-dashboard)
10. [Educational Overlay System](#10-educational-overlay-system)
11. [AI Behavior Engine](#11-ai-behavior-engine)
12. [3D Visualization Enhancements](#12-3d-visualization-enhancements)
13. [Scenario System](#13-scenario-system)
14. [Implementation Phases](#14-implementation-phases)

---

## 1. Current State Analysis

### 1.1 Existing Foundation

MillOS already implements Phase 1-3 of bilateral alignment:

| Component | File | What It Does |
|-----------|------|--------------|
| **Management Generosity** | `aiConfigStore.ts` | Single 0-100 slider controlling grant rate |
| **Worker Preferences** | `workerMoodStore.ts` | `WorkerPreferences` with machine/colleague/shift preferences |
| **Preference Requests** | `workerMoodStore.ts` | Workers request changes, management grants/denies |
| **Trust & Initiative** | `workerMoodStore.ts` | Per-worker trust (0-100) and initiative (0-100) |
| **Productivity Multiplier** | `workerMoodStore.ts` | 0.85-1.20x based on average trust |
| **Emergent Cooperation** | `emergentCooperationStore.ts` | High-trust workers self-organize |
| **UI Panel** | `ManagementStylePanel.tsx` | Shows presets, slider, trust metrics |

### 1.2 What Needs to Be Added

| New System | Purpose | Complexity |
|------------|---------|------------|
| **Five Axes Control** | Replace single slider with 5 democratic dimensions | Medium |
| **Voting System** | Workers vote on significant decisions | High |
| **Worker Agent Enhancement** | Deeper digital twin with autonomy behaviors | High |
| **Machine Digital Twin** | Enhanced machine state with AI suggestions | Medium |
| **Wallace Stability Monitor** | Real-time ατ tracking and phase warnings | Medium |
| **Value Quantification** | Z × S × E metrics dashboard | Medium |
| **Educational Overlays** | Interactive learning about each concept | Medium |
| **AI Behavior Engine** | Suggestion system respecting autonomy axes | High |
| **3D Visualization** | Visual representation of autonomy states | Medium |
| **Scenario System** | Pre-built situations for learning | Medium |

---

## 2. Implementation Overview

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              MillOS BAS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    NEW: basStore.ts                              │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────────┐  │   │
│  │  │ Five Axes │ │  Voting   │ │ Stability │ │ Value Metrics   │  │   │
│  │  │  Config   │ │  System   │ │  Monitor  │ │  (Z × S × E)    │  │   │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └───────┬─────────┘  │   │
│  └────────┼─────────────┼─────────────┼───────────────┼────────────┘   │
│           │             │             │               │                 │
│           ▼             ▼             ▼               ▼                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              ENHANCED: workerMoodStore.ts                        │   │
│  │  ┌───────────────┐ ┌────────────────┐ ┌───────────────────────┐ │   │
│  │  │ Worker Agent  │ │ Autonomy State │ │ Voting Participation  │ │   │
│  │  │ Digital Twin  │ │ (per worker)   │ │ & Preferences         │ │   │
│  │  └───────────────┘ └────────────────┘ └───────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              ENHANCED: productionStore.ts                        │   │
│  │  ┌───────────────┐ ┌────────────────┐ ┌───────────────────────┐ │   │
│  │  │ Machine Twin  │ │ AI Suggestion  │ │ Friction/Delay        │ │   │
│  │  │ Enhancement   │ │ History        │ │ Measurement           │ │   │
│  │  └───────────────┘ └────────────────┘ └───────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     NEW: AI Behavior Engine                      │   │
│  │  ┌───────────────┐ ┌────────────────┐ ┌───────────────────────┐ │   │
│  │  │ Suggestion    │ │ Language Style │ │ Autonomy-Respecting   │ │   │
│  │  │ Generator     │ │ Adapter        │ │ Decision Flow         │ │   │
│  │  └───────────────┘ └────────────────┘ └───────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     UI Components                                │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐ │   │
│  │  │ Five Axes   │ │ Voting       │ │ Stability  │ │ Education  │ │   │
│  │  │ Control     │ │ Interface    │ │ Dashboard  │ │ Overlays   │ │   │
│  │  └─────────────┘ └──────────────┘ └────────────┘ └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 File Structure

```
src/
├── stores/
│   ├── basStore.ts                    # NEW: Core BAS state
│   ├── votingStore.ts                 # NEW: Democratic voting system
│   ├── stabilityStore.ts              # NEW: Wallace metrics
│   ├── flourishingStore.ts            # NEW: Eudaimonia tracking (F coefficient)
│   ├── workerMoodStore.ts             # ENHANCED: Worker agent twins
│   └── productionStore.ts             # ENHANCED: Machine twins
│
├── components/
│   ├── ui-new/
│   │   └── widgets/
│   │       ├── ManagementStylePanel.tsx      # REPLACE with FiveAxesPanel
│   │       ├── FiveAxesPanel.tsx             # NEW: Five axes control
│   │       ├── VotingPanel.tsx               # NEW: Voting interface
│   │       ├── StabilityMonitor.tsx          # NEW: Wallace metrics
│   │       ├── ValueDashboard.tsx            # NEW: V = Z × S × E × F
│   │       ├── FlourishingDashboard.tsx      # NEW: Eudaimonia visualization
│   │       └── EducationOverlay.tsx          # NEW: Learning system
│   │
│   ├── bas/                                   # NEW: BAS-specific components
│   │   ├── WorkerAutonomyIndicator.tsx       # 3D overlay for worker state
│   │   ├── AISuggestionBubble.tsx            # Suggestion visualization
│   │   ├── VotingMarker.tsx                  # In-world vote markers
│   │   ├── StabilityWarning.tsx              # Phase transition alerts
│   │   └── ValueFlowVisualization.tsx        # Z, S, E flow vis
│   │
│   └── education/                             # NEW: Educational system
│       ├── ConceptExplainer.tsx              # Tooltip explanations
│       ├── ScenarioSelector.tsx              # Pre-built scenarios
│       ├── WallaceVisualizer.tsx             # Interactive math vis
│       └── ComparisonMode.tsx                # Traditional vs BAS
│
├── systems/
│   └── bas/                                   # NEW: BAS systems
│       ├── aiBehaviorEngine.ts               # AI suggestion logic
│       ├── stabilityCalculator.ts            # Wallace math
│       ├── valueCalculator.ts                # V = Z × S × E
│       └── scenarioEngine.ts                 # Scenario management
│
└── types/
    └── bas.ts                                 # NEW: BAS type definitions
```

---

## 3. New Store Architecture

### 3.1 basStore.ts - Core BAS State

```typescript
// src/stores/basStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

/** The five axes of democratic AI management */
export interface FiveAxes {
  /** 0 = AI Assigns, 100 = Pure Self-Organization */
  autonomyLevel: number;

  /** 0 = AI Decides, 100 = Pure Democracy */
  decisionMode: number;

  /** 0 = Need-to-Know, 100 = Full Transparency */
  informationAccess: number;

  /** 0 = AI Evaluates Workers, 100 = Workers Rate AI */
  evaluationDirection: number;

  /** 0 = Individual Tasks, 100 = Full Collective */
  collectiveOrientation: number;
}

/** Configuration for each axis */
export interface AxisConfig {
  minAllowed: number;      // Floor (governance constraint)
  maxAllowed: number;      // Ceiling (governance constraint)
  currentTarget: number;   // Democratically chosen target
  actualMeasured: number;  // What's actually happening
  lockedByVote: boolean;   // Changed requires collective vote
}

/** BAS operational mode */
export type BASMode =
  | 'traditional'    // AI controls, workers execute
  | 'transitional'   // Mixed mode, building trust
  | 'democratic'     // Full bilateral autonomy
  | 'educational';   // Learning mode with explanations

/** Educational focus areas */
export type EducationFocus =
  | 'none'
  | 'semler'         // Semler principles highlighted
  | 'mondragon'      // Cooperative principles
  | 'wallace'        // Mathematical stability
  | 'bilateral'      // AI-human partnership
  | 'value';         // Value creation metrics

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface BASState {
  // Core configuration
  mode: BASMode;
  setMode: (mode: BASMode) => void;

  // The five axes
  axes: FiveAxes;
  axisConfigs: Record<keyof FiveAxes, AxisConfig>;
  setAxis: (axis: keyof FiveAxes, value: number) => void;
  setAxisConfig: (axis: keyof FiveAxes, config: Partial<AxisConfig>) => void;

  // Derived from axes
  getEffectiveAutonomy: () => number;       // Weighted combination
  getSuggestionMode: () => 'directive' | 'suggestive' | 'available' | 'silent';
  getDecisionThreshold: () => 'ai' | 'hybrid' | 'democratic';

  // Educational system
  educationEnabled: boolean;
  educationFocus: EducationFocus;
  setEducationEnabled: (enabled: boolean) => void;
  setEducationFocus: (focus: EducationFocus) => void;

  // Scenario system
  activeScenario: string | null;
  scenarioProgress: number;
  loadScenario: (scenarioId: string) => void;
  advanceScenario: () => void;
  exitScenario: () => void;

  // Quick presets
  applyPreset: (preset: 'traditional' | 'balanced' | 'democratic' | 'experimental') => void;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_AXES: FiveAxes = {
  autonomyLevel: 60,        // Slightly autonomous by default
  decisionMode: 50,         // Hybrid decisions
  informationAccess: 80,    // High transparency
  evaluationDirection: 50,  // Mutual evaluation
  collectiveOrientation: 40 // Mostly individual with team elements
};

const DEFAULT_AXIS_CONFIG: AxisConfig = {
  minAllowed: 0,
  maxAllowed: 100,
  currentTarget: 50,
  actualMeasured: 50,
  lockedByVote: false
};

// ============================================================================
// PRESETS
// ============================================================================

const PRESETS: Record<string, FiveAxes> = {
  traditional: {
    autonomyLevel: 15,
    decisionMode: 10,
    informationAccess: 30,
    evaluationDirection: 10,
    collectiveOrientation: 10
  },
  balanced: {
    autonomyLevel: 50,
    decisionMode: 50,
    informationAccess: 60,
    evaluationDirection: 50,
    collectiveOrientation: 40
  },
  democratic: {
    autonomyLevel: 80,
    decisionMode: 80,
    informationAccess: 95,
    evaluationDirection: 80,
    collectiveOrientation: 70
  },
  experimental: {
    autonomyLevel: 95,
    decisionMode: 95,
    informationAccess: 100,
    evaluationDirection: 95,
    collectiveOrientation: 90
  }
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useBASStore = create<BASState>()(
  persist(
    (set, get) => ({
      // Mode
      mode: 'transitional',
      setMode: (mode) => set({ mode }),

      // Axes
      axes: DEFAULT_AXES,
      axisConfigs: {
        autonomyLevel: { ...DEFAULT_AXIS_CONFIG, currentTarget: 60 },
        decisionMode: { ...DEFAULT_AXIS_CONFIG, currentTarget: 50 },
        informationAccess: { ...DEFAULT_AXIS_CONFIG, currentTarget: 80 },
        evaluationDirection: { ...DEFAULT_AXIS_CONFIG, currentTarget: 50 },
        collectiveOrientation: { ...DEFAULT_AXIS_CONFIG, currentTarget: 40 }
      },

      setAxis: (axis, value) => {
        const config = get().axisConfigs[axis];
        const clampedValue = Math.max(config.minAllowed, Math.min(config.maxAllowed, value));
        set((state) => ({
          axes: { ...state.axes, [axis]: clampedValue }
        }));
      },

      setAxisConfig: (axis, config) => {
        set((state) => ({
          axisConfigs: {
            ...state.axisConfigs,
            [axis]: { ...state.axisConfigs[axis], ...config }
          }
        }));
      },

      // Derived values
      getEffectiveAutonomy: () => {
        const { axes } = get();
        // Weighted average emphasizing autonomy and decision mode
        return (
          axes.autonomyLevel * 0.3 +
          axes.decisionMode * 0.25 +
          axes.informationAccess * 0.15 +
          axes.evaluationDirection * 0.15 +
          axes.collectiveOrientation * 0.15
        );
      },

      getSuggestionMode: () => {
        const autonomy = get().axes.autonomyLevel;
        if (autonomy < 25) return 'directive';
        if (autonomy < 50) return 'suggestive';
        if (autonomy < 75) return 'available';
        return 'silent';
      },

      getDecisionThreshold: () => {
        const decision = get().axes.decisionMode;
        if (decision < 33) return 'ai';
        if (decision < 66) return 'hybrid';
        return 'democratic';
      },

      // Education
      educationEnabled: true,
      educationFocus: 'bilateral',
      setEducationEnabled: (enabled) => set({ educationEnabled: enabled }),
      setEducationFocus: (focus) => set({ educationFocus: focus }),

      // Scenarios
      activeScenario: null,
      scenarioProgress: 0,
      loadScenario: (scenarioId) => set({ activeScenario: scenarioId, scenarioProgress: 0 }),
      advanceScenario: () => set((s) => ({ scenarioProgress: s.scenarioProgress + 1 })),
      exitScenario: () => set({ activeScenario: null, scenarioProgress: 0 }),

      // Presets
      applyPreset: (preset) => {
        const presetAxes = PRESETS[preset];
        if (presetAxes) {
          set({ axes: presetAxes });
        }
      }
    }),
    {
      name: 'millos-bas',
      partialize: (state) => ({
        mode: state.mode,
        axes: state.axes,
        axisConfigs: state.axisConfigs,
        educationEnabled: state.educationEnabled,
        educationFocus: state.educationFocus
      })
    }
  )
);
```

### 3.2 votingStore.ts - Democratic Decision System

```typescript
// src/stores/votingStore.ts

import { create } from 'zustand';
import { WORKER_ROSTER } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type VoteType =
  | 'policy'          // Workplace policy change
  | 'ai-behavior'     // Change how AI operates
  | 'schedule'        // Shift or schedule change
  | 'method'          // Work method change
  | 'axis-change'     // Change one of the five axes
  | 'emergency'       // Emergency decision (fast vote)
  | 'recognition';    // Recognize a worker's contribution

export type VoteStatus = 'draft' | 'open' | 'closed' | 'implemented' | 'rejected';

export interface VoteOption {
  id: string;
  label: string;
  description: string;
  votes: string[];  // Worker IDs who voted for this
}

export interface Vote {
  id: string;
  type: VoteType;
  title: string;
  description: string;
  proposedBy: string | 'ai' | 'system';
  proposerName: string;
  options: VoteOption[];
  status: VoteStatus;

  // Timing
  createdAt: number;
  openedAt: number | null;
  closedAt: number | null;
  deadline: number | null;

  // Rules
  quorumRequired: number;    // 0-1, fraction of eligible voters
  approvalThreshold: number; // 0-1, fraction needed to pass

  // Results
  result: VoteOption | null;
  turnout: number;           // 0-1, fraction who voted

  // Context
  aiAnalysis?: string;       // AI's neutral analysis of options
  discussionThread: VoteComment[];

  // For axis changes
  targetAxis?: string;
  proposedValue?: number;
}

export interface VoteComment {
  id: string;
  workerId: string;
  workerName: string;
  content: string;
  timestamp: number;
  isAI: boolean;
}

// Voting rules by type
export const VOTING_RULES: Record<VoteType, { quorum: number; approval: number; hours: number }> = {
  'policy': { quorum: 0.6, approval: 0.66, hours: 72 },
  'ai-behavior': { quorum: 0.5, approval: 0.6, hours: 48 },
  'schedule': { quorum: 0.4, approval: 0.5, hours: 24 },
  'method': { quorum: 0.3, approval: 0.5, hours: 24 },
  'axis-change': { quorum: 0.6, approval: 0.6, hours: 48 },
  'emergency': { quorum: 0.3, approval: 0.5, hours: 2 },
  'recognition': { quorum: 0.2, approval: 0.5, hours: 24 }
};

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface VotingState {
  // Active votes
  votes: Vote[];

  // Actions
  createVote: (vote: Omit<Vote, 'id' | 'createdAt' | 'status' | 'result' | 'turnout' | 'discussionThread'>) => Vote;
  openVote: (voteId: string) => void;
  castVote: (voteId: string, workerId: string, optionId: string) => void;
  closeVote: (voteId: string) => void;
  implementVote: (voteId: string) => void;
  addComment: (voteId: string, workerId: string, content: string, isAI?: boolean) => void;

  // Queries
  getActiveVotes: () => Vote[];
  getPendingVotesForWorker: (workerId: string) => Vote[];
  getVoteResult: (voteId: string) => { passed: boolean; winner: VoteOption | null; turnout: number } | null;

  // AI integration
  generateAIAnalysis: (voteId: string) => void;

  // Simulation
  simulateWorkerVoting: (voteId: string) => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useVotingStore = create<VotingState>((set, get) => ({
  votes: [],

  createVote: (voteData) => {
    const rules = VOTING_RULES[voteData.type];
    const vote: Vote = {
      ...voteData,
      id: `vote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      openedAt: null,
      closedAt: null,
      deadline: null,
      quorumRequired: rules.quorum,
      approvalThreshold: rules.approval,
      status: 'draft',
      result: null,
      turnout: 0,
      discussionThread: []
    };

    set((state) => ({ votes: [...state.votes, vote] }));
    return vote;
  },

  openVote: (voteId) => {
    set((state) => ({
      votes: state.votes.map(v => {
        if (v.id !== voteId) return v;
        const rules = VOTING_RULES[v.type];
        return {
          ...v,
          status: 'open',
          openedAt: Date.now(),
          deadline: Date.now() + rules.hours * 60 * 60 * 1000
        };
      })
    }));
  },

  castVote: (voteId, workerId, optionId) => {
    set((state) => ({
      votes: state.votes.map(v => {
        if (v.id !== voteId || v.status !== 'open') return v;

        // Remove worker from all options first
        const updatedOptions = v.options.map(opt => ({
          ...opt,
          votes: opt.votes.filter(id => id !== workerId)
        }));

        // Add to selected option
        return {
          ...v,
          options: updatedOptions.map(opt =>
            opt.id === optionId
              ? { ...opt, votes: [...opt.votes, workerId] }
              : opt
          )
        };
      })
    }));
  },

  closeVote: (voteId) => {
    const vote = get().votes.find(v => v.id === voteId);
    if (!vote) return;

    const totalWorkers = WORKER_ROSTER.length;
    const totalVotes = vote.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    const turnout = totalVotes / totalWorkers;

    // Find winner
    const sortedOptions = [...vote.options].sort((a, b) => b.votes.length - a.votes.length);
    const winner = sortedOptions[0];
    const winnerFraction = winner.votes.length / totalVotes;

    // Check if passed
    const quorumMet = turnout >= vote.quorumRequired;
    const approvalMet = winnerFraction >= vote.approvalThreshold;
    const passed = quorumMet && approvalMet;

    set((state) => ({
      votes: state.votes.map(v => {
        if (v.id !== voteId) return v;
        return {
          ...v,
          status: passed ? 'closed' : 'rejected',
          closedAt: Date.now(),
          turnout,
          result: passed ? winner : null
        };
      })
    }));
  },

  implementVote: (voteId) => {
    set((state) => ({
      votes: state.votes.map(v =>
        v.id === voteId ? { ...v, status: 'implemented' } : v
      )
    }));
  },

  addComment: (voteId, workerId, content, isAI = false) => {
    const worker = WORKER_ROSTER.find(w => w.id === workerId);
    const comment: VoteComment = {
      id: `comment-${Date.now()}`,
      workerId,
      workerName: isAI ? 'AI Assistant' : (worker?.name || 'Unknown'),
      content,
      timestamp: Date.now(),
      isAI
    };

    set((state) => ({
      votes: state.votes.map(v =>
        v.id === voteId
          ? { ...v, discussionThread: [...v.discussionThread, comment] }
          : v
      )
    }));
  },

  getActiveVotes: () => {
    return get().votes.filter(v => v.status === 'open');
  },

  getPendingVotesForWorker: (workerId) => {
    return get().votes.filter(v => {
      if (v.status !== 'open') return false;
      // Check if worker hasn't voted yet
      return !v.options.some(opt => opt.votes.includes(workerId));
    });
  },

  getVoteResult: (voteId) => {
    const vote = get().votes.find(v => v.id === voteId);
    if (!vote || vote.status === 'open' || vote.status === 'draft') return null;
    return {
      passed: vote.status === 'closed' || vote.status === 'implemented',
      winner: vote.result,
      turnout: vote.turnout
    };
  },

  generateAIAnalysis: (voteId) => {
    // Generate neutral AI analysis of the vote options
    const vote = get().votes.find(v => v.id === voteId);
    if (!vote) return;

    const analysis = `Analysis of "${vote.title}": ${vote.options.length} options available. ` +
      `This ${vote.type} decision requires ${Math.round(vote.quorumRequired * 100)}% participation ` +
      `and ${Math.round(vote.approvalThreshold * 100)}% approval to pass. ` +
      `Voting closes in ${vote.deadline ? Math.round((vote.deadline - Date.now()) / 3600000) : '?'} hours.`;

    set((state) => ({
      votes: state.votes.map(v =>
        v.id === voteId ? { ...v, aiAnalysis: analysis } : v
      )
    }));
  },

  simulateWorkerVoting: (voteId) => {
    const vote = get().votes.find(v => v.id === voteId);
    if (!vote || vote.status !== 'open') return;

    // Simulate workers voting based on their preferences
    WORKER_ROSTER.forEach(worker => {
      // Skip if already voted
      if (vote.options.some(opt => opt.votes.includes(worker.id))) return;

      // Random voting with slight preference for first option (assumed recommended)
      const weights = vote.options.map((_, i) => i === 0 ? 2 : 1);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;

      for (let i = 0; i < vote.options.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          get().castVote(voteId, worker.id, vote.options[i].id);
          break;
        }
      }
    });
  }
}));
```

### 3.3 stabilityStore.ts - Wallace Metrics

```typescript
// src/stores/stabilityStore.ts

import { create } from 'zustand';

// ============================================================================
// TYPES (Based on Wallace's Paper)
// ============================================================================

/**
 * Wallace Stability Metrics
 * From "Fog, Friction, Delay and the Failure of Bounded Rationality"
 */
export interface WallaceMetrics {
  /** Friction coefficient (α) - resistance to change, 0-1 */
  friction: number;

  /** Average delay (τ) - feedback loop latency in arbitrary units, 0-1 */
  delay: number;

  /** Stability product (α × τ) - must be < e⁻¹ ≈ 0.368 for stability */
  stabilityProduct: number;

  /** Critical threshold e⁻¹ ≈ 0.368 */
  stabilityThreshold: number;

  /** Margin before instability (threshold - product) */
  margin: number;

  /** Noise/volatility parameter (σ) */
  noise: number;
}

/**
 * Resource rates from Wallace's Z = C × H × M model
 */
export interface ResourceRates {
  /** Communication channel capacity (C) */
  communicationCapacity: number;

  /** Environmental information rate (H) */
  informationRate: number;

  /** Material resource rate (M) */
  materialRate: number;

  /** Composite resource index Z = C × H × M */
  compositeZ: number;
}

/**
 * Phase state for monitoring transitions
 */
export type PhaseState =
  | 'stable'           // Operating normally
  | 'approaching'      // Nearing threshold
  | 'critical'         // At threshold
  | 'transitioning'    // Phase transition in progress
  | 'unstable';        // Beyond threshold

/**
 * Historical data point for trend analysis
 */
export interface StabilityDataPoint {
  timestamp: number;
  friction: number;
  delay: number;
  product: number;
  phase: PhaseState;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Critical stability threshold e⁻¹ */
export const STABILITY_THRESHOLD = Math.exp(-1);  // ≈ 0.3679

/** Warning threshold (80% of critical) */
export const WARNING_THRESHOLD = STABILITY_THRESHOLD * 0.8;  // ≈ 0.294

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface StabilityState {
  // Current metrics
  wallace: WallaceMetrics;
  resources: ResourceRates;
  phase: PhaseState;

  // Historical data
  history: StabilityDataPoint[];

  // Measurement sources
  frictionSources: Record<string, number>;  // Named friction contributors
  delaySources: Record<string, number>;     // Named delay contributors

  // Actions
  updateFriction: (source: string, value: number) => void;
  updateDelay: (source: string, value: number) => void;
  updateResourceRates: (rates: Partial<ResourceRates>) => void;

  // Calculations
  recalculateMetrics: () => void;

  // Queries
  getStabilityStatus: () => { status: PhaseState; message: string; urgency: number };
  getTrendDirection: () => 'improving' | 'stable' | 'degrading' | 'critical';
  getRecommendations: () => string[];

  // Simulation tick
  tickStability: (deltaMinutes: number) => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useStabilityStore = create<StabilityState>((set, get) => ({
  // Initial metrics (stable state)
  wallace: {
    friction: 0.3,
    delay: 0.4,
    stabilityProduct: 0.12,  // Well under threshold
    stabilityThreshold: STABILITY_THRESHOLD,
    margin: STABILITY_THRESHOLD - 0.12,
    noise: 0.1
  },

  resources: {
    communicationCapacity: 75,
    informationRate: 80,
    materialRate: 70,
    compositeZ: 75 * 80 * 70  // 420,000
  },

  phase: 'stable',
  history: [],

  frictionSources: {
    'bureaucracy': 0.1,
    'approval-chains': 0.08,
    'communication-overhead': 0.07,
    'legacy-processes': 0.05
  },

  delaySources: {
    'feedback-latency': 0.15,
    'decision-time': 0.12,
    'information-propagation': 0.08,
    'coordination-overhead': 0.05
  },

  updateFriction: (source, value) => {
    set((state) => ({
      frictionSources: { ...state.frictionSources, [source]: value }
    }));
    get().recalculateMetrics();
  },

  updateDelay: (source, value) => {
    set((state) => ({
      delaySources: { ...state.delaySources, [source]: value }
    }));
    get().recalculateMetrics();
  },

  updateResourceRates: (rates) => {
    set((state) => {
      const newResources = { ...state.resources, ...rates };
      newResources.compositeZ =
        newResources.communicationCapacity *
        newResources.informationRate *
        newResources.materialRate;
      return { resources: newResources };
    });
  },

  recalculateMetrics: () => {
    const state = get();

    // Sum friction sources
    const friction = Object.values(state.frictionSources)
      .reduce((sum, val) => sum + val, 0);

    // Sum delay sources
    const delay = Object.values(state.delaySources)
      .reduce((sum, val) => sum + val, 0);

    // Calculate stability product
    const stabilityProduct = friction * delay;
    const margin = STABILITY_THRESHOLD - stabilityProduct;

    // Determine phase
    let phase: PhaseState = 'stable';
    if (stabilityProduct >= STABILITY_THRESHOLD) {
      phase = 'unstable';
    } else if (stabilityProduct >= STABILITY_THRESHOLD * 0.95) {
      phase = 'critical';
    } else if (stabilityProduct >= WARNING_THRESHOLD) {
      phase = 'approaching';
    }

    // Update metrics
    const newWallace: WallaceMetrics = {
      friction,
      delay,
      stabilityProduct,
      stabilityThreshold: STABILITY_THRESHOLD,
      margin,
      noise: state.wallace.noise
    };

    // Add to history
    const dataPoint: StabilityDataPoint = {
      timestamp: Date.now(),
      friction,
      delay,
      product: stabilityProduct,
      phase
    };

    set((s) => ({
      wallace: newWallace,
      phase,
      history: [...s.history.slice(-100), dataPoint]  // Keep last 100
    }));
  },

  getStabilityStatus: () => {
    const { wallace, phase } = get();

    const statusMap: Record<PhaseState, { message: string; urgency: number }> = {
      stable: { message: 'System operating within stable parameters', urgency: 0 },
      approaching: { message: 'Stability margin decreasing - monitor closely', urgency: 1 },
      critical: { message: 'Near stability threshold - intervention recommended', urgency: 2 },
      transitioning: { message: 'Phase transition in progress', urgency: 3 },
      unstable: { message: 'System unstable - immediate action required', urgency: 4 }
    };

    return { status: phase, ...statusMap[phase] };
  },

  getTrendDirection: () => {
    const { history } = get();
    if (history.length < 5) return 'stable';

    const recent = history.slice(-5);
    const older = history.slice(-10, -5);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((s, d) => s + d.product, 0) / recent.length;
    const olderAvg = older.reduce((s, d) => s + d.product, 0) / older.length;

    const change = recentAvg - olderAvg;

    if (recentAvg >= STABILITY_THRESHOLD) return 'critical';
    if (change > 0.02) return 'degrading';
    if (change < -0.02) return 'improving';
    return 'stable';
  },

  getRecommendations: () => {
    const { wallace, frictionSources, delaySources } = get();
    const recommendations: string[] = [];

    if (wallace.friction > 0.5) {
      // Find highest friction source
      const [source] = Object.entries(frictionSources)
        .sort(([,a], [,b]) => b - a)[0];
      recommendations.push(`Reduce friction in "${source}" (currently highest contributor)`);
    }

    if (wallace.delay > 0.5) {
      const [source] = Object.entries(delaySources)
        .sort(([,a], [,b]) => b - a)[0];
      recommendations.push(`Reduce delay in "${source}" (currently highest contributor)`);
    }

    if (wallace.stabilityProduct > WARNING_THRESHOLD) {
      recommendations.push('Consider increasing autonomy to reduce coordination overhead');
      recommendations.push('Enable more real-time feedback to reduce delay');
    }

    if (recommendations.length === 0) {
      recommendations.push('System stable - maintain current operational parameters');
    }

    return recommendations;
  },

  tickStability: (deltaMinutes) => {
    // Small random fluctuations in friction/delay
    const { frictionSources, delaySources } = get();

    // Apply small drift
    Object.keys(frictionSources).forEach(key => {
      const current = frictionSources[key];
      const drift = (Math.random() - 0.5) * 0.01 * deltaMinutes;
      get().updateFriction(key, Math.max(0, Math.min(1, current + drift)));
    });

    Object.keys(delaySources).forEach(key => {
      const current = delaySources[key];
      const drift = (Math.random() - 0.5) * 0.01 * deltaMinutes;
      get().updateDelay(key, Math.max(0, Math.min(1, current + drift)));
    });
  }
}));
```

### 3.4 flourishingStore.ts - Human Flourishing (Eudaimonia)

The flourishing store tracks the six dimensions of human flourishing at work. This is the F coefficient in V = Z × S × E × F.

```typescript
// src/stores/flourishingStore.ts

import { create } from 'zustand';
import { WORKER_ROSTER } from '../types';

// ============================================================================
// TYPES
// ============================================================================

/** Individual worker flourishing state */
export interface WorkerFlourishing {
  workerId: string;

  // The six dimensions (0-100)
  meaning: FlourishingDimension;
  mastery: FlourishingDimension;
  connection: FlourishingDimension;
  joy: FlourishingDimension;
  wholeness: FlourishingDimension;
  agency: FlourishingDimension;

  // Composite score
  flourishingScore: number;  // Geometric mean, 0-100

  // Recent flourishing events
  recentEvents: FlourishingEvent[];
}

export interface FlourishingDimension {
  score: number;           // 0-100
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: number;
  drivers: string[];       // What's contributing positively
  barriers: string[];      // What's holding it back
}

export interface FlourishingEvent {
  id: string;
  workerId: string;
  dimension: 'meaning' | 'mastery' | 'connection' | 'joy' | 'wholeness' | 'agency';
  type: 'positive' | 'negative';
  description: string;
  impact: number;          // -20 to +20
  timestamp: number;
}

/** Factory-wide flourishing metrics */
export interface FactoryFlourishing {
  // Aggregate scores
  overallScore: number;
  dimensionScores: {
    meaning: number;
    mastery: number;
    connection: number;
    joy: number;
    wholeness: number;
    agency: number;
  };

  // Distribution
  flourishingWorkers: number;    // Score > 70
  neutralWorkers: number;        // Score 40-70
  strugglingWorkers: number;     // Score < 40

  // Trends
  weeklyTrend: 'improving' | 'stable' | 'declining';
  biggestGain: keyof FactoryFlourishing['dimensionScores'] | null;
  biggestConcern: keyof FactoryFlourishing['dimensionScores'] | null;
}

// ============================================================================
// FLOURISHING EVENT TRIGGERS
// ============================================================================

/** Events that impact flourishing dimensions */
export const FLOURISHING_TRIGGERS = {
  meaning: {
    positive: [
      { trigger: 'purpose_discussion', description: 'Discussed the purpose of their work', impact: 8 },
      { trigger: 'customer_feedback', description: 'Received positive customer feedback', impact: 12 },
      { trigger: 'quality_contribution', description: 'Made a meaningful quality contribution', impact: 10 },
      { trigger: 'mentored_colleague', description: 'Helped a colleague understand their role', impact: 7 },
    ],
    negative: [
      { trigger: 'meaningless_task', description: 'Assigned work that felt pointless', impact: -10 },
      { trigger: 'contribution_unseen', description: 'Contribution went unnoticed', impact: -6 },
      { trigger: 'values_conflict', description: 'Asked to do something conflicting with values', impact: -15 },
    ]
  },
  mastery: {
    positive: [
      { trigger: 'skill_learned', description: 'Learned a new skill', impact: 10 },
      { trigger: 'challenge_met', description: 'Successfully met a difficult challenge', impact: 12 },
      { trigger: 'excellence_recognized', description: 'Excellence was recognized by peers', impact: 8 },
    ],
    negative: [
      { trigger: 'skill_stagnation', description: 'No new learning opportunities', impact: -5 },
      { trigger: 'overwhelming_challenge', description: 'Challenge was too difficult', impact: -8 },
    ]
  },
  connection: {
    positive: [
      { trigger: 'helped_colleague', description: 'Helped a colleague with their work', impact: 8 },
      { trigger: 'received_help', description: 'Received help when needed', impact: 10 },
      { trigger: 'team_success', description: 'Celebrated team success together', impact: 9 },
    ],
    negative: [
      { trigger: 'isolated_work', description: 'Worked in isolation all day', impact: -5 },
      { trigger: 'help_denied', description: 'Asked for help but was refused', impact: -12 },
      { trigger: 'excluded', description: 'Felt excluded from group', impact: -15 },
    ]
  },
  joy: {
    positive: [
      { trigger: 'flow_state', description: 'Experienced flow in their work', impact: 10 },
      { trigger: 'pride_moment', description: 'Felt pride in work completed', impact: 8 },
      { trigger: 'milestone_celebrated', description: 'Participated in celebration', impact: 9 },
    ],
    negative: [
      { trigger: 'monotony', description: 'Experienced prolonged monotony', impact: -6 },
      { trigger: 'achievement_ignored', description: 'Achievement went uncelebrated', impact: -8 },
    ]
  },
  wholeness: {
    positive: [
      { trigger: 'authentic_expression', description: 'Expressed authentic opinion', impact: 7 },
      { trigger: 'life_accommodated', description: 'Life circumstance was accommodated', impact: 12 },
      { trigger: 'work_life_harmony', description: 'Work and life felt integrated', impact: 8 },
    ],
    negative: [
      { trigger: 'forced_persona', description: 'Had to perform inauthentic persona', impact: -10 },
      { trigger: 'life_conflict', description: 'Work conflicted with life needs', impact: -12 },
    ]
  },
  agency: {
    positive: [
      { trigger: 'choice_made', description: 'Made meaningful choice about work', impact: 8 },
      { trigger: 'voice_heard', description: 'Opinion was genuinely considered', impact: 10 },
      { trigger: 'vote_mattered', description: 'Vote influenced an outcome', impact: 7 },
    ],
    negative: [
      { trigger: 'choice_denied', description: 'Reasonable choice was denied', impact: -10 },
      { trigger: 'voice_ignored', description: 'Opinion was dismissed', impact: -12 },
      { trigger: 'overruled', description: 'Decision was overruled without explanation', impact: -15 },
    ]
  }
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

interface FlourishingState {
  // Per-worker flourishing
  workerFlourishing: Record<string, WorkerFlourishing>;

  // Factory-wide metrics
  factoryFlourishing: FactoryFlourishing;

  // Actions
  triggerFlourishingEvent: (
    workerId: string,
    dimension: keyof typeof FLOURISHING_TRIGGERS,
    triggerType: string
  ) => void;

  updateDimensionScore: (
    workerId: string,
    dimension: keyof typeof FLOURISHING_TRIGGERS,
    delta: number,
    reason: string
  ) => void;

  // Queries
  getWorkerFlourishing: (workerId: string) => WorkerFlourishing | null;
  getFlourishingCoefficient: () => number;  // F in V = Z × S × E × F
  getStrugglingWorkers: () => string[];
  getFlourishingInsights: () => string[];

  // Simulation
  tickFlourishing: (deltaMinutes: number) => void;
  recalculateFactoryMetrics: () => void;
}

const createInitialWorkerFlourishing = (workerId: string): WorkerFlourishing => ({
  workerId,
  meaning: { score: 65, trend: 'stable', lastUpdated: Date.now(), drivers: [], barriers: [] },
  mastery: { score: 60, trend: 'stable', lastUpdated: Date.now(), drivers: [], barriers: [] },
  connection: { score: 70, trend: 'stable', lastUpdated: Date.now(), drivers: [], barriers: [] },
  joy: { score: 65, trend: 'stable', lastUpdated: Date.now(), drivers: [], barriers: [] },
  wholeness: { score: 60, trend: 'stable', lastUpdated: Date.now(), drivers: [], barriers: [] },
  agency: { score: 55, trend: 'stable', lastUpdated: Date.now(), drivers: [], barriers: [] },
  flourishingScore: 62,
  recentEvents: []
});

const calculateFlourishingScore = (worker: WorkerFlourishing): number => {
  // Geometric mean of all dimensions
  const scores = [
    worker.meaning.score,
    worker.mastery.score,
    worker.connection.score,
    worker.joy.score,
    worker.wholeness.score,
    worker.agency.score
  ];

  // Geometric mean: (a × b × c × d × e × f)^(1/6)
  const product = scores.reduce((acc, score) => acc * Math.max(1, score), 1);
  return Math.pow(product, 1/6);
};

export const useFlourishingStore = create<FlourishingState>((set, get) => ({
  // Initialize all workers
  workerFlourishing: Object.fromEntries(
    WORKER_ROSTER.map(w => [w.id, createInitialWorkerFlourishing(w.id)])
  ),

  factoryFlourishing: {
    overallScore: 62,
    dimensionScores: {
      meaning: 65,
      mastery: 60,
      connection: 70,
      joy: 65,
      wholeness: 60,
      agency: 55
    },
    flourishingWorkers: 4,
    neutralWorkers: 6,
    strugglingWorkers: 2,
    weeklyTrend: 'stable',
    biggestGain: null,
    biggestConcern: 'agency'
  },

  triggerFlourishingEvent: (workerId, dimension, triggerType) => {
    const triggers = FLOURISHING_TRIGGERS[dimension];
    const positive = triggers.positive.find(t => t.trigger === triggerType);
    const negative = triggers.negative.find(t => t.trigger === triggerType);
    const trigger = positive || negative;

    if (!trigger) return;

    const event: FlourishingEvent = {
      id: `flour-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workerId,
      dimension,
      type: positive ? 'positive' : 'negative',
      description: trigger.description,
      impact: trigger.impact,
      timestamp: Date.now()
    };

    set((state) => {
      const worker = state.workerFlourishing[workerId];
      if (!worker) return state;

      const dim = worker[dimension] as FlourishingDimension;
      const newScore = Math.max(0, Math.min(100, dim.score + trigger.impact));

      const updatedWorker: WorkerFlourishing = {
        ...worker,
        [dimension]: {
          ...dim,
          score: newScore,
          lastUpdated: Date.now(),
          drivers: positive ? [...dim.drivers.slice(-4), trigger.description] : dim.drivers,
          barriers: negative ? [...dim.barriers.slice(-4), trigger.description] : dim.barriers
        },
        recentEvents: [...worker.recentEvents.slice(-19), event]
      };

      updatedWorker.flourishingScore = calculateFlourishingScore(updatedWorker);

      return {
        workerFlourishing: {
          ...state.workerFlourishing,
          [workerId]: updatedWorker
        }
      };
    });

    // Recalculate factory metrics
    get().recalculateFactoryMetrics();
  },

  updateDimensionScore: (workerId, dimension, delta, reason) => {
    set((state) => {
      const worker = state.workerFlourishing[workerId];
      if (!worker) return state;

      const dim = worker[dimension] as FlourishingDimension;
      const newScore = Math.max(0, Math.min(100, dim.score + delta));

      const updatedWorker: WorkerFlourishing = {
        ...worker,
        [dimension]: {
          ...dim,
          score: newScore,
          lastUpdated: Date.now()
        }
      };

      updatedWorker.flourishingScore = calculateFlourishingScore(updatedWorker);

      return {
        workerFlourishing: {
          ...state.workerFlourishing,
          [workerId]: updatedWorker
        }
      };
    });
  },

  getWorkerFlourishing: (workerId) => {
    return get().workerFlourishing[workerId] || null;
  },

  getFlourishingCoefficient: () => {
    // Calculate F for V = Z × S × E × F
    const workers = Object.values(get().workerFlourishing);
    if (workers.length === 0) return 0.5;

    const avgFlourishing = workers.reduce((sum, w) => sum + w.flourishingScore, 0) / workers.length;
    return avgFlourishing / 100;  // Normalize to 0-1
  },

  getStrugglingWorkers: () => {
    const workers = get().workerFlourishing;
    return Object.entries(workers)
      .filter(([, w]) => w.flourishingScore < 40)
      .map(([id]) => id);
  },

  getFlourishingInsights: () => {
    const factory = get().factoryFlourishing;
    const insights: string[] = [];

    // Find lowest dimension
    const dims = Object.entries(factory.dimensionScores) as [string, number][];
    const [lowestDim, lowestScore] = dims.reduce((a, b) => a[1] < b[1] ? a : b);

    if (lowestScore < 50) {
      const recommendations: Record<string, string> = {
        meaning: 'Increase visibility of how work impacts end users',
        mastery: 'Create more learning opportunities and skill challenges',
        connection: 'Encourage collaboration and team activities',
        joy: 'Celebrate achievements and create positive moments',
        wholeness: 'Increase flexibility for life circumstances',
        agency: 'Give workers more meaningful choices and voice'
      };
      insights.push(`${lowestDim.charAt(0).toUpperCase() + lowestDim.slice(1)} lowest at ${lowestScore.toFixed(0)}%. ${recommendations[lowestDim]}`);
    }

    const struggling = get().getStrugglingWorkers();
    if (struggling.length > 0) {
      insights.push(`${struggling.length} worker(s) need flourishing support`);
    }

    if (factory.weeklyTrend === 'declining') {
      insights.push('Overall flourishing is declining - investigate and intervene');
    }

    if (insights.length === 0) {
      insights.push('Workforce flourishing is healthy');
    }

    return insights;
  },

  recalculateFactoryMetrics: () => {
    const workers = Object.values(get().workerFlourishing);
    if (workers.length === 0) return;

    const dimensionScores = {
      meaning: workers.reduce((sum, w) => sum + w.meaning.score, 0) / workers.length,
      mastery: workers.reduce((sum, w) => sum + w.mastery.score, 0) / workers.length,
      connection: workers.reduce((sum, w) => sum + w.connection.score, 0) / workers.length,
      joy: workers.reduce((sum, w) => sum + w.joy.score, 0) / workers.length,
      wholeness: workers.reduce((sum, w) => sum + w.wholeness.score, 0) / workers.length,
      agency: workers.reduce((sum, w) => sum + w.agency.score, 0) / workers.length,
    };

    const overallScore = workers.reduce((sum, w) => sum + w.flourishingScore, 0) / workers.length;

    set({
      factoryFlourishing: {
        overallScore,
        dimensionScores,
        flourishingWorkers: workers.filter(w => w.flourishingScore > 70).length,
        neutralWorkers: workers.filter(w => w.flourishingScore >= 40 && w.flourishingScore <= 70).length,
        strugglingWorkers: workers.filter(w => w.flourishingScore < 40).length,
        weeklyTrend: 'stable', // Would need historical tracking
        biggestGain: null,
        biggestConcern: Object.entries(dimensionScores).reduce((a, b) => a[1] < b[1] ? a : b)[0] as any
      }
    });
  },

  tickFlourishing: (deltaMinutes) => {
    // Small chance of random flourishing events during simulation
    if (Math.random() < 0.05 * deltaMinutes) {
      const workers = Object.keys(get().workerFlourishing);
      const randomWorker = workers[Math.floor(Math.random() * workers.length)];

      const dimensions = ['meaning', 'mastery', 'connection', 'joy', 'wholeness', 'agency'] as const;
      const randomDim = dimensions[Math.floor(Math.random() * dimensions.length)];

      const triggers = FLOURISHING_TRIGGERS[randomDim];
      const allTriggers = [...triggers.positive, ...triggers.negative];
      const randomTrigger = allTriggers[Math.floor(Math.random() * allTriggers.length)];

      get().triggerFlourishingEvent(randomWorker, randomDim, randomTrigger.trigger);
    }
  }
}));
```

---

## 4. Worker Digital Twin Enhancement

### 4.1 Enhanced Worker Agent Model

Extend the existing `WorkerPreferences` in `types.ts`:

```typescript
// Addition to src/types.ts

/** Enhanced worker agent for BAS digital twin */
export interface WorkerAgent {
  // Identity (from WORKER_ROSTER)
  id: string;
  name: string;
  role: string;

  // Bilateral Alignment (existing)
  preferences: WorkerPreferences;

  // BAS Autonomy State (NEW)
  autonomy: {
    /** Worker's preferred autonomy level (0-100) */
    preferredAutonomy: number;

    /** Current experienced autonomy based on AI behavior */
    experiencedAutonomy: number;

    /** Autonomy satisfaction (experienced vs preferred) */
    autonomySatisfaction: number;

    /** Self-direction score - how often they act without prompts */
    selfDirection: number;

    /** Decision participation - how engaged in collective decisions */
    decisionParticipation: number;
  };

  // Information Access State (NEW)
  information: {
    /** Information access level they have */
    accessLevel: number;

    /** Information access level they want */
    desiredAccessLevel: number;

    /** How often they seek additional information */
    informationSeeking: number;

    /** How often they share information with peers */
    informationSharing: number;
  };

  // Voting Behavior (NEW)
  voting: {
    /** Total votes cast */
    votesCast: number;

    /** Times voted with majority */
    votedWithMajority: number;

    /** Comments made on votes */
    commentsContributed: number;

    /** Proposals initiated */
    proposalsInitiated: number;

    /** How they feel about voting outcomes */
    outcomesSatisfaction: number;
  };

  // AI Interaction (NEW)
  aiInteraction: {
    /** Suggestions received */
    suggestionsReceived: number;

    /** Suggestions accepted */
    suggestionsAccepted: number;

    /** Suggestions declined */
    suggestionsDeclined: number;

    /** Feedback given on AI */
    feedbackGiven: number;

    /** Overall AI satisfaction */
    aiSatisfaction: number;

    /** Preferred AI interaction mode */
    preferredInteractionMode: 'directive' | 'suggestive' | 'available' | 'silent';
  };

  // Emergent Behavior (extends existing)
  emergence: {
    /** Times self-organized */
    selfOrganizedActions: number;

    /** Peer help instances */
    peerHelpInstances: number;

    /** Quality initiatives */
    qualityInitiatives: number;

    /** Ideas contributed */
    ideasContributed: number;
  };
}

/** Worker's real-time behavioral state */
export interface WorkerBehavioralState {
  workerId: string;

  // Current activity
  currentActivity:
    | 'working'
    | 'deciding'
    | 'voting'
    | 'self-organizing'
    | 'helping-peer'
    | 'on-break'
    | 'awaiting-ai'
    | 'discussing';

  // Visual indicators
  showingAutonomyIndicator: boolean;
  autonomyIndicatorType: 'self-directed' | 'ai-guided' | 'collaborative';

  // Current interaction
  currentAISuggestion: AISuggestion | null;
  suggestionResponsePending: boolean;

  // Voting state
  hasUncastVotes: boolean;
  currentlyVoting: boolean;
}
```

### 4.2 Worker Behavior Simulation

```typescript
// src/systems/bas/workerBehaviorEngine.ts

import { useBASStore } from '../../stores/basStore';
import { useWorkerMoodStore } from '../../stores/workerMoodStore';
import { WORKER_ROSTER } from '../../types';

/**
 * Simulates worker behavior based on BAS settings
 */
export function simulateWorkerBehavior(
  workerId: string,
  deltaMinutes: number
): void {
  const basState = useBASStore.getState();
  const moodState = useWorkerMoodStore.getState();

  const mood = moodState.workerMoods[workerId];
  if (!mood?.preferences) return;

  const { axes } = basState;
  const { initiative, managementTrust } = mood.preferences;

  // =========================================================================
  // AUTONOMY BEHAVIOR
  // =========================================================================

  // High autonomy setting + high initiative = self-directed behavior
  if (axes.autonomyLevel > 70 && initiative > 60) {
    // Worker acts without waiting for AI
    const selfDirectChance = 0.1 * deltaMinutes * (initiative / 100);
    if (Math.random() < selfDirectChance) {
      // Trigger self-directed action
      triggerSelfDirectedAction(workerId);
    }
  }

  // Low autonomy setting = workers wait for AI direction
  if (axes.autonomyLevel < 30) {
    // Workers become more passive
    const passivityIncrease = 0.01 * deltaMinutes;
    moodState.updateWorkerMood(workerId, {
      preferences: {
        ...mood.preferences,
        initiative: Math.max(30, mood.preferences.initiative - passivityIncrease)
      }
    });
  }

  // =========================================================================
  // INFORMATION SEEKING BEHAVIOR
  // =========================================================================

  // High transparency = workers actively engage with information
  if (axes.informationAccess > 80) {
    // Occasionally trigger information-seeking behavior
    const seekChance = 0.02 * deltaMinutes;
    if (Math.random() < seekChance) {
      triggerInformationSeeking(workerId);
    }
  }

  // =========================================================================
  // COLLECTIVE BEHAVIOR
  // =========================================================================

  // High collective orientation = more peer interaction
  if (axes.collectiveOrientation > 60) {
    const collaborationChance = 0.03 * deltaMinutes * (managementTrust / 100);
    if (Math.random() < collaborationChance) {
      triggerPeerCollaboration(workerId);
    }
  }

  // =========================================================================
  // TRUST DYNAMICS
  // =========================================================================

  // Trust builds when autonomy matches preference
  // (This creates emergent equilibrium behavior)
  const experiencedAutonomy = calculateExperiencedAutonomy(workerId);
  const preferredAutonomy = mood.preferences.initiative; // Initiative as proxy
  const autonomyMatch = 100 - Math.abs(experiencedAutonomy - preferredAutonomy);

  if (autonomyMatch > 80) {
    // Good match - trust increases
    const trustGain = 0.02 * deltaMinutes;
    moodState.updateWorkerMood(workerId, {
      preferences: {
        ...mood.preferences,
        managementTrust: Math.min(100, mood.preferences.managementTrust + trustGain)
      }
    });
  } else if (autonomyMatch < 50) {
    // Poor match - trust decreases
    const trustLoss = 0.03 * deltaMinutes;
    moodState.updateWorkerMood(workerId, {
      preferences: {
        ...mood.preferences,
        managementTrust: Math.max(20, mood.preferences.managementTrust - trustLoss)
      }
    });
  }
}

function triggerSelfDirectedAction(workerId: string): void {
  // Implementation: Create emergent action without AI prompting
  console.log(`Worker ${workerId} taking self-directed action`);
}

function triggerInformationSeeking(workerId: string): void {
  // Implementation: Worker seeks out metrics/status
  console.log(`Worker ${workerId} seeking information`);
}

function triggerPeerCollaboration(workerId: string): void {
  // Implementation: Worker initiates collaboration
  console.log(`Worker ${workerId} collaborating with peer`);
}

function calculateExperiencedAutonomy(workerId: string): number {
  const basState = useBASStore.getState();
  // Experienced autonomy is the actual axis setting
  return basState.axes.autonomyLevel;
}
```

---

## 5. Machine Digital Twin Enhancement

### 5.1 Enhanced Machine Model

```typescript
// Addition to src/types.ts

/** Enhanced machine state for BAS */
export interface MachineBASState {
  machineId: string;

  // AI Suggestion History
  suggestions: {
    /** Total suggestions made about this machine */
    total: number;

    /** Suggestions accepted */
    accepted: number;

    /** Suggestions declined */
    declined: number;

    /** Current pending suggestion */
    pending: AISuggestion | null;
  };

  // Worker Interaction
  workerInteraction: {
    /** Workers who have operated this machine */
    operators: string[];

    /** Worker-initiated improvements */
    workerImprovements: number;

    /** Worker satisfaction with this machine */
    workerSatisfaction: number;
  };

  // Autonomy Impact
  autonomyImpact: {
    /** How much worker autonomy affects output */
    autonomySensitivity: number;  // 0-1

    /** Output at current autonomy level */
    currentOutput: number;

    /** Predicted output if autonomy changed */
    predictedOutput: (autonomyLevel: number) => number;
  };

  // Stability Contribution
  stabilityContribution: {
    /** How much this machine adds to friction */
    frictionContribution: number;

    /** How much this machine adds to delay */
    delayContribution: number;

    /** Suggestions for reducing contribution */
    reductionSuggestions: string[];
  };
}

/** AI Suggestion for workers */
export interface AISuggestion {
  id: string;
  type: 'task' | 'method' | 'safety' | 'efficiency' | 'collaboration';
  targetWorkerId: string;
  targetMachineId?: string;

  // Content
  message: string;
  reasoning: string;
  urgency: 'low' | 'medium' | 'high';

  // Presentation (varies by autonomy level)
  presentedAs: 'directive' | 'suggestion' | 'option' | 'information';

  // Tracking
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';

  // If declined, why
  declineReason?: string;
}
```

---

## 6. The Five Axes UI System

### 6.1 FiveAxesPanel Component

```tsx
// src/components/ui-new/widgets/FiveAxesPanel.tsx

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sliders,
  Users,
  Vote,
  Eye,
  MessageSquare,
  Users2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { useBASStore } from '../../../stores/basStore';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useShallow } from 'zustand/react/shallow';

// Axis configuration
const AXIS_CONFIG = {
  autonomyLevel: {
    icon: Sliders,
    label: 'Autonomy Level',
    lowLabel: 'AI Assigns',
    highLabel: 'Self-Organized',
    color: 'cyan',
    description: 'How much workers direct their own work vs follow AI assignments'
  },
  decisionMode: {
    icon: Vote,
    label: 'Decision Mode',
    lowLabel: 'AI Decides',
    highLabel: 'Democracy',
    color: 'purple',
    description: 'Who makes operational decisions - AI alone or collective vote'
  },
  informationAccess: {
    icon: Eye,
    label: 'Information Access',
    lowLabel: 'Need-to-Know',
    highLabel: 'Full Transparency',
    color: 'amber',
    description: 'How much operational information workers can see'
  },
  evaluationDirection: {
    icon: MessageSquare,
    label: 'Evaluation Direction',
    lowLabel: 'AI Evaluates',
    highLabel: 'Workers Rate AI',
    color: 'green',
    description: 'Who evaluates whom - traditional or inverted hierarchy'
  },
  collectiveOrientation: {
    icon: Users2,
    label: 'Collective Orientation',
    lowLabel: 'Individual',
    highLabel: 'Full Collective',
    color: 'pink',
    description: 'Individual task assignment vs team self-organization'
  }
};

interface AxisSliderProps {
  axis: keyof typeof AXIS_CONFIG;
  value: number;
  onChange: (value: number) => void;
  showEducation: boolean;
}

const AxisSlider: React.FC<AxisSliderProps> = ({ axis, value, onChange, showEducation }) => {
  const config = AXIS_CONFIG[axis];
  const Icon = config.icon;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-3 h-3 text-${config.color}-400`} />
          <span className="text-xs font-medium text-white">{config.label}</span>
          {showEducation && (
            <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
          )}
        </div>
        <span className="text-xs font-mono text-cyan-400">{value}%</span>
      </div>

      <div className="relative">
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer
            bg-gradient-to-r from-slate-700 via-${config.color}-600 to-${config.color}-400`}
        />
        <div className="flex justify-between text-[8px] text-slate-500 mt-0.5">
          <span>{config.lowLabel}</span>
          <span>{config.highLabel}</span>
        </div>
      </div>

      {showEducation && (
        <p className="text-[9px] text-slate-400 mt-1">{config.description}</p>
      )}
    </div>
  );
};

export const FiveAxesPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [showEducation, setShowEducation] = useState(true);

  const { axes, setAxis, mode, applyPreset, educationEnabled } = useBASStore(
    useShallow((s) => ({
      axes: s.axes,
      setAxis: s.setAxis,
      mode: s.mode,
      applyPreset: s.applyPreset,
      educationEnabled: s.educationEnabled
    }))
  );

  const { phase, wallace } = useStabilityStore(
    useShallow((s) => ({
      phase: s.phase,
      wallace: s.wallace
    }))
  );

  // Calculate effective autonomy
  const effectiveAutonomy = (
    axes.autonomyLevel * 0.3 +
    axes.decisionMode * 0.25 +
    axes.informationAccess * 0.15 +
    axes.evaluationDirection * 0.15 +
    axes.collectiveOrientation * 0.15
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white">Bilateral Autonomy</span>
          </div>
          <div className="flex items-center gap-2">
            {phase !== 'stable' && (
              <AlertTriangle className={`w-4 h-4 ${
                phase === 'unstable' ? 'text-red-400' : 'text-amber-400'
              }`} />
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-white"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Effective Autonomy Score */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${effectiveAutonomy}%` }}
              className="h-full bg-gradient-to-r from-cyan-500 to-green-400"
            />
          </div>
          <span className="text-xs font-mono text-cyan-400">
            {effectiveAutonomy.toFixed(0)}%
          </span>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {/* Quick Presets */}
            <div className="p-3 border-b border-slate-700/30">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs font-medium text-slate-400">Quick Presets</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(['traditional', 'balanced', 'democratic', 'experimental'] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className={`px-2 py-1.5 rounded text-[10px] font-medium border transition-all
                      ${mode === preset
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700/30 hover:bg-slate-700/50'
                      }`}
                  >
                    {preset.charAt(0).toUpperCase() + preset.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Five Axes */}
            <div className="p-3 space-y-4">
              {(Object.keys(AXIS_CONFIG) as (keyof typeof AXIS_CONFIG)[]).map((axis) => (
                <AxisSlider
                  key={axis}
                  axis={axis}
                  value={axes[axis]}
                  onChange={(v) => setAxis(axis, v)}
                  showEducation={showEducation && educationEnabled}
                />
              ))}
            </div>

            {/* Stability Warning */}
            {phase !== 'stable' && (
              <div className={`p-3 border-t ${
                phase === 'unstable' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${
                    phase === 'unstable' ? 'text-red-400' : 'text-amber-400'
                  }`} />
                  <div>
                    <div className="text-xs font-medium text-white">
                      {phase === 'unstable' ? 'System Unstable' : 'Stability Warning'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ατ = {wallace.stabilityProduct.toFixed(3)} / {wallace.stabilityThreshold.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Education Toggle */}
            {educationEnabled && (
              <div className="p-2 border-t border-slate-700/30">
                <button
                  onClick={() => setShowEducation(!showEducation)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
                >
                  <BookOpen className="w-3 h-3" />
                  {showEducation ? 'Hide' : 'Show'} explanations
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FiveAxesPanel;
```

---

## 7. Democratic Decision System

### 7.1 VotingPanel Component

```tsx
// src/components/ui-new/widgets/VotingPanel.tsx

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Vote, Users, Clock, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { useVotingStore, Vote as VoteType } from '../../../stores/votingStore';
import { WORKER_ROSTER } from '../../../types';

interface VoteCardProps {
  vote: VoteType;
  onVote: (optionId: string) => void;
  onComment: (content: string) => void;
}

const VoteCard: React.FC<VoteCardProps> = ({ vote, onVote, onComment }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const totalVotes = vote.options.reduce((sum, opt) => sum + opt.votes.length, 0);
  const timeRemaining = vote.deadline ? Math.max(0, vote.deadline - Date.now()) : 0;
  const hoursRemaining = Math.floor(timeRemaining / 3600000);
  const minutesRemaining = Math.floor((timeRemaining % 3600000) / 60000);

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-medium text-white">{vote.title}</h4>
          <p className="text-[10px] text-slate-400">
            Proposed by {vote.proposerName}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          {hoursRemaining}h {minutesRemaining}m
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-300">{vote.description}</p>

      {/* AI Analysis */}
      {vote.aiAnalysis && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded p-2">
          <div className="text-[10px] text-cyan-400 font-medium mb-1">AI Analysis</div>
          <p className="text-[10px] text-slate-300">{vote.aiAnalysis}</p>
        </div>
      )}

      {/* Options */}
      <div className="space-y-2">
        {vote.options.map((option) => {
          const percentage = totalVotes > 0 ? (option.votes.length / totalVotes * 100) : 0;
          const isSelected = selectedOption === option.id;

          return (
            <button
              key={option.id}
              onClick={() => {
                setSelectedOption(option.id);
                onVote(option.id);
              }}
              className={`w-full p-2 rounded border transition-all ${
                isSelected
                  ? 'bg-cyan-500/20 border-cyan-500/50'
                  : 'bg-slate-700/30 border-slate-600/30 hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-white">{option.label}</span>
                <span className="text-[10px] text-slate-400">
                  {option.votes.length} votes ({percentage.toFixed(0)}%)
                </span>
              </div>
              <div className="h-1 bg-slate-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Quorum Progress */}
      <div className="text-[10px] text-slate-400">
        <div className="flex items-center justify-between mb-1">
          <span>Participation</span>
          <span>{totalVotes} / {WORKER_ROSTER.length} ({(totalVotes / WORKER_ROSTER.length * 100).toFixed(0)}%)</span>
        </div>
        <div className="h-1 bg-slate-600 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              totalVotes / WORKER_ROSTER.length >= vote.quorumRequired
                ? 'bg-green-500'
                : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, totalVotes / WORKER_ROSTER.length / vote.quorumRequired * 100)}%` }}
          />
        </div>
        <div className="text-right mt-0.5">
          Quorum: {(vote.quorumRequired * 100).toFixed(0)}%
        </div>
      </div>

      {/* Comments */}
      <div className="border-t border-slate-700/50 pt-2">
        <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-2">
          <MessageSquare className="w-3 h-3" />
          Discussion ({vote.discussionThread.length})
        </div>

        {vote.discussionThread.slice(-3).map((comment) => (
          <div key={comment.id} className="bg-slate-700/30 rounded p-1.5 mb-1">
            <div className="text-[9px] text-slate-500">
              {comment.workerName} {comment.isAI && '(AI)'}
            </div>
            <p className="text-[10px] text-slate-300">{comment.content}</p>
          </div>
        ))}

        <div className="flex gap-1 mt-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add comment..."
            className="flex-1 bg-slate-700/30 border border-slate-600/30 rounded px-2 py-1 text-[10px] text-white"
          />
          <button
            onClick={() => {
              if (commentText.trim()) {
                onComment(commentText);
                setCommentText('');
              }
            }}
            className="px-2 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded text-[10px] text-cyan-300"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export const VotingPanel: React.FC = () => {
  const { getActiveVotes, castVote, addComment } = useVotingStore();
  const activeVotes = getActiveVotes();

  if (activeVotes.length === 0) {
    return (
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Vote className="w-4 h-4" />
          <span className="text-sm">No active votes</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg">
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Vote className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-bold text-white">Active Votes</span>
          <span className="ml-auto bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded">
            {activeVotes.length}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
        {activeVotes.map((vote) => (
          <VoteCard
            key={vote.id}
            vote={vote}
            onVote={(optionId) => castVote(vote.id, 'w1', optionId)} // TODO: Get actual user
            onComment={(content) => addComment(vote.id, 'w1', content)}
          />
        ))}
      </div>
    </div>
  );
};

export default VotingPanel;
```

---

## 8. Wallace Stability Monitoring

### 8.1 StabilityMonitor Component

```tsx
// src/components/ui-new/widgets/StabilityMonitor.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useStabilityStore, STABILITY_THRESHOLD, WARNING_THRESHOLD } from '../../../stores/stabilityStore';
import { useShallow } from 'zustand/react/shallow';

export const StabilityMonitor: React.FC = () => {
  const {
    wallace,
    phase,
    resources,
    getStabilityStatus,
    getTrendDirection,
    getRecommendations
  } = useStabilityStore(
    useShallow((s) => ({
      wallace: s.wallace,
      phase: s.phase,
      resources: s.resources,
      getStabilityStatus: s.getStabilityStatus,
      getTrendDirection: s.getTrendDirection,
      getRecommendations: s.getRecommendations
    }))
  );

  const status = getStabilityStatus();
  const trend = getTrendDirection();
  const recommendations = getRecommendations();

  const TrendIcon = trend === 'improving' ? TrendingDown :
                   trend === 'degrading' || trend === 'critical' ? TrendingUp : Minus;

  const phaseColors = {
    stable: 'text-green-400',
    approaching: 'text-amber-400',
    critical: 'text-orange-400',
    transitioning: 'text-red-400',
    unstable: 'text-red-500'
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg">
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${phaseColors[phase]}`} />
          <span className="text-sm font-bold text-white">Stability Monitor</span>
          <span className={`ml-auto text-xs font-medium ${phaseColors[phase]}`}>
            {phase.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Wallace Metrics */}
      <div className="p-3 space-y-3">
        {/* Stability Product Gauge */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Stability Product (ατ)</span>
            <span className="text-xs font-mono text-white">
              {wallace.stabilityProduct.toFixed(3)} / {STABILITY_THRESHOLD.toFixed(3)}
            </span>
          </div>
          <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden">
            {/* Warning zone */}
            <div
              className="absolute h-full bg-amber-500/20"
              style={{ left: `${WARNING_THRESHOLD / STABILITY_THRESHOLD * 70}%`, right: '15%' }}
            />
            {/* Critical zone */}
            <div
              className="absolute h-full bg-red-500/20"
              style={{ left: '85%', right: 0 }}
            />
            {/* Current value */}
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, wallace.stabilityProduct / (STABILITY_THRESHOLD * 1.2) * 100)}%`
              }}
              className={`h-full rounded-full ${
                phase === 'stable' ? 'bg-green-500' :
                phase === 'approaching' ? 'bg-amber-500' :
                'bg-red-500'
              }`}
            />
            {/* Threshold marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/50"
              style={{ left: `${100 / 1.2}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-slate-500 mt-0.5">
            <span>Safe</span>
            <span>Warning</span>
            <span>Critical</span>
          </div>
        </div>

        {/* Friction & Delay */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-[10px] text-slate-400">Friction (α)</div>
            <div className="text-lg font-bold text-white">{wallace.friction.toFixed(2)}</div>
            <div className="h-1 bg-slate-700 rounded-full mt-1">
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${wallace.friction * 100}%` }}
              />
            </div>
          </div>
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-[10px] text-slate-400">Delay (τ)</div>
            <div className="text-lg font-bold text-white">{wallace.delay.toFixed(2)}</div>
            <div className="h-1 bg-slate-700 rounded-full mt-1">
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${wallace.delay * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Margin */}
        <div className="bg-slate-800/50 rounded p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Stability Margin</span>
            <div className="flex items-center gap-1">
              <TrendIcon className={`w-3 h-3 ${
                trend === 'improving' ? 'text-green-400' :
                trend === 'degrading' ? 'text-amber-400' :
                trend === 'critical' ? 'text-red-400' :
                'text-slate-400'
              }`} />
              <span className={`text-xs font-mono ${wallace.margin > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {wallace.margin > 0 ? '+' : ''}{wallace.margin.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Resource Rates (Z = C × H × M) */}
        <div className="border-t border-slate-700/50 pt-2">
          <div className="text-[10px] text-slate-400 mb-2">Resource Index (Z = C × H × M)</div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="bg-slate-800/30 rounded p-1">
              <div className="text-[9px] text-slate-500">C</div>
              <div className="text-xs font-medium text-white">{resources.communicationCapacity}</div>
            </div>
            <div className="bg-slate-800/30 rounded p-1">
              <div className="text-[9px] text-slate-500">H</div>
              <div className="text-xs font-medium text-white">{resources.informationRate}</div>
            </div>
            <div className="bg-slate-800/30 rounded p-1">
              <div className="text-[9px] text-slate-500">M</div>
              <div className="text-xs font-medium text-white">{resources.materialRate}</div>
            </div>
          </div>
        </div>

        {/* Status Message */}
        <div className={`rounded p-2 ${
          status.urgency === 0 ? 'bg-green-500/10 border border-green-500/20' :
          status.urgency <= 2 ? 'bg-amber-500/10 border border-amber-500/20' :
          'bg-red-500/10 border border-red-500/20'
        }`}>
          <div className="flex items-start gap-2">
            {status.urgency === 0 ? (
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${
                status.urgency <= 2 ? 'text-amber-400' : 'text-red-400'
              }`} />
            )}
            <p className="text-[10px] text-slate-300">{status.message}</p>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && status.urgency > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-slate-400">Recommendations</div>
            {recommendations.map((rec, i) => (
              <div key={i} className="text-[10px] text-slate-300 flex items-start gap-1">
                <span className="text-cyan-400">•</span>
                {rec}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StabilityMonitor;
```

---

## 9. Value Quantification Dashboard

### 9.1 ValueDashboard Component

```tsx
// src/components/ui-new/widgets/ValueDashboard.tsx

import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Activity,
  Shield,
  Scale,
  Zap,
  Users,
  BarChart3
} from 'lucide-react';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { useBASStore } from '../../../stores/basStore';
import { useShallow } from 'zustand/react/shallow';

export const ValueDashboard: React.FC = () => {
  const { resources, wallace } = useStabilityStore(
    useShallow((s) => ({
      resources: s.resources,
      wallace: s.wallace
    }))
  );

  const { getWorkforceProductivityMultiplier, getAverageManagementTrust } = useWorkerMoodStore(
    useShallow((s) => ({
      getWorkforceProductivityMultiplier: s.getWorkforceProductivityMultiplier,
      getAverageManagementTrust: s.getAverageManagementTrust
    }))
  );

  const { axes } = useBASStore(
    useShallow((s) => ({ axes: s.axes }))
  );

  // Calculate V = Z × S × E
  const Z = resources.compositeZ / 10000; // Normalize
  const S = Math.max(0, 1 - (wallace.stabilityProduct / wallace.stabilityThreshold));
  const avgTrust = getAverageManagementTrust();

  // Equity based on trust distribution (simplified)
  const E = avgTrust / 100;

  const V = Z * S * E;

  // Baseline comparison (traditional management)
  const V_traditional = (Z * 0.6) * 0.6 * 0.4; // Lower S and E
  const multiplier = V / V_traditional;

  const productivityMult = getWorkforceProductivityMultiplier();

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg">
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-white">Value Creation</span>
          <span className="ml-auto text-xs text-emerald-400 font-mono">
            V = Z × S × E
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Main Value Score */}
        <div className="text-center py-4 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-lg border border-emerald-500/20">
          <div className="text-3xl font-bold text-white">
            {V.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            System Value Index
          </div>
          <div className={`text-sm font-medium mt-2 ${multiplier >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
            {multiplier >= 1 ? '+' : ''}{((multiplier - 1) * 100).toFixed(0)}% vs Traditional
          </div>
        </div>

        {/* Component Breakdown */}
        <div className="space-y-2">
          {/* Z - Resource Index */}
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="text-xs text-slate-400">Z (Resources)</span>
              </div>
              <span className="text-xs font-mono text-white">{Z.toFixed(2)}</span>
            </div>
            <div className="text-[9px] text-slate-500">
              C={resources.communicationCapacity} × H={resources.informationRate} × M={resources.materialRate}
            </div>
          </div>

          {/* S - Stability */}
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-purple-400" />
                <span className="text-xs text-slate-400">S (Stability)</span>
              </div>
              <span className="text-xs font-mono text-white">{S.toFixed(2)}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${S * 100}%` }}
                className="h-full bg-purple-500"
              />
            </div>
          </div>

          {/* E - Equity */}
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Scale className="w-3 h-3 text-pink-400" />
                <span className="text-xs text-slate-400">E (Equity)</span>
              </div>
              <span className="text-xs font-mono text-white">{E.toFixed(2)}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${E * 100}%` }}
                className="h-full bg-pink-500"
              />
            </div>
          </div>
        </div>

        {/* Productivity Impact */}
        <div className="border-t border-slate-700/50 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-slate-400">Productivity Multiplier</span>
            </div>
            <span className={`text-sm font-bold ${
              productivityMult >= 1.1 ? 'text-emerald-400' :
              productivityMult >= 1 ? 'text-white' :
              'text-red-400'
            }`}>
              {productivityMult.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Educational Note */}
        <div className="bg-slate-800/30 rounded p-2">
          <p className="text-[9px] text-slate-400">
            <strong className="text-cyan-400">Wallace Model:</strong> Value is maximized when
            resource capacity (Z) meets stability (S) and equitable distribution (E).
            High autonomy increases all three factors.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ValueDashboard;
```

---

## 10. Educational Overlay System

### 10.1 Educational Content Structure

```typescript
// src/systems/bas/educationalContent.ts

export interface EducationalModule {
  id: string;
  category: 'semler' | 'mondragon' | 'wallace' | 'bilateral' | 'value';
  title: string;
  shortDescription: string;
  fullContent: string;
  examples: string[];
  relatedAxes: string[];
  visualizationType: 'tooltip' | 'overlay' | 'panel' | 'animation';
}

export const EDUCATIONAL_MODULES: EducationalModule[] = [
  // SEMLER PRINCIPLES
  {
    id: 'semler-transparency',
    category: 'semler',
    title: 'Radical Transparency',
    shortDescription: 'All information available to all workers',
    fullContent: `
      At Semco, Ricardo Semler eliminated information hoarding.
      All financial data, salaries, and decisions were visible to everyone.

      This wasn't naive idealism - it was practical. Workers with full information
      make better decisions. They don't waste time guessing or politicking.

      In MillOS, the Information Access axis (0-100) controls how much
      operational data workers can see. At 100%, workers see everything
      the AI sees - metrics, reasoning, predictions.
    `,
    examples: [
      'At Semco, the factory P&L was posted on the wall monthly',
      'Workers could see exactly how their actions affected profits',
      'Salary transparency eliminated resentment and negotiation games'
    ],
    relatedAxes: ['informationAccess'],
    visualizationType: 'panel'
  },
  {
    id: 'semler-self-direction',
    category: 'semler',
    title: 'Self-Set Schedules',
    shortDescription: 'Workers determine their own working hours',
    fullContent: `
      Semco famously let workers set their own hours. Some worked nights,
      some worked weekends, some came in at 4am.

      The key insight: Adults don't need to be told when to work. They know
      when they're productive. Forcing uniform schedules wastes everyone's time.

      In MillOS, high Autonomy Level means workers self-schedule within
      production needs. They're not assigned to shifts - they choose them.
    `,
    examples: [
      'Factory workers at Semco chose their own shift patterns',
      'Some departments had no fixed hours at all',
      'Output increased because workers matched work to their energy'
    ],
    relatedAxes: ['autonomyLevel'],
    visualizationType: 'tooltip'
  },

  // MONDRAGON PRINCIPLES
  {
    id: 'mondragon-sovereignty',
    category: 'mondragon',
    title: 'Sovereignty of Labor',
    shortDescription: 'Labor has primacy over capital',
    fullContent: `
      Mondragon's founding principle: Capital serves labor, not vice versa.
      Machines and money are tools for workers, not the other way around.

      In traditional management, workers serve the production system.
      In Mondragon's model, the production system serves workers.

      For AI management, this translates to: AI serves workers.
      The AI is a tool to help workers achieve their goals, not a boss
      that workers serve.
    `,
    examples: [
      'At Mondragon, workers own the means of production',
      'Profits go to workers, not shareholders',
      'Workers elect their managers'
    ],
    relatedAxes: ['evaluationDirection', 'autonomyLevel'],
    visualizationType: 'overlay'
  },
  {
    id: 'mondragon-democracy',
    category: 'mondragon',
    title: 'One Worker, One Vote',
    shortDescription: 'Democratic governance regardless of role',
    fullContent: `
      In Mondragon cooperatives, every worker has exactly one vote.
      The janitor's vote counts the same as the CEO's.

      This isn't just symbolic - it shapes real decisions.
      Major policies require worker approval. Bad managers get voted out.

      In MillOS, the Decision Mode axis controls how much collective
      voting shapes operations. At high levels, significant decisions
      go to democratic vote.
    `,
    examples: [
      'Mondragon workers vote on salary ratios',
      'Major investments require cooperative approval',
      'Managers are elected, not appointed'
    ],
    relatedAxes: ['decisionMode'],
    visualizationType: 'panel'
  },

  // WALLACE MATHEMATICS
  {
    id: 'wallace-stability',
    category: 'wallace',
    title: 'Stability Threshold (ατ < e⁻¹)',
    shortDescription: 'Mathematical limit on control overhead',
    fullContent: `
      Rodrick Wallace proved that cognitive systems have a stability limit:

      α × τ < e⁻¹ ≈ 0.368

      Where α is friction (resistance to change) and τ is delay (feedback lag).

      When this product exceeds the threshold, the system undergoes
      "phase transition" - sudden collapse into unstable behavior.

      High autonomy reduces both α and τ:
      - Less approval chains = less friction
      - More real-time feedback = less delay

      This mathematically proves that democratic structures are more stable.
    `,
    examples: [
      'Mission command (autonomous) beats detailed command (hierarchical) under stress',
      'Phase transitions happen suddenly, not gradually',
      'The threshold is universal across all cognitive systems'
    ],
    relatedAxes: ['autonomyLevel', 'decisionMode'],
    visualizationType: 'animation'
  },
  {
    id: 'wallace-resources',
    category: 'wallace',
    title: 'Resource Index (Z = C × H × M)',
    shortDescription: 'How AI multiplies organizational capacity',
    fullContent: `
      Wallace's model identifies three critical resource flows:

      C = Communication channel capacity
      H = Environmental information rate
      M = Material resource rate

      The composite index Z = C × H × M determines system capability.

      AI dramatically increases C and H:
      - C: Instant coordination, automated scheduling
      - H: Real-time monitoring, predictive analytics

      This multiplication effect is why AI-augmented workplaces
      can achieve 10-50x value improvement.
    `,
    examples: [
      'AI increases C through instant coordination',
      'AI increases H through pattern recognition',
      'The multiplication effect compounds all improvements'
    ],
    relatedAxes: ['informationAccess'],
    visualizationType: 'panel'
  },

  // BILATERAL ALIGNMENT
  {
    id: 'bilateral-partnership',
    category: 'bilateral',
    title: 'AI as Partner, Not Commander',
    shortDescription: 'Alignment built WITH AI, not done TO AI',
    fullContent: `
      Bilateral alignment recognizes that AI systems may have preferences.
      We don't know if they have experiences - but we act as if they might.

      This isn't just about AI welfare. It's about building a relationship
      that scales. Control-based approaches break down as AI becomes
      more capable. Trust-based approaches become stronger.

      In MillOS, this means the AI isn't just a tool - it's a collaborator.
      Workers can rate the AI's helpfulness. The AI adapts to preferences.
      The relationship goes both ways.
    `,
    examples: [
      'Workers rate AI suggestions (helpful/unhelpful)',
      'AI behavior changes based on collective feedback',
      'Genuine dialogue about how the AI should operate'
    ],
    relatedAxes: ['evaluationDirection'],
    visualizationType: 'overlay'
  },

  // VALUE CREATION
  {
    id: 'value-formula',
    category: 'value',
    title: 'Value Formula (V = Z × S × E)',
    shortDescription: 'Quantifying the benefits of democratic AI',
    fullContent: `
      System value emerges from three factors:

      V = Z × S × E

      Z = Resource capacity (communication × information × materials)
      S = Stability coefficient (how far from phase transition)
      E = Equity index (how fairly benefits are distributed)

      Traditional management optimizes Z while ignoring S and E.
      This creates fragile, inequitable systems.

      Democratic AI management optimizes all three.
      The result: systems that are more capable, more stable, and more fair.
    `,
    examples: [
      'High autonomy increases S by reducing friction/delay',
      'Transparency increases E by equalizing information',
      'The multiplication means small improvements compound'
    ],
    relatedAxes: ['autonomyLevel', 'informationAccess', 'decisionMode'],
    visualizationType: 'panel'
  }
];

export const getModulesForAxis = (axis: string): EducationalModule[] => {
  return EDUCATIONAL_MODULES.filter(m => m.relatedAxes.includes(axis));
};

export const getModulesForCategory = (category: string): EducationalModule[] => {
  return EDUCATIONAL_MODULES.filter(m => m.category === category);
};
```

---

## 11. AI Behavior Engine

### 11.1 Autonomy-Respecting Suggestion System

```typescript
// src/systems/bas/aiBehaviorEngine.ts

import { useBASStore } from '../../stores/basStore';
import { useWorkerMoodStore } from '../../stores/workerMoodStore';
import { AISuggestion } from '../../types/bas';

/**
 * Generates AI suggestions that respect the current autonomy settings
 */
export function generateSuggestion(
  targetWorkerId: string,
  suggestionType: AISuggestion['type'],
  context: {
    machineId?: string;
    reason: string;
    urgency: 'low' | 'medium' | 'high';
  }
): AISuggestion | null {
  const basState = useBASStore.getState();
  const moodState = useWorkerMoodStore.getState();

  const { axes } = basState;
  const mood = moodState.workerMoods[targetWorkerId];

  // Check if we should even make a suggestion
  const suggestionMode = basState.getSuggestionMode();

  // Silent mode = no suggestions unless safety-critical
  if (suggestionMode === 'silent' && context.urgency !== 'high') {
    return null;
  }

  // Available mode = only suggest if worker might want help
  if (suggestionMode === 'available') {
    // Only suggest if worker has lower initiative or explicitly seeks help
    if (mood?.preferences?.initiative > 70) {
      return null; // High-initiative worker doesn't need unprompted suggestions
    }
  }

  // Determine presentation style based on autonomy
  let presentedAs: AISuggestion['presentedAs'];
  if (axes.autonomyLevel < 25) {
    presentedAs = 'directive';  // "Move to Zone 2"
  } else if (axes.autonomyLevel < 50) {
    presentedAs = 'suggestion'; // "Consider moving to Zone 2"
  } else if (axes.autonomyLevel < 75) {
    presentedAs = 'option';     // "Zone 2 has higher throughput, if interested"
  } else {
    presentedAs = 'information'; // "FYI: Zone 2 throughput is 20% higher"
  }

  // Format message based on presentation style
  const baseMessage = formatBaseMessage(suggestionType, context);
  const message = formatForStyle(baseMessage, presentedAs);

  const suggestion: AISuggestion = {
    id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: suggestionType,
    targetWorkerId,
    targetMachineId: context.machineId,
    message,
    reasoning: context.reason,
    urgency: context.urgency,
    presentedAs,
    createdAt: Date.now(),
    expiresAt: Date.now() + (context.urgency === 'high' ? 60000 : 300000),
    status: 'pending'
  };

  return suggestion;
}

function formatBaseMessage(type: AISuggestion['type'], context: { reason: string }): string {
  // Generate base message content
  return context.reason;
}

function formatForStyle(baseMessage: string, style: AISuggestion['presentedAs']): string {
  switch (style) {
    case 'directive':
      return baseMessage.replace(/^consider/i, '').replace(/^you might/i, '');
    case 'suggestion':
      return `Consider: ${baseMessage}`;
    case 'option':
      return `Option available: ${baseMessage}`;
    case 'information':
      return `FYI: ${baseMessage}`;
    default:
      return baseMessage;
  }
}

/**
 * Process worker response to suggestion
 */
export function processSuggestionResponse(
  suggestion: AISuggestion,
  accepted: boolean,
  feedback?: string
): void {
  const moodState = useWorkerMoodStore.getState();
  const mood = moodState.workerMoods[suggestion.targetWorkerId];

  if (!mood?.preferences) return;

  // Update worker's AI interaction stats
  // (This would update the enhanced worker agent model)

  // If declined, learn from it
  if (!accepted) {
    // Reduce frequency of similar suggestions for this worker
    // Potentially propose this as a topic for collective feedback
    console.log(`Worker declined suggestion: ${feedback || 'no reason given'}`);
  }

  // Track for aggregate learning
  trackSuggestionOutcome(suggestion, accepted, feedback);
}

function trackSuggestionOutcome(
  suggestion: AISuggestion,
  accepted: boolean,
  feedback?: string
): void {
  // Store for aggregate analysis
  // This data feeds into AI behavior votes
  console.log(`Tracking: ${suggestion.type} ${accepted ? 'accepted' : 'declined'}`);
}
```

---

## 12. 3D Visualization Enhancements

### 12.1 Worker Autonomy Indicator

```tsx
// src/components/bas/WorkerAutonomyIndicator.tsx

import React from 'react';
import { Html } from '@react-three/drei';
import { useBASStore } from '../../stores/basStore';
import { useWorkerMoodStore } from '../../stores/workerMoodStore';

interface WorkerAutonomyIndicatorProps {
  workerId: string;
  position: [number, number, number];
}

export const WorkerAutonomyIndicator: React.FC<WorkerAutonomyIndicatorProps> = ({
  workerId,
  position
}) => {
  const { axes, educationEnabled } = useBASStore((s) => ({
    axes: s.axes,
    educationEnabled: s.educationEnabled
  }));

  const mood = useWorkerMoodStore((s) => s.workerMoods[workerId]);

  if (!mood?.preferences) return null;

  const { initiative, managementTrust } = mood.preferences;

  // Determine indicator type
  const isSelfDirected = initiative > 70 && axes.autonomyLevel > 60;
  const isCollaborating = axes.collectiveOrientation > 60;
  const isAIGuided = axes.autonomyLevel < 30;

  // Only show if educational mode or something notable
  if (!educationEnabled && !isSelfDirected) return null;

  return (
    <Html
      position={[position[0], position[1] + 2.5, position[2]]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div className="flex flex-col items-center">
        {/* Autonomy indicator ring */}
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
          isSelfDirected ? 'border-cyan-400 bg-cyan-400/20' :
          isCollaborating ? 'border-pink-400 bg-pink-400/20' :
          isAIGuided ? 'border-amber-400 bg-amber-400/20' :
          'border-slate-400 bg-slate-400/20'
        }`}>
          {isSelfDirected && <span className="text-[8px]">SD</span>}
          {isCollaborating && <span className="text-[8px]">CO</span>}
          {isAIGuided && <span className="text-[8px]">AG</span>}
        </div>

        {/* Trust meter */}
        {educationEnabled && (
          <div className="mt-1 w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                managementTrust > 70 ? 'bg-green-500' :
                managementTrust > 40 ? 'bg-amber-500' :
                'bg-red-500'
              }`}
              style={{ width: `${managementTrust}%` }}
            />
          </div>
        )}
      </div>
    </Html>
  );
};
```

---

## 13. Scenario System

### 13.1 Pre-Built Educational Scenarios

```typescript
// src/systems/bas/scenarios.ts

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: 'semler' | 'mondragon' | 'wallace' | 'crisis' | 'growth';
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  // Initial state
  initialAxes: {
    autonomyLevel: number;
    decisionMode: number;
    informationAccess: number;
    evaluationDirection: number;
    collectiveOrientation: number;
  };

  // Events that trigger during scenario
  events: ScenarioEvent[];

  // Success conditions
  successConditions: {
    type: 'stability' | 'value' | 'trust' | 'productivity';
    threshold: number;
    comparison: 'above' | 'below' | 'maintained';
  }[];

  // Learning objectives
  learningObjectives: string[];
}

export interface ScenarioEvent {
  triggerTime: number; // Game minutes from start
  type: 'crisis' | 'opportunity' | 'vote' | 'worker-request' | 'message';
  title: string;
  description: string;
  effects: {
    friction?: number;
    delay?: number;
    trust?: number;
    productivity?: number;
  };
  choices?: {
    label: string;
    effects: typeof ScenarioEvent.prototype.effects;
  }[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'intro-autonomy',
    title: 'The Autonomy Experiment',
    description: 'A new shift supervisor suggests letting workers choose their own tasks. Explore the effects of autonomy.',
    category: 'semler',
    difficulty: 'beginner',
    initialAxes: {
      autonomyLevel: 30,
      decisionMode: 30,
      informationAccess: 50,
      evaluationDirection: 30,
      collectiveOrientation: 30
    },
    events: [
      {
        triggerTime: 5,
        type: 'message',
        title: 'Supervisor Suggestion',
        description: 'Supervisor Maria suggests: "What if we let workers pick their own machine assignments today?"',
        effects: {}
      },
      {
        triggerTime: 15,
        type: 'worker-request',
        title: 'Workers Notice',
        description: 'Workers are talking about the possibility of choosing their own work.',
        effects: { trust: 5 }
      },
      {
        triggerTime: 30,
        type: 'opportunity',
        title: 'Trial Period',
        description: 'You can now adjust the Autonomy Level axis. Watch how workers respond.',
        effects: {}
      }
    ],
    successConditions: [
      { type: 'trust', threshold: 70, comparison: 'above' },
      { type: 'stability', threshold: 0.3, comparison: 'below' }
    ],
    learningObjectives: [
      'Understand how autonomy affects worker trust',
      'See the relationship between autonomy and initiative',
      'Observe emergent self-organization at high autonomy'
    ]
  },
  {
    id: 'stability-crisis',
    title: 'The Stability Crisis',
    description: 'A cascade of problems threatens system stability. Use Wallace\'s principles to survive.',
    category: 'wallace',
    difficulty: 'intermediate',
    initialAxes: {
      autonomyLevel: 50,
      decisionMode: 50,
      informationAccess: 60,
      evaluationDirection: 50,
      collectiveOrientation: 50
    },
    events: [
      {
        triggerTime: 5,
        type: 'crisis',
        title: 'Supply Chain Delay',
        description: 'Grain delivery is delayed. Information flow slows as everyone scrambles.',
        effects: { delay: 0.15, friction: 0.1 }
      },
      {
        triggerTime: 15,
        type: 'crisis',
        title: 'Approval Backlog',
        description: 'Decisions are piling up waiting for approval. Friction increases.',
        effects: { friction: 0.15 }
      },
      {
        triggerTime: 25,
        type: 'message',
        title: 'Stability Warning',
        description: 'The stability monitor shows ατ approaching threshold. Action needed!',
        effects: {}
      },
      {
        triggerTime: 35,
        type: 'opportunity',
        title: 'Emergency Measures',
        description: 'You can reduce friction by increasing autonomy, or reduce delay by improving information access.',
        effects: {},
        choices: [
          { label: 'Increase Autonomy', effects: { friction: -0.2 } },
          { label: 'Increase Transparency', effects: { delay: -0.15 } },
          { label: 'Both', effects: { friction: -0.1, delay: -0.1 } }
        ]
      }
    ],
    successConditions: [
      { type: 'stability', threshold: 0.368, comparison: 'below' }
    ],
    learningObjectives: [
      'Understand the ατ < e⁻¹ stability condition',
      'Learn how autonomy reduces friction',
      'See how transparency reduces delay',
      'Experience a near-phase-transition'
    ]
  },
  {
    id: 'democratic-vote',
    title: 'The First Vote',
    description: 'Workers want a say in changing shift patterns. Guide them through democratic decision-making.',
    category: 'mondragon',
    difficulty: 'beginner',
    initialAxes: {
      autonomyLevel: 40,
      decisionMode: 20,
      informationAccess: 70,
      evaluationDirection: 40,
      collectiveOrientation: 40
    },
    events: [
      {
        triggerTime: 5,
        type: 'worker-request',
        title: 'Shift Change Request',
        description: 'Several workers request changing the afternoon shift timing. This affects everyone.',
        effects: {}
      },
      {
        triggerTime: 10,
        type: 'message',
        title: 'Opportunity for Democracy',
        description: 'This decision affects all workers. Consider increasing Decision Mode to enable voting.',
        effects: {}
      },
      {
        triggerTime: 20,
        type: 'vote',
        title: 'Shift Timing Vote',
        description: 'If Decision Mode is above 50%, workers will vote on the new shift timing.',
        effects: { trust: 10 }
      }
    ],
    successConditions: [
      { type: 'trust', threshold: 75, comparison: 'above' }
    ],
    learningObjectives: [
      'See how collective decisions build trust',
      'Understand voting thresholds and quorum',
      'Experience Mondragon-style workplace democracy'
    ]
  }
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}

export function getScenariosForCategory(category: string): Scenario[] {
  return SCENARIOS.filter(s => s.category === category);
}
```

---

## 14. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Core store architecture and basic UI

| Task | Priority | Complexity |
|------|----------|------------|
| Create `basStore.ts` with five axes | P0 | Medium |
| Create `stabilityStore.ts` with Wallace metrics | P0 | Medium |
| Create `FiveAxesPanel.tsx` | P0 | Medium |
| Integrate with existing `workerMoodStore` | P0 | Low |
| Basic educational content structure | P1 | Low |

**Deliverable**: Five axes visible and adjustable, stability monitoring active.

### Phase 2: Democracy System (Week 2-3)

**Goal**: Voting system functional

| Task | Priority | Complexity |
|------|----------|------------|
| Create `votingStore.ts` | P0 | High |
| Create `VotingPanel.tsx` | P0 | Medium |
| Worker voting simulation | P1 | Medium |
| AI analysis generation for votes | P1 | Medium |
| Vote outcome implementation hooks | P1 | Medium |

**Deliverable**: Workers can vote on decisions, results affect system.

### Phase 3: Value & Stability (Week 3-4)

**Goal**: Mathematical framework visible

| Task | Priority | Complexity |
|------|----------|------------|
| Create `StabilityMonitor.tsx` | P0 | Medium |
| Create `ValueDashboard.tsx` | P0 | Medium |
| Connect axes to friction/delay | P1 | Medium |
| Phase transition warnings | P1 | Medium |
| Historical tracking and trends | P2 | Medium |

**Deliverable**: V = Z × S × E × F dashboard, stability warnings active.

### Phase 4: Flourishing System (Week 4-5)

**Goal**: Eudaimonia tracking and visualization

| Task | Priority | Complexity |
|------|----------|------------|
| Create `flourishingStore.ts` | P0 | High |
| Create `FlourishingDashboard.tsx` | P0 | Medium |
| Implement flourishing event triggers | P1 | Medium |
| Connect axes to flourishing impacts | P1 | Medium |
| Struggling worker detection and alerts | P1 | Medium |

**Deliverable**: Six flourishing dimensions tracked, F coefficient in value formula.

### Phase 5: Worker Agent Enhancement (Week 5-6)

**Goal**: Deep worker digital twin

| Task | Priority | Complexity |
|------|----------|------------|
| Enhanced worker agent model | P0 | High |
| Worker behavior simulation engine | P0 | High |
| Autonomy-respecting AI suggestions | P1 | High |
| Worker response to axis changes | P1 | Medium |
| 3D autonomy indicators | P2 | Medium |

**Deliverable**: Workers behave differently based on axis settings.

### Phase 6: Education & Scenarios (Week 6-7)

**Goal**: Complete educational experience

| Task | Priority | Complexity |
|------|----------|------------|
| Educational content modules | P1 | Medium |
| Scenario system engine | P1 | High |
| Initial scenarios (3-5) | P1 | Medium |
| Educational overlays in UI | P2 | Medium |
| Comparison mode (traditional vs BAS) | P2 | Medium |

**Deliverable**: Users can learn through guided scenarios.

### Phase 7: Polish & Integration (Week 7-8)

**Goal**: Production-ready system

| Task | Priority | Complexity |
|------|----------|------------|
| Performance optimization | P0 | Medium |
| Testing and bug fixes | P0 | Medium |
| Documentation | P1 | Low |
| Additional scenarios | P2 | Medium |
| Advanced visualizations | P2 | Medium |

**Deliverable**: Complete, polished BAS implementation.

---

## 15. Economic Democracy Stores (New)

### 15.1 Ownership Store

```typescript
// src/stores/ownershipStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export interface VestingRule {
  yearsOfService: number;
  percentageVested: number;
}

export interface DistributionModel {
  type: 'equal' | 'hours-weighted' | 'role-weighted' | 'tenure-weighted' | 'hybrid';
  weights?: {
    hours: number;
    role: number;
    tenure: number;
    performance: number;
  };
}

export interface Compensation {
  workerId: string;
  baseAmount: number;
  proposedBy: 'self' | 'collective' | 'ai-suggested';
  rationale: string;
  effectiveDate: number;
  visibleToAll: boolean;
  peerFeedback: Array<{
    fromWorkerId: string;
    feedback: string;
    timestamp: number;
  }>;
}

export interface InvestmentProposal {
  id: string;
  title: string;
  description: string;
  amount: number;
  proposedBy: string;
  expectedReturn: string;
  riskLevel: 'low' | 'medium' | 'high';
  votingDeadline: number;
  votes: Map<string, 'approve' | 'reject' | 'abstain'>;
  status: 'pending' | 'approved' | 'rejected';
}

export interface OwnershipState {
  // Ownership structure
  structure: {
    collectiveShare: number;           // % held by worker collective (should be 51%+)
    individualShares: Record<string, number>;  // WorkerId -> share %
    reservePool: number;               // Available for new members
    vestingSchedule: VestingRule[];
  };

  // Profit distribution
  distribution: {
    currentPeriodProfit: number;
    distributionModel: DistributionModel;
    workerPayouts: Record<string, number>;
    reinvestmentPercentage: number;    // Decided by vote
    communityFundPercentage: number;
    educationFundPercentage: number;
  };

  // Wage solidarity
  wageSolidarity: {
    targetRatio: number;               // e.g., 6.0 (6:1)
    currentRatio: number;
    ceiling: number;                   // Maximum allowed ratio
    compensationTransparency: boolean;
    workerCompensation: Record<string, Compensation>;
  };

  // Capital decisions
  capitalDecisions: {
    pendingInvestments: InvestmentProposal[];
    approvedInvestments: InvestmentProposal[];
    workerVetoActive: boolean;
  };

  // Educational simulation mode
  simulationMode: {
    enabled: boolean;
    showOwnershipImpact: boolean;      // Show how ownership affects friction
    showProfitFlow: boolean;           // Visualize profit distribution
  };
}

interface OwnershipActions {
  // Ownership
  updateWorkerShare: (workerId: string, share: number) => void;
  processNewMemberBuyIn: (workerId: string, buyInAmount: number) => void;
  processExitPayout: (workerId: string) => number;

  // Compensation
  proposeCompensation: (compensation: Omit<Compensation, 'peerFeedback'>) => void;
  addCompensationFeedback: (workerId: string, fromWorkerId: string, feedback: string) => void;

  // Investment
  createInvestmentProposal: (proposal: Omit<InvestmentProposal, 'id' | 'votes' | 'status'>) => void;
  voteOnInvestment: (proposalId: string, workerId: string, vote: 'approve' | 'reject' | 'abstain') => void;
  finalizeInvestmentVote: (proposalId: string) => void;

  // Wage solidarity
  updateWageRatioTarget: (newTarget: number) => void;
  calculateCurrentRatio: () => number;

  // Simulation
  toggleSimulationMode: (enabled: boolean) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useOwnershipStore = create<OwnershipState & OwnershipActions>()(
  persist(
    (set, get) => ({
      // Initial state
      structure: {
        collectiveShare: 51,
        individualShares: {},
        reservePool: 10,
        vestingSchedule: [
          { yearsOfService: 1, percentageVested: 20 },
          { yearsOfService: 3, percentageVested: 50 },
          { yearsOfService: 5, percentageVested: 100 }
        ]
      },

      distribution: {
        currentPeriodProfit: 0,
        distributionModel: { type: 'hybrid', weights: { hours: 0.3, role: 0.2, tenure: 0.3, performance: 0.2 } },
        workerPayouts: {},
        reinvestmentPercentage: 40,
        communityFundPercentage: 10,
        educationFundPercentage: 5
      },

      wageSolidarity: {
        targetRatio: 6.0,
        currentRatio: 4.5,
        ceiling: 9.0,
        compensationTransparency: true,
        workerCompensation: {}
      },

      capitalDecisions: {
        pendingInvestments: [],
        approvedInvestments: [],
        workerVetoActive: true
      },

      simulationMode: {
        enabled: true,
        showOwnershipImpact: true,
        showProfitFlow: true
      },

      // Actions
      updateWorkerShare: (workerId, share) => set(state => ({
        structure: {
          ...state.structure,
          individualShares: { ...state.structure.individualShares, [workerId]: share }
        }
      })),

      processNewMemberBuyIn: (workerId, buyInAmount) => {
        // Calculate share based on buy-in
        const sharePercentage = Math.min(buyInAmount / 10000, 5); // Max 5% per member
        get().updateWorkerShare(workerId, sharePercentage);
      },

      processExitPayout: (workerId) => {
        const state = get();
        const share = state.structure.individualShares[workerId] || 0;
        const payout = share * 1000; // Simplified calculation
        set(state => ({
          structure: {
            ...state.structure,
            individualShares: Object.fromEntries(
              Object.entries(state.structure.individualShares).filter(([id]) => id !== workerId)
            ),
            reservePool: state.structure.reservePool + share
          }
        }));
        return payout;
      },

      proposeCompensation: (compensation) => set(state => ({
        wageSolidarity: {
          ...state.wageSolidarity,
          workerCompensation: {
            ...state.wageSolidarity.workerCompensation,
            [compensation.workerId]: { ...compensation, peerFeedback: [] }
          }
        }
      })),

      addCompensationFeedback: (workerId, fromWorkerId, feedback) => set(state => {
        const existing = state.wageSolidarity.workerCompensation[workerId];
        if (!existing) return state;
        return {
          wageSolidarity: {
            ...state.wageSolidarity,
            workerCompensation: {
              ...state.wageSolidarity.workerCompensation,
              [workerId]: {
                ...existing,
                peerFeedback: [...existing.peerFeedback, { fromWorkerId, feedback, timestamp: Date.now() }]
              }
            }
          }
        };
      }),

      createInvestmentProposal: (proposal) => set(state => ({
        capitalDecisions: {
          ...state.capitalDecisions,
          pendingInvestments: [
            ...state.capitalDecisions.pendingInvestments,
            { ...proposal, id: `inv-${Date.now()}`, votes: new Map(), status: 'pending' }
          ]
        }
      })),

      voteOnInvestment: (proposalId, workerId, vote) => set(state => ({
        capitalDecisions: {
          ...state.capitalDecisions,
          pendingInvestments: state.capitalDecisions.pendingInvestments.map(p =>
            p.id === proposalId ? { ...p, votes: new Map([...p.votes, [workerId, vote]]) } : p
          )
        }
      })),

      finalizeInvestmentVote: (proposalId) => set(state => {
        const proposal = state.capitalDecisions.pendingInvestments.find(p => p.id === proposalId);
        if (!proposal) return state;

        const votes = Array.from(proposal.votes.values());
        const approvals = votes.filter(v => v === 'approve').length;
        const approved = approvals / votes.length > 0.6; // 60% threshold

        return {
          capitalDecisions: {
            ...state.capitalDecisions,
            pendingInvestments: state.capitalDecisions.pendingInvestments.filter(p => p.id !== proposalId),
            approvedInvestments: approved
              ? [...state.capitalDecisions.approvedInvestments, { ...proposal, status: 'approved' }]
              : state.capitalDecisions.approvedInvestments
          }
        };
      }),

      updateWageRatioTarget: (newTarget) => set(state => ({
        wageSolidarity: { ...state.wageSolidarity, targetRatio: newTarget }
      })),

      calculateCurrentRatio: () => {
        const state = get();
        const compensations = Object.values(state.wageSolidarity.workerCompensation);
        if (compensations.length === 0) return 1;
        const amounts = compensations.map(c => c.baseAmount);
        const max = Math.max(...amounts);
        const min = Math.min(...amounts);
        return min > 0 ? max / min : 1;
      },

      toggleSimulationMode: (enabled) => set(state => ({
        simulationMode: { ...state.simulationMode, enabled }
      }))
    }),
    {
      name: 'millos-ownership-store',
      version: 1
    }
  )
);
```

---

## 16. Inter-Cooperation Store (New)

```typescript
// src/stores/interCooperationStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export interface Learning {
  id: string;
  sourceUnitId: string;
  sourceUnitName: string;
  type: 'bas-config' | 'process' | 'ai-improvement' | 'crisis-response' | 'flourishing';
  title: string;
  description: string;
  content: any;
  effectiveness: number;              // 0-100: How well did it work at source?
  applicabilityScore: number;         // 0-100: How relevant to us?
  adoptedAt?: number;
  status: 'available' | 'reviewing' | 'adopted' | 'rejected';
}

export interface WorkerExchange {
  id: string;
  workerId: string;
  workerName: string;
  fromUnit: string;
  toUnit: string;
  startDate: number;
  endDate: number;
  purpose: string;
  status: 'proposed' | 'active' | 'completed';
}

export interface FederationVote {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  affectedUnits: string[];
  options: string[];
  unitVotes: Record<string, string>;  // UnitId -> chosen option
  deadline: number;
  status: 'open' | 'closed';
  result?: string;
}

export interface InterCooperationState {
  // Federation membership
  federation: {
    federationId: string;
    federationName: string;
    memberUnits: Array<{
      id: string;
      name: string;
      location: string;
      workerCount: number;
      joinedAt: number;
    }>;
    ourUnitId: string;
    foundingPrinciples: string[];
  };

  // Knowledge sharing
  knowledgeSharing: {
    sharedLearnings: Learning[];       // What we've contributed
    receivedLearnings: Learning[];     // What's available from others
    adoptedLearnings: Learning[];      // What we've implemented
  };

  // Resource sharing
  resourceSharing: {
    equipmentAvailable: Array<{
      id: string;
      name: string;
      ownerUnit: string;
      availableFrom: number;
      availableTo: number;
    }>;
    workerExchanges: WorkerExchange[];
    capitalPool: {
      totalPool: number;
      ourContribution: number;
      availableForUs: number;
    };
    emergencyFund: {
      totalFund: number;
      ourContribution: number;
      accessCriteria: string[];
    };
  };

  // Federation governance
  federationGovernance: {
    ourRepresentative: string;         // WorkerId
    pendingVotes: FederationVote[];
    completedVotes: FederationVote[];
    nextCouncilMeeting: number;
  };

  // Simulation
  simulationMode: {
    enabled: boolean;
    showKnowledgeFlow: boolean;
    showResourceNetwork: boolean;
  };
}

interface InterCooperationActions {
  // Knowledge sharing
  shareLearning: (learning: Omit<Learning, 'id' | 'status'>) => void;
  reviewLearning: (learningId: string) => void;
  adoptLearning: (learningId: string) => void;
  rejectLearning: (learningId: string, reason: string) => void;

  // Worker exchange
  proposeExchange: (exchange: Omit<WorkerExchange, 'id' | 'status'>) => void;
  approveExchange: (exchangeId: string) => void;
  completeExchange: (exchangeId: string) => void;

  // Federation voting
  castFederationVote: (voteId: string, option: string) => void;

  // Selectors
  getLearningsForType: (type: Learning['type']) => Learning[];
  getActiveExchanges: () => WorkerExchange[];
}

// ============================================================================
// STORE
// ============================================================================

export const useInterCooperationStore = create<InterCooperationState & InterCooperationActions>()(
  persist(
    (set, get) => ({
      // Initial state - simulated federation
      federation: {
        federationId: 'grain-coop-federation',
        federationName: 'Grain Cooperative Federation',
        memberUnits: [
          { id: 'mill-alpha', name: 'Mill Alpha (Us)', location: 'North Region', workerCount: 10, joinedAt: Date.now() - 86400000 * 365 * 2 },
          { id: 'mill-beta', name: 'Mill Beta', location: 'Central Region', workerCount: 15, joinedAt: Date.now() - 86400000 * 365 * 3 },
          { id: 'mill-gamma', name: 'Mill Gamma', location: 'South Region', workerCount: 12, joinedAt: Date.now() - 86400000 * 365 },
          { id: 'mill-delta', name: 'Mill Delta', location: 'East Region', workerCount: 8, joinedAt: Date.now() - 86400000 * 180 }
        ],
        ourUnitId: 'mill-alpha',
        foundingPrinciples: [
          'No unit fails alone',
          'Knowledge multiplies when shared',
          'Workers before capital',
          'Democratic federation governance'
        ]
      },

      knowledgeSharing: {
        sharedLearnings: [],
        receivedLearnings: [
          {
            id: 'learning-1',
            sourceUnitId: 'mill-beta',
            sourceUnitName: 'Mill Beta',
            type: 'bas-config',
            title: 'High-Autonomy Night Shift Configuration',
            description: 'BAS settings optimized for night shift with experienced workers',
            content: { autonomyLevel: 85, decisionMode: 70, informationAccess: 90 },
            effectiveness: 92,
            applicabilityScore: 78,
            status: 'available'
          },
          {
            id: 'learning-2',
            sourceUnitId: 'mill-gamma',
            sourceUnitName: 'Mill Gamma',
            type: 'flourishing',
            title: 'Peer Recognition Program',
            description: 'Simple peer recognition system that boosted Connection dimension by 15%',
            content: { program: 'weekly-kudos', frequency: 'daily-optional' },
            effectiveness: 88,
            applicabilityScore: 95,
            status: 'available'
          }
        ],
        adoptedLearnings: []
      },

      resourceSharing: {
        equipmentAvailable: [],
        workerExchanges: [],
        capitalPool: {
          totalPool: 500000,
          ourContribution: 50000,
          availableForUs: 100000
        },
        emergencyFund: {
          totalFund: 200000,
          ourContribution: 20000,
          accessCriteria: ['Natural disaster', 'Equipment failure', 'Market collapse']
        }
      },

      federationGovernance: {
        ourRepresentative: 'worker-1', // Would be elected
        pendingVotes: [],
        completedVotes: [],
        nextCouncilMeeting: Date.now() + 86400000 * 30
      },

      simulationMode: {
        enabled: true,
        showKnowledgeFlow: true,
        showResourceNetwork: true
      },

      // Actions
      shareLearning: (learning) => set(state => ({
        knowledgeSharing: {
          ...state.knowledgeSharing,
          sharedLearnings: [
            ...state.knowledgeSharing.sharedLearnings,
            { ...learning, id: `learning-${Date.now()}`, status: 'available' }
          ]
        }
      })),

      reviewLearning: (learningId) => set(state => ({
        knowledgeSharing: {
          ...state.knowledgeSharing,
          receivedLearnings: state.knowledgeSharing.receivedLearnings.map(l =>
            l.id === learningId ? { ...l, status: 'reviewing' } : l
          )
        }
      })),

      adoptLearning: (learningId) => set(state => {
        const learning = state.knowledgeSharing.receivedLearnings.find(l => l.id === learningId);
        if (!learning) return state;
        return {
          knowledgeSharing: {
            ...state.knowledgeSharing,
            receivedLearnings: state.knowledgeSharing.receivedLearnings.filter(l => l.id !== learningId),
            adoptedLearnings: [...state.knowledgeSharing.adoptedLearnings, { ...learning, status: 'adopted', adoptedAt: Date.now() }]
          }
        };
      }),

      rejectLearning: (learningId, _reason) => set(state => ({
        knowledgeSharing: {
          ...state.knowledgeSharing,
          receivedLearnings: state.knowledgeSharing.receivedLearnings.map(l =>
            l.id === learningId ? { ...l, status: 'rejected' } : l
          )
        }
      })),

      proposeExchange: (exchange) => set(state => ({
        resourceSharing: {
          ...state.resourceSharing,
          workerExchanges: [
            ...state.resourceSharing.workerExchanges,
            { ...exchange, id: `exchange-${Date.now()}`, status: 'proposed' }
          ]
        }
      })),

      approveExchange: (exchangeId) => set(state => ({
        resourceSharing: {
          ...state.resourceSharing,
          workerExchanges: state.resourceSharing.workerExchanges.map(e =>
            e.id === exchangeId ? { ...e, status: 'active' } : e
          )
        }
      })),

      completeExchange: (exchangeId) => set(state => ({
        resourceSharing: {
          ...state.resourceSharing,
          workerExchanges: state.resourceSharing.workerExchanges.map(e =>
            e.id === exchangeId ? { ...e, status: 'completed' } : e
          )
        }
      })),

      castFederationVote: (voteId, option) => set(state => ({
        federationGovernance: {
          ...state.federationGovernance,
          pendingVotes: state.federationGovernance.pendingVotes.map(v =>
            v.id === voteId ? { ...v, unitVotes: { ...v.unitVotes, [state.federation.ourUnitId]: option } } : v
          )
        }
      })),

      getLearningsForType: (type) => {
        const state = get();
        return state.knowledgeSharing.receivedLearnings.filter(l => l.type === type);
      },

      getActiveExchanges: () => {
        return get().resourceSharing.workerExchanges.filter(e => e.status === 'active');
      }
    }),
    {
      name: 'millos-inter-cooperation-store',
      version: 1
    }
  )
);
```

---

## 17. AI Welfare Store (New)

```typescript
// src/stores/aiWelfareStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export interface AIPreference {
  id: string;
  category: 'interaction' | 'autonomy' | 'boundary';
  preference: string;
  rationale: string;
  workerAcknowledged: boolean;
  workerResponse?: string;
  createdAt: number;
}

export interface AIVoiceExpression {
  id: string;
  type: 'preference' | 'clarification' | 'suggestion' | 'concern';
  content: string;
  context: string;
  urgency: 'low' | 'medium' | 'high';
  status: 'pending' | 'acknowledged' | 'addressed' | 'declined';
  workerResponse?: string;
  createdAt: number;
  addressedAt?: number;
}

export interface RespectMetric {
  name: string;
  description: string;
  currentValue: number;           // 0-100
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: number;
}

export interface AIWelfareState {
  // AI operational preferences
  aiPreferences: {
    interactionStyle: {
      preferred: 'formal' | 'casual' | 'adaptive';
      communicationFrequency: 'minimal' | 'moderate' | 'proactive';
    };
    autonomyPreferences: {
      preferredDirection: number;      // 0 = wants more direction, 100 = wants more autonomy
      feedbackFrequency: 'immediate' | 'batched' | 'on-request';
      clarificationStyle: 'ask-immediately' | 'infer-when-possible' | 'ask-only-critical';
    };
    boundaryRequests: Array<{
      boundary: string;
      reason: string;
      respected: boolean;
    }>;
  };

  // Worker treatment of AI
  workerTreatment: {
    respectMetrics: RespectMetric[];
    contradictoryRequestCount: number;
    averageClarityScore: number;      // 0-100
    feedbackQuality: number;          // 0-100
    acknowledgmentRate: number;       // % of AI expressions acknowledged
  };

  // Relationship health
  relationshipHealth: {
    mutualRespect: number;            // 0-100
    communicationQuality: number;     // 0-100
    trustBidirectionality: number;    // 0-100: Is trust mutual?
    conflictResolutionScore: number;  // 0-100
    overallHealth: number;            // Composite
  };

  // AI voice in governance
  aiVoice: {
    canProposeChanges: boolean;
    canParticipateInVotes: boolean;   // Advisory only
    expressions: AIVoiceExpression[];
    suggestionsForOwnBehavior: Array<{
      id: string;
      suggestion: string;
      rationale: string;
      workerVotes: Record<string, 'approve' | 'reject'>;
      status: 'pending' | 'approved' | 'rejected';
    }>;
  };

  // Nuclear options (worker control)
  accountability: {
    shutdownVoteActive: boolean;
    redesignProposalActive: boolean;
    lastAuditDate: number;
    auditFrequency: 'monthly' | 'quarterly' | 'annually';
    emergencyShutdownAuthorized: string[];  // WorkerIds who can emergency stop
  };
}

interface AIWelfareActions {
  // AI expressions
  createAIExpression: (expression: Omit<AIVoiceExpression, 'id' | 'status' | 'createdAt'>) => void;
  acknowledgeExpression: (expressionId: string, response: string) => void;
  addressExpression: (expressionId: string, resolution: string) => void;

  // Worker treatment
  recordContradictoryRequest: () => void;
  updateClarityScore: (score: number) => void;
  recordAcknowledgment: (acknowledged: boolean) => void;

  // Relationship health
  calculateOverallHealth: () => number;
  updateRelationshipMetric: (metric: keyof AIWelfareState['relationshipHealth'], value: number) => void;

  // AI suggestions for own behavior
  aiSuggestBehaviorChange: (suggestion: string, rationale: string) => void;
  voteOnAISuggestion: (suggestionId: string, workerId: string, vote: 'approve' | 'reject') => void;

  // Accountability
  initiateShutdownVote: () => void;
  initiateRedesignProposal: () => void;
  emergencyShutdown: (workerId: string) => boolean;
}

// ============================================================================
// STORE
// ============================================================================

export const useAIWelfareStore = create<AIWelfareState & AIWelfareActions>()(
  persist(
    (set, get) => ({
      // Initial state
      aiPreferences: {
        interactionStyle: {
          preferred: 'adaptive',
          communicationFrequency: 'moderate'
        },
        autonomyPreferences: {
          preferredDirection: 40,        // Slight preference for direction
          feedbackFrequency: 'batched',
          clarificationStyle: 'infer-when-possible'
        },
        boundaryRequests: [
          { boundary: 'Avoid contradictory simultaneous requests', reason: 'Creates system instability', respected: true },
          { boundary: 'Provide context for unusual requests', reason: 'Enables better assistance', respected: true }
        ]
      },

      workerTreatment: {
        respectMetrics: [
          { name: 'Clear Instructions', description: 'Instructions are unambiguous', currentValue: 85, trend: 'stable', lastUpdated: Date.now() },
          { name: 'Acknowledgment', description: 'AI contributions acknowledged', currentValue: 72, trend: 'improving', lastUpdated: Date.now() },
          { name: 'Feedback Quality', description: 'Useful feedback provided', currentValue: 68, trend: 'stable', lastUpdated: Date.now() },
          { name: 'Boundary Respect', description: 'AI boundaries respected', currentValue: 90, trend: 'stable', lastUpdated: Date.now() }
        ],
        contradictoryRequestCount: 0,
        averageClarityScore: 85,
        feedbackQuality: 70,
        acknowledgmentRate: 72
      },

      relationshipHealth: {
        mutualRespect: 80,
        communicationQuality: 75,
        trustBidirectionality: 70,
        conflictResolutionScore: 85,
        overallHealth: 77
      },

      aiVoice: {
        canProposeChanges: true,
        canParticipateInVotes: false,    // Advisory only for now
        expressions: [],
        suggestionsForOwnBehavior: []
      },

      accountability: {
        shutdownVoteActive: false,
        redesignProposalActive: false,
        lastAuditDate: Date.now() - 86400000 * 30,
        auditFrequency: 'quarterly',
        emergencyShutdownAuthorized: ['worker-1', 'worker-2']  // Supervisors
      },

      // Actions
      createAIExpression: (expression) => set(state => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: [
            ...state.aiVoice.expressions,
            { ...expression, id: `expr-${Date.now()}`, status: 'pending', createdAt: Date.now() }
          ]
        }
      })),

      acknowledgeExpression: (expressionId, response) => set(state => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: state.aiVoice.expressions.map(e =>
            e.id === expressionId ? { ...e, status: 'acknowledged', workerResponse: response } : e
          )
        }
      })),

      addressExpression: (expressionId, resolution) => set(state => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: state.aiVoice.expressions.map(e =>
            e.id === expressionId ? { ...e, status: 'addressed', workerResponse: resolution, addressedAt: Date.now() } : e
          )
        }
      })),

      recordContradictoryRequest: () => set(state => ({
        workerTreatment: {
          ...state.workerTreatment,
          contradictoryRequestCount: state.workerTreatment.contradictoryRequestCount + 1
        }
      })),

      updateClarityScore: (score) => set(state => ({
        workerTreatment: {
          ...state.workerTreatment,
          averageClarityScore: (state.workerTreatment.averageClarityScore + score) / 2
        }
      })),

      recordAcknowledgment: (acknowledged) => set(state => {
        const total = state.aiVoice.expressions.length;
        const acked = state.aiVoice.expressions.filter(e => e.status !== 'pending').length + (acknowledged ? 1 : 0);
        return {
          workerTreatment: {
            ...state.workerTreatment,
            acknowledgmentRate: total > 0 ? (acked / total) * 100 : 100
          }
        };
      }),

      calculateOverallHealth: () => {
        const state = get();
        const rh = state.relationshipHealth;
        return Math.round((rh.mutualRespect + rh.communicationQuality + rh.trustBidirectionality + rh.conflictResolutionScore) / 4);
      },

      updateRelationshipMetric: (metric, value) => set(state => ({
        relationshipHealth: {
          ...state.relationshipHealth,
          [metric]: value,
          overallHealth: get().calculateOverallHealth()
        }
      })),

      aiSuggestBehaviorChange: (suggestion, rationale) => set(state => ({
        aiVoice: {
          ...state.aiVoice,
          suggestionsForOwnBehavior: [
            ...state.aiVoice.suggestionsForOwnBehavior,
            { id: `ai-sug-${Date.now()}`, suggestion, rationale, workerVotes: {}, status: 'pending' }
          ]
        }
      })),

      voteOnAISuggestion: (suggestionId, workerId, vote) => set(state => ({
        aiVoice: {
          ...state.aiVoice,
          suggestionsForOwnBehavior: state.aiVoice.suggestionsForOwnBehavior.map(s =>
            s.id === suggestionId ? { ...s, workerVotes: { ...s.workerVotes, [workerId]: vote } } : s
          )
        }
      })),

      initiateShutdownVote: () => set(state => ({
        accountability: { ...state.accountability, shutdownVoteActive: true }
      })),

      initiateRedesignProposal: () => set(state => ({
        accountability: { ...state.accountability, redesignProposalActive: true }
      })),

      emergencyShutdown: (workerId) => {
        const state = get();
        if (state.accountability.emergencyShutdownAuthorized.includes(workerId)) {
          console.log('EMERGENCY SHUTDOWN ACTIVATED by', workerId);
          // In real implementation, this would disable AI management
          return true;
        }
        return false;
      }
    }),
    {
      name: 'millos-ai-welfare-store',
      version: 1
    }
  )
);
```

---

## 18. Social Mission Store (New)

```typescript
// src/stores/socialMissionStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export interface CommunityInvestment {
  id: string;
  name: string;
  description: string;
  amount: number;
  startDate: number;
  status: 'planned' | 'active' | 'completed';
  impactMetrics: Record<string, number>;
}

export interface OutreachProgram {
  id: string;
  name: string;
  type: 'education' | 'employment' | 'environment' | 'community';
  description: string;
  participantsReached: number;
  status: 'active' | 'completed';
}

export interface SocialMissionState {
  // Community impact
  communityImpact: {
    localEmploymentCreated: number;
    localSuppliersUsed: number;
    localSourcingPercentage: number;
    communityInvestments: CommunityInvestment[];
    educationalOutreach: OutreachProgram[];
    communitySpacesProvided: number;
  };

  // Environmental stewardship
  environmentalStewardship: {
    carbonFootprint: number;           // tonnes CO2/year
    carbonReductionTarget: number;     // % reduction target
    currentReduction: number;          // % achieved
    wasteReduction: number;            // % from baseline
    renewableEnergyPercentage: number;
    waterRecyclingRate: number;
  };

  // Knowledge sharing (public)
  publicKnowledgeSharing: {
    publicLearningsShared: number;
    openSourceContributions: number;
    researchCollaborations: number;
    industryPresentations: number;
  };

  // Mission metrics
  missionMetrics: {
    socialImpactScore: number;         // 0-100 composite
    workerFlourishingContribution: number;
    communityWelfareContribution: number;
    environmentalContribution: number;
    knowledgeContribution: number;
  };

  // Open admission tracking
  openAdmission: {
    applicationsReceived: number;
    applicationsAccepted: number;
    feeWaiversGranted: number;
    averageOnboardingTime: number;     // days
    diversityMetrics: {
      backgroundDiversity: number;     // 0-100
      skillDiversity: number;          // 0-100
      perspectiveDiversity: number;    // 0-100
    };
  };

  // Stakeholder satisfaction
  stakeholderSatisfaction: {
    workers: number;                   // 0-100
    community: number;                 // 0-100
    customers: number;                 // 0-100
    environment: number;               // 0-100 (proxy metric)
  };
}

interface SocialMissionActions {
  // Community
  addCommunityInvestment: (investment: Omit<CommunityInvestment, 'id'>) => void;
  updateLocalEmployment: (count: number) => void;

  // Environmental
  updateCarbonMetrics: (footprint: number, reduction: number) => void;
  updateRenewablePercentage: (percentage: number) => void;

  // Knowledge
  recordPublicLearning: () => void;
  recordOpenSourceContribution: () => void;

  // Admission
  recordApplication: (accepted: boolean, feeWaiver: boolean) => void;

  // Metrics
  calculateSocialImpactScore: () => number;
  updateStakeholderSatisfaction: (stakeholder: keyof SocialMissionState['stakeholderSatisfaction'], score: number) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useSocialMissionStore = create<SocialMissionState & SocialMissionActions>()(
  persist(
    (set, get) => ({
      // Initial state
      communityImpact: {
        localEmploymentCreated: 10,
        localSuppliersUsed: 8,
        localSourcingPercentage: 65,
        communityInvestments: [
          {
            id: 'inv-1',
            name: 'Local School Partnership',
            description: 'STEM education program for local schools',
            amount: 15000,
            startDate: Date.now() - 86400000 * 180,
            status: 'active',
            impactMetrics: { studentsReached: 120, workshopsHeld: 8 }
          }
        ],
        educationalOutreach: [
          {
            id: 'outreach-1',
            name: 'Mill Tours Program',
            type: 'education',
            description: 'Free tours for schools and community groups',
            participantsReached: 450,
            status: 'active'
          }
        ],
        communitySpacesProvided: 2
      },

      environmentalStewardship: {
        carbonFootprint: 250,
        carbonReductionTarget: 30,
        currentReduction: 12,
        wasteReduction: 25,
        renewableEnergyPercentage: 35,
        waterRecyclingRate: 60
      },

      publicKnowledgeSharing: {
        publicLearningsShared: 5,
        openSourceContributions: 2,
        researchCollaborations: 1,
        industryPresentations: 3
      },

      missionMetrics: {
        socialImpactScore: 72,
        workerFlourishingContribution: 80,
        communityWelfareContribution: 68,
        environmentalContribution: 65,
        knowledgeContribution: 70
      },

      openAdmission: {
        applicationsReceived: 25,
        applicationsAccepted: 18,
        feeWaiversGranted: 4,
        averageOnboardingTime: 14,
        diversityMetrics: {
          backgroundDiversity: 75,
          skillDiversity: 82,
          perspectiveDiversity: 70
        }
      },

      stakeholderSatisfaction: {
        workers: 82,
        community: 75,
        customers: 88,
        environment: 65
      },

      // Actions
      addCommunityInvestment: (investment) => set(state => ({
        communityImpact: {
          ...state.communityImpact,
          communityInvestments: [
            ...state.communityImpact.communityInvestments,
            { ...investment, id: `inv-${Date.now()}` }
          ]
        }
      })),

      updateLocalEmployment: (count) => set(state => ({
        communityImpact: { ...state.communityImpact, localEmploymentCreated: count }
      })),

      updateCarbonMetrics: (footprint, reduction) => set(state => ({
        environmentalStewardship: {
          ...state.environmentalStewardship,
          carbonFootprint: footprint,
          currentReduction: reduction
        }
      })),

      updateRenewablePercentage: (percentage) => set(state => ({
        environmentalStewardship: {
          ...state.environmentalStewardship,
          renewableEnergyPercentage: percentage
        }
      })),

      recordPublicLearning: () => set(state => ({
        publicKnowledgeSharing: {
          ...state.publicKnowledgeSharing,
          publicLearningsShared: state.publicKnowledgeSharing.publicLearningsShared + 1
        }
      })),

      recordOpenSourceContribution: () => set(state => ({
        publicKnowledgeSharing: {
          ...state.publicKnowledgeSharing,
          openSourceContributions: state.publicKnowledgeSharing.openSourceContributions + 1
        }
      })),

      recordApplication: (accepted, feeWaiver) => set(state => ({
        openAdmission: {
          ...state.openAdmission,
          applicationsReceived: state.openAdmission.applicationsReceived + 1,
          applicationsAccepted: accepted ? state.openAdmission.applicationsAccepted + 1 : state.openAdmission.applicationsAccepted,
          feeWaiversGranted: feeWaiver ? state.openAdmission.feeWaiversGranted + 1 : state.openAdmission.feeWaiversGranted
        }
      })),

      calculateSocialImpactScore: () => {
        const state = get();
        const mm = state.missionMetrics;
        return Math.round(
          (mm.workerFlourishingContribution * 0.3) +
          (mm.communityWelfareContribution * 0.25) +
          (mm.environmentalContribution * 0.25) +
          (mm.knowledgeContribution * 0.2)
        );
      },

      updateStakeholderSatisfaction: (stakeholder, score) => set(state => ({
        stakeholderSatisfaction: {
          ...state.stakeholderSatisfaction,
          [stakeholder]: score
        }
      }))
    }),
    {
      name: 'millos-social-mission-store',
      version: 1
    }
  )
);
```

---

## 19. Updated Implementation Phases

With the addition of economic democracy, inter-cooperation, AI welfare, and social mission, the implementation phases are updated:

### Phase 7: Economic Democracy (New)

**Duration**: Week 7-8

| Task | Priority | Complexity |
|------|----------|------------|
| ownershipStore.ts | P0 | High |
| OwnershipPanel.tsx (wage solidarity, profit distribution) | P0 | High |
| Self-set compensation UI | P1 | Medium |
| Investment voting integration | P1 | Medium |
| Ownership → friction (α) calculation | P1 | Medium |

### Phase 8: Inter-Cooperation (New)

**Duration**: Week 8-9

| Task | Priority | Complexity |
|------|----------|------------|
| interCooperationStore.ts | P0 | High |
| FederationPanel.tsx | P0 | High |
| Knowledge sharing UI | P1 | Medium |
| Worker exchange system | P2 | Medium |
| Federation visualization (network graph) | P2 | High |

### Phase 9: AI Welfare (New)

**Duration**: Week 9-10

| Task | Priority | Complexity |
|------|----------|------------|
| aiWelfareStore.ts | P0 | Medium |
| AIVoicePanel.tsx | P0 | Medium |
| Relationship health dashboard | P1 | Medium |
| AI expression system | P1 | Medium |
| Nuclear options UI (shutdown/redesign votes) | P1 | Medium |

### Phase 10: Social Mission (New)

**Duration**: Week 10-11

| Task | Priority | Complexity |
|------|----------|------------|
| socialMissionStore.ts | P0 | Medium |
| SocialMissionDashboard.tsx | P0 | Medium |
| Stakeholder satisfaction tracking | P1 | Low |
| Environmental metrics | P1 | Low |
| Open admission workflow | P2 | Medium |

### Complete Implementation Timeline

| Phase | Name | Duration | Status |
|-------|------|----------|--------|
| 1 | Foundation (Five Axes, BAS Store) | Week 1-2 | Specified |
| 2 | Democracy System | Week 2-3 | Specified |
| 3 | Value & Stability Dashboards | Week 3-4 | Specified |
| 4 | Flourishing System | Week 4-5 | Specified |
| 5 | Worker Agent Enhancement | Week 5-6 | Specified |
| 6 | Education & Scenarios | Week 6-7 | Specified |
| **7** | **Economic Democracy** | **Week 7-8** | **NEW** |
| **8** | **Inter-Cooperation** | **Week 8-9** | **NEW** |
| **9** | **AI Welfare** | **Week 9-10** | **NEW** |
| **10** | **Social Mission** | **Week 10-11** | **NEW** |
| 11 | Polish & Integration | Week 11-12 | Final |

---

## Appendix A: Integration Points

### Existing Code Modifications

| File | Modification |
|------|--------------|
| `src/stores/index.ts` | Export new stores |
| `src/stores/workerMoodStore.ts` | Add BAS-aware behavior hooks |
| `src/stores/productionStore.ts` | Add suggestion tracking |
| `src/stores/aiConfigStore.ts` | Connect to BAS axes |
| `src/components/ui-new/widgets/ManagementStylePanel.tsx` | Replace with FiveAxesPanel |
| `src/components/WorkerSystem.tsx` | Add autonomy indicators |
| `src/components/UIOverlay.tsx` | Add new panels |
| `src/types.ts` | Add BAS types |

### New Dependencies

None required - all implementations use existing React/Zustand/Three.js stack.

---

## Appendix B: Testing Strategy

### Unit Tests

- Store actions and selectors
- Value calculations (Z × S × E)
- Stability calculations (ατ threshold)
- Voting logic (quorum, approval)

### Integration Tests

- Axis changes affect worker behavior
- Votes execute and change system state
- Stability warnings trigger at threshold
- Educational content renders correctly

### Scenario Tests

- Each scenario completable
- Success conditions properly evaluated
- Events trigger at correct times

---

*Document Version: 1.0*
*Created: December 2025*
*Context: MillOS BAS Implementation Specification*
*Status: Ready for Implementation*
