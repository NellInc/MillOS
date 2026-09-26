/** Technical Datalinks for the autonomous MillOS digital twin. */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { sanitizeKnowledgeState } from './persistenceMigrations';

export type KnowledgeCategory = 'principles' | 'pioneers' | 'systems' | 'case-studies';
export type KnowledgeIcon =
  | 'handshake'
  | 'heart-handshake'
  | 'vote'
  | 'flower-2'
  | 'sparkles'
  | 'user'
  | 'settings'
  | 'sliders'
  | 'chart-bar'
  | 'refresh-cw'
  | 'network'
  | 'heart'
  | 'factory'
  | 'book-open'
  | 'scale'
  | 'brain'
  | 'gamepad-2'
  | 'sprout'
  | 'users'
  | 'cog'
  | 'library';

export interface KnowledgeQuote {
  text: string;
  author: string;
}

export interface UnlockCondition {
  type: 'achievement' | 'feature-use' | 'time-played' | 'always';
  requirement?: string;
  description: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  icon: KnowledgeIcon;
  tooltip: string;
  brief: string;
  article: string;
  relatedEntries: string[];
  seeInAction: string[];
  unlockCondition: UnlockCondition;
  quote?: KnowledgeQuote;
}

export interface UnlockContext {
  minutesPlayed?: number;
}

export interface KnowledgeState {
  unlockedEntries: Set<string>;
  readEntries: Set<string>;
  newEntries: Set<string>;
  showTooltips: boolean;
  showLoadingQuotes: boolean;
  showAINarration: boolean;
  showUnlockNotifications: boolean;
  unlockEntry: (entryId: string) => void;
  markAsRead: (entryId: string) => void;
  clearNewBadge: (entryId: string) => void;
  checkUnlockConditions: (context: UnlockContext) => void;
  setShowTooltips: (show: boolean) => void;
  setShowLoadingQuotes: (show: boolean) => void;
  setShowAINarration: (show: boolean) => void;
  setShowUnlockNotifications: (show: boolean) => void;
  getEntry: (id: string) => KnowledgeEntry | undefined;
  getEntriesByCategory: (category: KnowledgeCategory) => KnowledgeEntry[];
  isUnlocked: (id: string) => boolean;
  isNew: (id: string) => boolean;
  getUnlockedCount: () => number;
  getTotalCount: () => number;
}

const always: UnlockCondition = {
  type: 'always',
  description: 'Available in the autonomous operations library',
};

export const LOADING_QUOTES: KnowledgeQuote[] = [
  {
    text: 'Trace every lot, state change, alarm, and dispatch.',
    author: 'MillOS control principle',
  },
  {
    text: 'A safe stop is part of production, not a failure of it.',
    author: 'MillOS control principle',
  },
  {
    text: 'Motion should reveal process state before decoration.',
    author: 'MillOS visual principle',
  },
  {
    text: 'One world, one clock, one source of operational truth.',
    author: 'MillOS architecture principle',
  },
  { text: 'Autonomy earns trust through legible evidence.', author: 'MillOS autonomy principle' },
  {
    text: 'Every alarm needs a condition, disposition, and recovery path.',
    author: 'MillOS SCADA principle',
  },
  {
    text: 'A well-run mill is boring. Boring is the goal.',
    author: 'MillOS control principle',
  },
  {
    text: 'Every sensor tells the truth. The dashboard is where interpretation begins.',
    author: 'MillOS SCADA principle',
  },
  {
    text: 'If the forklifts are confused, so is the system.',
    author: 'MillOS logistics principle',
  },
];

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    id: 'unified-digital-twin',
    title: 'Unified Digital Twin',
    category: 'principles',
    icon: 'factory',
    tooltip: 'Interior, yard, village, farm, and water share one simulation.',
    brief:
      'The factory and its surroundings share one coordinate system, one clock, and one weather state. There is no seam between inside and out.',
    article: `## One Continuous Site\n\nMill floor, loading yard, village, farm, stream, and distant terrain are all part of one world. Moving the camera changes what you see, not what is being simulated.\n\nThis means trucks approach the same docks visible from inside. Water flows through the same culvert you can see from the road. Sun, moon, lamps, and process clocks all derive from a single time source. No seams, no duplicated state, no discontinuous lighting.\n\nIt also makes faults easier to find. Positioning, occlusion, route clearance, and depth-layer policies can all be measured in one coordinate system rather than translated between disconnected scenes.`,
    relatedEntries: ['autonomous-material-flow', 'environment-cycle'],
    seeInAction: ['3D world', 'Overview workspace'],
    unlockCondition: always,
  },
  {
    id: 'autonomous-material-flow',
    title: 'Autonomous Material Flow',
    category: 'systems',
    icon: 'network',
    tooltip: 'Source lots remain traceable through silos, mills, sifters, and packers.',
    brief: 'Every bag of flour can trace its lineage back to the grain that arrived at the dock.',
    article: `## Causal Material Flow\n\nGrain arrives as a receiving manifest and becomes a source lot. Every transformation — milling, sifting, packing — records what went in, what came out, which machine did it, and when. Dispatch can only load released material. No shortcuts.\n\nThe genealogy balance compares received, in-process, shipped, and lost mass. A discrepancy is a control defect, not a rounding error. Quality holds follow the affected batches rather than applying a blanket penalty to the whole line.\n\nThis gives the SCADA workspace evidence for every major action. A state can be reconstructed from its inputs, not inferred from a dashboard number.`,
    relatedEntries: ['scada-alarm-lifecycle', 'batch-quality'],
    seeInAction: ['SCADA provenance', 'Batch genealogy'],
    unlockCondition: always,
  },
  {
    id: 'scada-alarm-lifecycle',
    title: 'SCADA Alarm Lifecycle',
    category: 'systems',
    icon: 'chart-bar',
    tooltip: 'Alarms expose state, acknowledgement, disposition, and recovery.',
    brief:
      'An alarm is not just a noise. It is a condition, a disposition, a piece of evidence, and a record of who did what about it.',
    article: `## Alarm State Is Evidence\n\nEvery alarm records the tag, the limit, the measured value, the priority, the time, and the literal condition. Acknowledging an alarm does not make the process condition go away. Return-to-normal does not excuse you from acknowledging it.\n\nShelving hides an alarm temporarily. Suppression is a deliberate, bounded control decision. Out-of-service means the signal cannot be trusted right now. Each of these requires a name and a reason, so the timeline stays honest.\n\nFlood monitoring counts occurrences over a rolling window. Event history is kept separate from the active alarm list — a cleared symptom should not vanish from operational memory.`,
    relatedEntries: ['predictive-maintenance', 'autonomous-evidence'],
    seeInAction: ['SCADA alarms', 'Event history'],
    unlockCondition: always,
  },
  {
    id: 'predictive-maintenance',
    title: 'Predictive Maintenance Loop',
    category: 'systems',
    icon: 'settings',
    tooltip: 'Wear becomes diagnosis, parts demand, repair, verification, and restart.',
    brief:
      'Fix things before they break. And when they do break, fix them properly — with parts, evidence, and a controlled restart.',
    article: `## From Signal to Return to Service\n\nTemperature, vibration, load, and wear can raise a predictive alert before anything actually breaks. When something does break, a work order opens with a diagnosed cause and the parts it needs. No parts, no repair — the system will not pretend.\n\nDispatch a service unit from the Predictive Maintenance panel to carry the order through repair and verification. The machine stays locked out until its controlled restart is confirmed, wear is reduced, and it reports ready.\n\nEvery phase transition is recorded. A progress bar cannot claim recovery while the production model still considers the machine critical.`,
    relatedEntries: ['scada-alarm-lifecycle', 'autonomous-evidence'],
    seeInAction: ['Predictive maintenance', 'SCADA maintenance provenance'],
    unlockCondition: always,
  },
  {
    id: 'batch-quality',
    title: 'Batch Quality and Recall',
    category: 'case-studies',
    icon: 'scale',
    tooltip: 'Quality disposition follows exact batches and source lots.',
    brief:
      'A quality hold follows the flour, not the factory. Only the affected batches stop moving.',
    article: `## Bounded Quality Decisions\n\nA quality test names the batch, source lots, equipment, test type, measurements, and who ordered it. A hold stops dispatch of the suspect material while the rest of the line keeps running. A passing retest releases the investigated scope. A recall isolates only what needs isolating.\n\nThis is more informative than a single quality score that goes up or down. The score still works for trends, but the genealogy and disposition records carry the evidence you actually need to act.`,
    relatedEntries: ['autonomous-material-flow', 'scada-alarm-lifecycle'],
    seeInAction: ['Overview batch genealogy', 'SCADA quality provenance'],
    unlockCondition: always,
  },
  {
    id: 'autonomous-logistics',
    title: 'Autonomous Logistics Choreography',
    category: 'case-studies',
    icon: 'refresh-cw',
    tooltip: 'Forklifts, dock doors, trailers, and manifests move as one system.',
    brief: 'Forklifts say where they are going and trucks follow a sequence. Nobody cuts in line.',
    article: `## Legible Yard Motion\n\nEvery forklift publishes where it is, where it is heading, and when it intends to stop — which is more communication than most warehouse colleagues manage. Conflict prediction checks nearby vehicles and obstacles before anything moves.\n\nTrucks follow a strict choreography: approach, alignment, dock, loading, departure. Dock plates, doors, lamps, and manifests all agree with whichever phase is active. Decorative animation scales with graphics quality, but process-critical state changes remain visible regardless.`,
    relatedEntries: ['autonomous-material-flow', 'unified-digital-twin'],
    seeInAction: ['Shipping yard', 'Forklift telemetry'],
    unlockCondition: always,
  },
  {
    id: 'environment-cycle',
    title: 'Environment and Celestial Cycle',
    category: 'pioneers',
    icon: 'sparkles',
    tooltip: 'Sky, sun, moon, mountains, windows, lamps, and water share time.',
    brief:
      'The sky, the lamps, the puddles, and the mountains all answer to the same clock and weather.',
    article: `## A Coherent Backdrop\n\nSky, haze, clouds, sun, moon, stars, mountains, window glow, yard lamps, and water all move together rather than on independent timers. When the sun sets, the whole world agrees about it.\n\nDistant ridges hold their silhouette without competing with the factory. The moon and stars arrive as daylight leaves. Weather modifies cloud cover, light contrast, and water character without replacing the world — rain makes it wetter, not different.\n\nStable shader cache keys and bounded per-frame updates keep the cycle continuous without recompilation or allocation churn.`,
    relatedEntries: ['unified-digital-twin', 'depth-and-material-policy'],
    seeInAction: ['Sky and mountains', 'Stream and culvert'],
    unlockCondition: always,
  },
  {
    id: 'depth-and-material-policy',
    title: 'Depth and Material Policy',
    category: 'principles',
    icon: 'sliders',
    tooltip: 'Shared layers and explicit colour spaces prevent visual instability.',
    brief:
      'Surfaces do not fight for the same pixel. Explicit depth and colour-space contracts keep them honest.',
    article: `## Stable Surfaces\n\nExterior ground surfaces share one elevation and use polygon offset to sort themselves. Floor markings disable depth writes. Decals use bounded offsets. Camera near and far planes preserve depth precision across the whole site.\n\nProcedural albedo textures declare sRGB colour space. Normal, roughness, metalness, and height maps stay linear. Getting this wrong makes cobblestones glow or gives metal the sheen of wet soap — neither is a good look.\n\nThese contracts prevent flicker, washed-out colour, mirror-smooth roughness failures, and the seams that appear when surfaces are separated by guesswork.`,
    relatedEntries: ['environment-cycle', 'autonomous-evidence'],
    seeInAction: ['Factory floor', 'Roads and stream banks'],
    unlockCondition: always,
  },
  {
    id: 'autonomous-evidence',
    title: 'Autonomous Evidence and Replay',
    category: 'principles',
    icon: 'brain',
    tooltip: 'Every decision carries observations, assumptions, alternatives, and expected effect.',
    brief: 'Autonomy is trustworthy when you can ask it why. Every decision carries its evidence.',
    article: `## Legible Autonomy\n\nTrust requires transparency. Every autonomous decision captures its telemetry, timestamp, assumptions, alternatives, expected effect, and the equipment in scope. You can always ask why.\n\nThe replay ledger samples machine state, alerts, and vehicle positions without credentials or personal data. Commands are stored separately from frames, so a review can tell what happened from what requested it.\n\nConfidence comes with reasoning attached, not as an unexplained percentage. When evidence does not justify intervention, the system holds steady rather than guessing.`,
    relatedEntries: ['scada-alarm-lifecycle', 'predictive-maintenance'],
    seeInAction: ['AI Command Centre', 'Decision replay'],
    unlockCondition: always,
  },
];

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      unlockedEntries: new Set(KNOWLEDGE_ENTRIES.map((entry) => entry.id)),
      readEntries: new Set(),
      newEntries: new Set(),
      showTooltips: true,
      showLoadingQuotes: true,
      showAINarration: true,
      showUnlockNotifications: true,
      unlockEntry: (entryId) =>
        set((state) => ({
          unlockedEntries: new Set([...state.unlockedEntries, entryId]),
          newEntries: state.unlockedEntries.has(entryId)
            ? state.newEntries
            : new Set([...state.newEntries, entryId]),
        })),
      markAsRead: (entryId) =>
        set((state) => ({ readEntries: new Set([...state.readEntries, entryId]) })),
      clearNewBadge: (entryId) =>
        set((state) => {
          const next = new Set(state.newEntries);
          next.delete(entryId);
          return { newEntries: next };
        }),
      checkUnlockConditions: () => undefined,
      setShowTooltips: (show) => set({ showTooltips: show }),
      setShowLoadingQuotes: (show) => set({ showLoadingQuotes: show }),
      setShowAINarration: (show) => set({ showAINarration: show }),
      setShowUnlockNotifications: (show) => set({ showUnlockNotifications: show }),
      getEntry: (id) => KNOWLEDGE_ENTRIES.find((entry) => entry.id === id),
      getEntriesByCategory: (category) =>
        KNOWLEDGE_ENTRIES.filter((entry) => entry.category === category),
      isUnlocked: (id) => get().unlockedEntries.has(id),
      isNew: (id) => get().newEntries.has(id),
      getUnlockedCount: () => KNOWLEDGE_ENTRIES.length,
      getTotalCount: () => KNOWLEDGE_ENTRIES.length,
    }),
    {
      name: 'millos-autonomous-datalinks',
      storage: safeJSONStorage,
      version: 2,
      migrate: (persisted) => sanitizeKnowledgeState(persisted) as unknown as KnowledgeState,
      partialize: (state) => ({
        unlockedEntries: [...state.unlockedEntries],
        readEntries: [...state.readEntries],
        showTooltips: state.showTooltips,
        showLoadingQuotes: state.showLoadingQuotes,
        showAINarration: state.showAINarration,
        showUnlockNotifications: state.showUnlockNotifications,
      }),
      merge: (persisted, current) => {
        const state = sanitizeKnowledgeState(persisted);
        return {
          ...current,
          unlockedEntries: new Set(KNOWLEDGE_ENTRIES.map((entry) => entry.id)),
          readEntries: new Set(state.readEntries ?? []),
          newEntries: new Set<string>(),
          showTooltips: state.showTooltips ?? true,
          showLoadingQuotes: state.showLoadingQuotes ?? true,
          showAINarration: state.showAINarration ?? true,
          showUnlockNotifications: state.showUnlockNotifications ?? true,
        };
      },
    }
  )
);

export function getRandomLoadingQuote(): KnowledgeQuote {
  return LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)];
}

export function getCategoryIcon(category: KnowledgeCategory): KnowledgeIcon {
  if (category === 'principles') return 'sprout';
  if (category === 'pioneers') return 'sparkles';
  if (category === 'systems') return 'cog';
  return 'library';
}

export function getCategoryLabel(category: KnowledgeCategory): string {
  if (category === 'principles') return 'Operating Principles';
  if (category === 'pioneers') return 'World and Process Lineage';
  if (category === 'systems') return 'Control Systems';
  return 'Operational Cases';
}
