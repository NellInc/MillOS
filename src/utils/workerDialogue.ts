/**
 * Worker Dialogue System
 *
 * Context-aware dialogue for workers that adapts to:
 * - Their current mood state
 * - Nearby machines and their status
 * - Active incidents or chaos events
 * - Time of day and shift status
 * - Interactions with other workers
 */

import { MoodState, MachineData } from '../types';

export type DialogueType = 'casual' | 'work' | 'safety' | 'radio' | 'handoff';

export interface DialogueLine {
  text: string;
  type: DialogueType;
  context?: string; // e.g., 'near_machine', 'break_room', 'incident', 'greeting'
  priority?: number; // Higher priority = more likely to be chosen
}

// Casual chat - everyday workplace banter
export const CASUAL_DIALOGUE: DialogueLine[] = [
  { text: "Coffee's ready in the break room", type: 'casual', context: 'break_room' },
  { text: 'Did you catch the game last night?', type: 'casual', priority: 1 },
  { text: 'Almost lunch time!', type: 'casual', context: 'pre_break' },
  { text: 'How was your weekend?', type: 'casual', context: 'greeting' },
  { text: 'Anyone seen my safety glasses?', type: 'casual' },
  { text: "It's someone's birthday in the break room!", type: 'casual', priority: 3 },
  { text: 'New coffee machine works great!', type: 'casual', context: 'break_room', priority: 2 },
  { text: "I'll grab lunch, anyone want anything?", type: 'casual', context: 'pre_break' },
  { text: 'Traffic was terrible this morning!', type: 'casual', context: 'shift_start' },
  { text: 'Plans for the weekend?', type: 'casual' },
  { text: 'Check out the new forklift!', type: 'casual', priority: 2 },
  { text: "Who's winning the production bet?", type: 'casual' },
];

// Work-related communication
export const WORK_DIALOGUE: DialogueLine[] = [
  {
    text: 'R.M. 103 sounds a bit off today',
    type: 'work',
    context: 'near_warning_machine',
    priority: 3,
  },
  { text: "We're ahead of schedule!", type: 'work', priority: 2 },
  { text: 'Need a hand with this calibration?', type: 'work', context: 'near_machine' },
  { text: 'Checking the silo levels now', type: 'work', context: 'near_silo' },
  { text: 'Quality looks good on this batch', type: 'work', priority: 2 },
  { text: "I'll do a quick inspection", type: 'work', context: 'near_machine' },
  { text: 'Throughput is looking great today!', type: 'work', priority: 2 },
  { text: 'Time to log these readings', type: 'work', context: 'near_machine' },
  { text: "Let's run diagnostics on the plansifter", type: 'work', context: 'near_machine' },
  { text: 'Temperature is within range', type: 'work', context: 'near_machine' },
  { text: 'Oil level is good, just checked', type: 'work', context: 'near_machine' },
  { text: 'Vibration readings are normal', type: 'work', context: 'near_machine' },
  { text: "We're hitting our targets!", type: 'work', priority: 2 },
  { text: 'This batch is running smooth', type: 'work', priority: 1 },
  { text: 'Adjusting the feed rate now', type: 'work', context: 'near_machine' },
];

// Safety-related alerts and reminders
export const SAFETY_DIALOGUE: DialogueLine[] = [
  { text: 'Watch your step, wet floor!', type: 'safety', priority: 4 },
  { text: 'Forklift coming through!', type: 'safety', context: 'forklift_nearby', priority: 5 },
  { text: 'Remember your PPE!', type: 'safety', priority: 3 },
  {
    text: 'Lockout/tagout procedure in progress',
    type: 'safety',
    context: 'maintenance',
    priority: 4,
  },
  { text: 'Clear the area, please!', type: 'safety', priority: 4 },
  { text: 'Safety inspection in Zone 2', type: 'safety', priority: 3 },
  { text: 'Wear your hard hat in this zone!', type: 'safety', priority: 4 },
  { text: 'Emergency exit is clear', type: 'safety', priority: 2 },
  { text: 'Fire extinguisher check complete', type: 'safety', context: 'inspection' },
  { text: 'Keep the aisles clear, everyone!', type: 'safety', priority: 3 },
  { text: 'Spill on the floor - cleaning crew notified', type: 'safety', priority: 4 },
  { text: "Don't forget ear protection near the mills!", type: 'safety', priority: 3 },
];

// Radio chatter - formal communications
export const RADIO_DIALOGUE: DialogueLine[] = [
  { text: 'Control, this is Floor 2, all clear', type: 'radio', priority: 2 },
  { text: 'Copy that, proceeding to Silo Alpha', type: 'radio' },
  { text: 'Break time in 10, over', type: 'radio', context: 'pre_break' },
  { text: '10-4, maintenance complete on R.M. 102', type: 'radio', context: 'maintenance' },
  { text: 'Quality check passed, good to continue', type: 'radio', priority: 2 },
  { text: 'Requesting backup at packer line 3', type: 'radio', priority: 3 },
  { text: 'Truck arriving at shipping dock, ETA 5 minutes', type: 'radio', priority: 3 },
  { text: 'Supervisor to Zone 1, please', type: 'radio', priority: 3 },
  { text: 'Confirming grain delivery at receiving bay', type: 'radio', priority: 2 },
  { text: 'All personnel, shift change in 15 minutes', type: 'radio', priority: 3 },
  {
    text: 'Starting system cooldown procedure',
    type: 'radio',
    context: 'near_machine',
    priority: 2,
  },
  { text: 'Temperature spike detected, checking now', type: 'radio', priority: 4 },
  { text: 'Silo levels at 80%, looking good', type: 'radio', priority: 2 },
  { text: 'Roger that, en route to your location', type: 'radio' },
  { text: 'Break room coffee is ready, over', type: 'radio', context: 'break_room' },
];

// Machine-specific responses based on status
export const MACHINE_STATUS_DIALOGUE: Record<MachineData['status'], DialogueLine[]> = {
  running: [
    { text: 'Machine running smoothly', type: 'work', priority: 1 },
    { text: 'All systems nominal', type: 'work', priority: 1 },
    { text: 'Performance looks optimal', type: 'work', priority: 1 },
  ],
  idle: [
    { text: 'Machine is idle, ready when needed', type: 'work' },
    { text: 'Standing by for next batch', type: 'work' },
    { text: 'Waiting for upstream delivery', type: 'work' },
  ],
  warning: [
    { text: "Let's check what's causing this warning", type: 'work', priority: 4 },
    { text: 'Investigating the warning light', type: 'work', priority: 4 },
    { text: 'Looks like we have a caution here', type: 'work', priority: 4 },
    { text: 'Running diagnostics on this machine', type: 'work', priority: 3 },
  ],
  critical: [
    { text: 'CRITICAL: Need maintenance here NOW!', type: 'safety', priority: 5 },
    { text: 'Emergency shutdown initiated!', type: 'safety', priority: 5 },
    { text: 'All hands, we have a critical situation!', type: 'safety', priority: 5 },
    { text: 'Calling supervisor immediately!', type: 'radio', priority: 5 },
  ],
};

// Incident/chaos-specific responses (for different chaos types)
export const INCIDENT_DIALOGUE: Record<string, DialogueLine[]> = {
  grain_spill: [
    { text: 'Grain spill in my area!', type: 'safety', priority: 4 },
    { text: 'Watch your step, grain on the floor!', type: 'safety', priority: 4 },
    { text: 'Getting the cleanup crew', type: 'work', priority: 3 },
  ],
  dust_cloud: [
    { text: '*cough* Dust cloud alert!', type: 'safety', priority: 3 },
    { text: 'Ventilation issue detected', type: 'work', priority: 3 },
    { text: 'Anyone have a dust mask?', type: 'safety', priority: 3 },
  ],
  conveyor_jam: [
    { text: 'Conveyor jam on line 2!', type: 'work', priority: 4 },
    { text: 'Stopping the belt, jam detected', type: 'safety', priority: 4 },
    { text: 'Need maintenance on the conveyor', type: 'radio', priority: 4 },
  ],
  power_flicker: [
    { text: 'Did you see that power flicker?', type: 'work', priority: 3 },
    { text: 'Checking systems after that surge', type: 'work', priority: 3 },
    { text: 'Everything still running?', type: 'work', priority: 3 },
  ],
};

// Response chains - when workers respond to each other
export interface ResponseChain {
  trigger: string; // Phrase that triggers this response
  responses: DialogueLine[]; // Possible responses
  delay: number; // Delay before response (ms)
}

export const RESPONSE_CHAINS: ResponseChain[] = [
  {
    trigger: "Coffee's ready in the break room",
    responses: [
      { text: "Finally! I'm exhausted!", type: 'casual' },
      { text: 'Be right there!', type: 'casual' },
      { text: 'Save me a cup!', type: 'casual' },
    ],
    delay: 1500,
  },
  {
    trigger: 'Almost lunch time!',
    responses: [
      { text: "Thank goodness, I'm starving", type: 'casual' },
      { text: "What's everyone having?", type: 'casual' },
      { text: "Can't wait!", type: 'casual' },
    ],
    delay: 1000,
  },
  {
    trigger: 'Need a hand with this calibration?',
    responses: [
      { text: 'Yes please, thanks!', type: 'work' },
      { text: "I've got it, but appreciate it!", type: 'work' },
      { text: 'Actually, yeah - come take a look', type: 'work' },
    ],
    delay: 800,
  },
  {
    trigger: 'Forklift coming through!',
    responses: [
      { text: 'Heard, stepping aside!', type: 'safety' },
      { text: 'Thanks for the heads up!', type: 'safety' },
      { text: 'Clear!', type: 'safety' },
    ],
    delay: 500,
  },
  {
    trigger: 'CRITICAL: Need maintenance here NOW!',
    responses: [
      { text: 'On my way!', type: 'radio' },
      { text: 'Supervisor notified!', type: 'radio' },
      { text: 'Maintenance team dispatched!', type: 'radio' },
    ],
    delay: 600,
  },
];

/**
 * Get contextual dialogue based on worker state and environment
 */
export function getContextualDialogue(params: {
  moodState: MoodState;
  nearbyMachine?: MachineData;
  chaosEventType?: string;
  timeContext?: 'shift_start' | 'pre_break' | 'break_time' | 'shift_end';
  isNearWorker?: boolean;
}): DialogueLine | null {
  const { nearbyMachine, chaosEventType, timeContext, isNearWorker } = params;

  // Priority 1: Active incident/chaos
  if (chaosEventType && INCIDENT_DIALOGUE[chaosEventType]) {
    const options = INCIDENT_DIALOGUE[chaosEventType];
    return options[Math.floor(Math.random() * options.length)];
  }

  // Priority 2: Machine status (if near critical/warning machine)
  if (
    nearbyMachine &&
    (nearbyMachine.status === 'critical' || nearbyMachine.status === 'warning')
  ) {
    const options = MACHINE_STATUS_DIALOGUE[nearbyMachine.status];
    return options[Math.floor(Math.random() * options.length)];
  }

  // Priority 3: Mood-based grumbles (from types.ts GRUMBLE_PHRASES)
  // This is handled by triggerRandomGrumble in workerMoodStore

  // Priority 4: Context-aware dialogue
  const allDialogue: DialogueLine[] = [];

  // Add dialogue matching the current context
  if (timeContext) {
    allDialogue.push(
      ...CASUAL_DIALOGUE.filter((d) => d.context === timeContext),
      ...RADIO_DIALOGUE.filter((d) => d.context === timeContext)
    );
  }

  // If near a worker, add casual chat
  if (isNearWorker) {
    allDialogue.push(...CASUAL_DIALOGUE.filter((d) => !d.context || d.context === 'greeting'));
  }

  // If near a machine, add work dialogue
  if (nearbyMachine) {
    allDialogue.push(
      ...WORK_DIALOGUE.filter((d) => d.context === 'near_machine'),
      ...MACHINE_STATUS_DIALOGUE[nearbyMachine.status]
    );
  }

  // Add general dialogue as fallback
  allDialogue.push(...WORK_DIALOGUE.filter((d) => !d.context));
  allDialogue.push(...CASUAL_DIALOGUE.filter((d) => !d.context));

  // If we have no options, return null
  if (allDialogue.length === 0) return null;

  // Weight by priority
  const weightedDialogue: DialogueLine[] = [];
  allDialogue.forEach((line) => {
    const priority = line.priority ?? 1;
    for (let i = 0; i < priority; i++) {
      weightedDialogue.push(line);
    }
  });

  // Random selection
  return weightedDialogue[Math.floor(Math.random() * weightedDialogue.length)];
}

/**
 * Get a random radio chatter line
 */
export function getRadioChatter(): DialogueLine {
  const weighted: DialogueLine[] = [];
  RADIO_DIALOGUE.forEach((line) => {
    const priority = line.priority ?? 1;
    for (let i = 0; i < priority; i++) {
      weighted.push(line);
    }
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}

/**
 * Find response to a given phrase
 */
export function getResponseTo(phrase: string): { response: DialogueLine; delay: number } | null {
  const chain = RESPONSE_CHAINS.find((c) => c.trigger === phrase);
  if (!chain) return null;

  const response = chain.responses[Math.floor(Math.random() * chain.responses.length)];
  return { response, delay: chain.delay };
}
