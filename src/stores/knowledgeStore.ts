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
  audience?: 'player' | 'developer';
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
    text: 'Check the measurement, its context, and the action it supports.',
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
    id: 'bottlenecks-and-buffers',
    title: 'Bottlenecks and Buffers',
    category: 'systems',
    icon: 'network',
    tooltip: 'Watch where material waits before increasing the line speed.',
    brief:
      'A faster mill helps only when the sifter, packer and loading dock can accept its output. Follow the queue to find the limiting stage.',
    article: `## Follow the Waiting Material\n\nStart with the active order in Overview. Its blocker and next action identify whether the line needs grain, processing, a quality disposition, loading or departure. The SCADA process workspace shows the material ledger and dispatch state.\n\nA buffer gives the next stage time to catch up. Full storage or a held batch can stop progress even when the machinery is healthy. Increasing speed before clearing that constraint adds work without completing the customer's delivery.\n\nChanging the recipe selects new grain at the silo valves. Grain and grist already inside the line finish under their original product type and traceability records. Let that work clear; a recipe change cannot turn existing flour into semolina.\n\nTry changing one control at a time. Watch the next stage and the released kilograms, then check whether the order's shipped mass actually increases. A moving conveyor alone is insufficient evidence of a completed order.`,
    relatedEntries: ['autonomous-material-flow', 'batch-quality', 'autonomous-logistics'],
    seeInAction: ['Overview commitment', 'SCADA Process workspace'],
    unlockCondition: always,
  },
  {
    id: 'resource-tradeoffs',
    title: 'Energy, Waste and Useful Output',
    category: 'case-studies',
    icon: 'scale',
    tooltip: 'Compare running costs with released and delivered kilograms.',
    brief:
      'Speed has a cost. Compare energy, waste and delay with the useful flour that reaches the customer.',
    article: `## Make the Tradeoff Visible\n\nThe campaign accounts for energy, automation, waste, maintenance, dock delays and late deliveries. Revenue comes from credited customer shipments. The shift debrief puts these costs beside dispatched kilograms and open risks.\n\nA lower line setpoint can give constrained downstream equipment room to recover. Waiting also risks the order's due time. Compare both effects rather than treating maximum speed as the objective.\n\nUse a recovery challenge to observe a bounded power, packaging or control interruption. Read the response's consequence before choosing it. Quality and unresolved serious incidents limit the shift grade even when the financial margin is positive. These are simulator accounts, not a real mill's tariff or food-safety certificate.`,
    relatedEntries: ['bottlenecks-and-buffers', 'predictive-maintenance', 'community-commitments'],
    seeInAction: ['Overview recovery challenges', 'Shift debrief', 'SCADA utilities'],
    unlockCondition: always,
  },
  {
    id: 'community-commitments',
    title: 'The Mill and Its Neighbours',
    category: 'principles',
    icon: 'users',
    tooltip: 'A completed cooperative order supplies the village bakery.',
    brief:
      'The bakery needs a real flour delivery. Safe, traceable production is a promise to the people who use its output.',
    article: `## A Delivery Has a Destination\n\nThe Riverside Bakers' Cooperative order links the mill to the village bakery. Its display is stocked only after the campaign records a fulfilled flour order with shipment evidence. The display is a visual response to that delivery; it does not create another quantity of flour in the ledger.\n\nThe school-meals and pasta commitments have their own recipes, deadlines and shipments. Finishing one customer's order does not supply every shop in the world. Read the active customer and the remaining kilograms before changing the recipe.\n\nVillage residents retain ordinary walks, work and tea breaks. Mill tasks respond to equipment, maintenance and quality conditions. A safety stop holds personnel in their current positions while automated egress verification checks the site; it does not certify a worker evacuation.`,
    relatedEntries: ['autonomous-material-flow', 'batch-quality', 'predictive-maintenance'],
    seeInAction: ['Overview customer orders', 'Village bakery', 'Safety egress verification'],
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
    audience: 'developer',
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

/** Player explanations remain separate from optional renderer reference notes. */
export function getKnowledgeEntries(audience: 'player' | 'developer' = 'player'): KnowledgeEntry[] {
  return KNOWLEDGE_ENTRIES.filter((entry) => (entry.audience ?? 'player') === audience);
}

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
