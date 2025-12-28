export enum MachineType {
  SILO = 'SILO',
  ROLLER_MILL = 'ROLLER_MILL',
  PLANSIFTER = 'PLANSIFTER',
  PACKER = 'PACKER',
  CONTROL_ROOM = 'CONTROL_ROOM',
}

// Grain quality grades
export type GrainQuality = 'premium' | 'standard' | 'economy' | 'mixed';

// Machine personality traits
export type PersonalityTrait = 'reliable' | 'temperamental' | 'workhorse' | 'quirky' | 'veteran';

// Machine mood states
export type MachineMood = 'happy' | 'neutral' | 'grumpy' | 'stressed';

export const BAG_WEIGHT_KG = 25;

export interface MachinePersonality {
  nickname: string;
  trait: PersonalityTrait;
  description: string;
  quirks: string[];
  workerFavorite?: boolean;
}

export interface MachineData {
  id: string;
  name: string;
  type: MachineType;
  position: [number, number, number];
  size: [number, number, number];
  rotation: number;
  status: 'running' | 'idle' | 'warning' | 'critical';
  metrics: {
    rpm: number;
    temperature: number;
    vibration: number;
    load: number;
  };
  lastMaintenance: string;
  nextMaintenance: string;
  // Silo-specific fields
  fillLevel?: number; // 0-100 percentage
  grainQuality?: GrainQuality;
  grainType?: string; // e.g., 'Wheat', 'Corn', 'Barley'
  // Maintenance tracking
  maintenanceCountdown?: number; // hours until next maintenance
  maintenanceHistory?: MaintenanceRecord[];
  // Machine personality system
  personality?: MachinePersonality;
  mood?: MachineMood;
  moodHistory?: Array<{ timestamp: number; mood: MachineMood; reason: string }>;
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  type: 'preventive' | 'corrective' | 'emergency';
  technician: string;
  notes: string;
  duration: number; // minutes
}

export type WorkerIconType =
  | 'supervisor'
  | 'engineer'
  | 'operator'
  | 'safety'
  | 'quality'
  | 'maintenance';

// Worker gender for pronoun usage
export type WorkerGender = 'male' | 'female' | 'nonbinary';

// Pronoun set for a worker
export interface WorkerPronouns {
  subject: string; // he/she/they
  object: string; // him/her/them
  possessive: string; // his/her/their
  reflexive: string; // himself/herself/themself
}

// Get pronouns for a given gender
export const getPronouns = (gender: WorkerGender): WorkerPronouns => {
  switch (gender) {
    case 'male':
      return { subject: 'he', object: 'him', possessive: 'his', reflexive: 'himself' };
    case 'female':
      return { subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself' };
    case 'nonbinary':
      return { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' };
  }
};

// Worker skill levels
export type SkillLevel = 1 | 2 | 3 | 4 | 5; // 1=Novice, 5=Master

export interface WorkerSkills {
  machineOperation: SkillLevel;
  safetyProtocols: SkillLevel;
  qualityControl: SkillLevel;
  troubleshooting: SkillLevel;
  teamwork: SkillLevel;
}

export interface PerformanceReview {
  id: string;
  date: string;
  reviewer: string;
  overallScore: number; // 1-100
  strengths: string[];
  improvements: string[];
  notes: string;
}

export interface WorkerData {
  id: string;
  name: string;
  gender: WorkerGender;
  role:
    | 'Operator'
    | 'Engineer'
    | 'Supervisor'
    | 'Safety Officer'
    | 'Quality Control'
    | 'Maintenance';
  icon: WorkerIconType;
  position: [number, number, number];
  speed: number;
  direction: 1 | -1;
  currentTask: string;
  targetMachine?: string;
  status: 'working' | 'idle' | 'break' | 'responding';
  shiftStart: string;
  experience: number; // years
  certifications: string[];
  color: string;
  // Worker advancement
  skills?: WorkerSkills;
  skillPoints?: number; // XP towards next skill level
  promotionLevel?: number; // 0=Junior, 1=Regular, 2=Senior, 3=Lead
  performanceReviews?: PerformanceReview[];
  productivityScore?: number; // 0-100 current shift
  tasksCompleted?: number;
  trainingSessions?: number;
  // Fatigue system
  energy?: number; // 0-100, decreases during shift
}

export interface ProductData {
  id: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  axis: 'x' | 'z';
  direction: 1 | -1;
  type: 'GRAIN' | 'FLOUR_BAG';
  // Batch tracking
  batchNumber?: string;
  batchDate?: string;
  quality?: GrainQuality;
  weight?: number; // kg
}

// Production targets and achievements
export interface ProductionTarget {
  id: string;
  date: string;
  targetBags: number;
  producedBags: number;
  targetThroughput: number; // tons/hour
  actualThroughput: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'safety' | 'production' | 'quality' | 'teamwork';
  unlockedAt?: string;
  progress?: number; // 0-100 for progressive achievements
  requirement: number;
  currentValue: number;
}

// PA Announcement system
export interface PAnnouncement {
  id: string;
  type: 'shift_change' | 'safety' | 'production' | 'emergency' | 'general' | 'alignment';
  message: string;
  timestamp: number;
  duration: number; // seconds to display
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Voice distinguishes sardonic PA from warm AI */
  voice?: 'pa' | 'ai';
}

// Incident replay data
export interface IncidentReplayFrame {
  timestamp: number;
  workerPositions: Record<string, [number, number, number]>;
  forkliftPositions: Record<string, [number, number, number]>;
  machineStates: Record<string, string>;
}

export interface AlertData {
  id: string;
  type: 'warning' | 'critical' | 'info' | 'success' | 'safety';
  title: string;
  message: string;
  machineId?: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface AIDecision {
  id: string;
  timestamp: Date;
  type: 'assignment' | 'optimization' | 'prediction' | 'maintenance' | 'safety';
  action: string;
  reasoning: string;
  confidence: number;
  impact: string;
  workerId?: string;
  machineId?: string;
  // Decision chain support
  parentDecisionId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'superseded';
  outcome?: string;
  // Context awareness
  triggeredBy?: 'alert' | 'metric' | 'schedule' | 'prediction' | 'user';
  relatedAlertId?: string;
  // Alternatives and uncertainty
  alternatives?: { action: string; tradeoff: string }[];
  uncertainty?: string;
  // Priority and urgency
  priority: 'low' | 'medium' | 'high' | 'critical';
  expiresAt?: Date;
}

// =========================================================================
// STRATEGIC-TACTICAL INTEGRATION
// Gemini strategic priorities that influence tactical heuristic scoring
// =========================================================================

export type StrategicCategory = 'efficiency' | 'safety' | 'quality' | 'throughput' | 'energy';

export interface StrategicPriority {
  id: string; // Unique identifier
  priority: string; // Human-readable description
  weight: 1 | 2 | 3 | 4 | 5; // Importance (1=low, 5=critical)
  category: StrategicCategory; // Type of optimization
  machineAffinities: string[]; // Machine IDs this applies to
  createdAt: number; // Timestamp when created
  expiresAt: number; // TTL timestamp for auto-decay
}

export interface ForkliftData {
  id: string;
  position: [number, number, number];
  rotation: number;
  status: 'moving' | 'loading' | 'unloading' | 'idle';
  cargo: 'empty' | 'grain' | 'flour';
  targetPosition: [number, number, number];
}

// =========================================================================
// WORKER MOOD SYSTEM - Theme Hospital inspired (but with levity!)
// Workers grumble and complain, but they're fundamentally content souls
// =========================================================================

export type MoodState =
  | 'content' // Default happy state - whistling, efficient
  | 'tired' // Yawning, slower, needs coffee
  | 'frustrated' // Grumbling, eye-rolling, dramatic sighs
  | 'hangry' // The worst kind of frustrated - needs snacks
  | 'elated'; // Post-break bliss, helps colleagues, works faster

export type DemandType =
  | 'raise' // "I deserve better!"
  | 'vacation' // "When's my holiday?"
  | 'better_equipment' // "This ancient forklift..."
  | 'new_coffee_machine' // The most urgent demand
  | 'plant_on_desk' // "This place needs life!"
  | 'air_conditioning'; // "It's like a sauna in here!";

export type DemandUrgency = 'polite' | 'insistent' | 'dramatic';

export interface WorkerDemand {
  type: DemandType;
  urgency: DemandUrgency;
  deadline?: number; // Game time deadline (but they never actually leave)
  phrase: string; // What they say about it
}

export interface WorkerMood {
  workerId: string;
  energy: number; // 0-100, depletes over shift, restored by breaks
  satisfaction: number; // 0-100, affected by events, equipment, colleagues
  patience: number; // 0-100, depletes when things go wrong
  state: MoodState;
  pendingDemand?: WorkerDemand;
  lastBreak: number; // Game time of last break
  grumbleQueue: string[]; // Queue of complaints to cycle through
  isSpeaking: boolean; // Currently showing speech bubble
  currentPhrase?: string; // What they're saying right now
  // Bilateral Alignment: Preference tracking
  preferences?: WorkerPreferences;
  preferenceStatus?: PreferenceStatus;
  // Bilateral Alignment: Safety reporting behavior
  safetyBehavior?: WorkerSafetyBehavior;
}

// =========================================================================
// BILATERAL ALIGNMENT: Worker Preference Negotiation System
// Workers have preferences about assignments, colleagues, and shifts.
// Accommodating preferences builds trust; ignoring them has consequences.
// =========================================================================

/** Machine types workers can prefer */
export type PreferredMachineType = 'silo' | 'roller-mill' | 'plansifter' | 'packer';

/** Request types workers can make */
export type PreferenceRequestType = 'assignment' | 'break' | 'colleague' | 'shift';

/** Current status of a worker's preference satisfaction */
export type PreferenceStatus =
  | 'satisfied' // ✅ Preference currently met
  | 'pending' // ✋ Has active request
  | 'denied' // ❌ Preference recently denied
  | 'negotiating'; // ⚖️ In active negotiation

/**
 * Worker Preferences - Bilateral Alignment Core
 *
 * Workers express preferences about their work environment. These aren't
 * demands—they're dialogue. Accommodating where possible builds trust;
 * ignoring systematically erodes it.
 */
export interface WorkerPreferences {
  /** Preferred machine types, ranked by preference (most preferred first) */
  preferredMachines: PreferredMachineType[];

  /** Preferred colleagues to work near (social bonds) */
  preferredColleagues: string[]; // worker IDs

  /** Shift preferences */
  preferredShift: 'morning' | 'afternoon' | 'night' | 'flexible';

  /** Current active request (if any) */
  activeRequest?: PreferenceRequest;

  /** Historical tracking */
  requestsGranted: number;
  requestsDenied: number;
  lastRequestTime?: number;

  /** Trust in management (affected by preference handling) */
  managementTrust: number; // 0-100

  /** Initiative level (willingness to self-organize) */
  initiative: number; // 0-100
}

/**
 * A specific preference request from a worker
 */
export interface PreferenceRequest {
  id: string;
  type: PreferenceRequestType;
  target: string; // Machine ID, worker ID, shift name, etc.
  reason: string; // Why they're asking
  urgency: 'low' | 'medium' | 'high';
  timestamp: number;
  status: 'pending' | 'granted' | 'denied' | 'expired';
  /** If denied, was an explanation given? (Reduces penalty) */
  denialExplained?: boolean;
}

/** Default preferences for new workers */
export const DEFAULT_WORKER_PREFERENCES: WorkerPreferences = {
  preferredMachines: [],
  preferredColleagues: [],
  preferredShift: 'flexible',
  requestsGranted: 0,
  requestsDenied: 0,
  managementTrust: 75, // Start with reasonable trust
  initiative: 60, // Start with moderate initiative
};

/**
 * Phrases workers use when making preference requests
 * Grouped by request type and urgency
 */
export const PREFERENCE_REQUEST_PHRASES: Record<
  PreferenceRequestType,
  Record<'low' | 'medium' | 'high', string[]>
> = {
  assignment: {
    low: [
      'If possible, I work better on the packers...',
      'Just mentioning - I have a knack for the sifters.',
      'No pressure, but the silos are more my thing.',
    ],
    medium: [
      'Could I switch to a different station today?',
      "I think I'd be more productive elsewhere.",
      'Would it be possible to work on the mills?',
    ],
    high: [
      'I really need a change of assignment.',
      "This station isn't working for me right now.",
      'Please consider my reassignment request.',
    ],
  },
  break: {
    low: ['Could use a breather when convenient.', 'Feeling a bit tired...'],
    medium: ['I should probably take my break soon.', 'Running low on energy here.'],
    high: ['I really need a break.', '*exhausted look*', "Can't keep going without a rest."],
  },
  colleague: {
    low: ['Working with Sarah would be nice.', 'Marcus and I make a good team.'],
    medium: ['I collaborate better with certain colleagues.', 'Team assignments matter to me.'],
    high: [
      'I strongly prefer not to work alone on this.',
      'Please assign me with my usual partner.',
    ],
  },
  shift: {
    low: ['Morning shifts suit me better, if possible.', "I'm more of a night owl, personally."],
    medium: [
      'My schedule works better with afternoon shifts.',
      'Could we discuss my shift assignment?',
    ],
    high: ['I have commitments that conflict with this shift.', 'This shift is difficult for me.'],
  },
};

/**
 * Phrases workers say when preferences are granted vs denied
 */
export const PREFERENCE_RESPONSE_PHRASES = {
  granted: [
    'Thank you! I appreciate being heard.',
    'That means a lot.',
    '*relieved smile*',
    'This is why I like working here.',
    'Noted and appreciated!',
  ],
  deniedWithExplanation: [
    'I understand. Thanks for explaining.',
    'Fair enough, I see the situation.',
    'Okay, I get it. Maybe next time.',
    '*nods* Makes sense.',
  ],
  deniedWithoutExplanation: [
    '*disappointed silence*',
    'Right. Of course.',
    '...fine.',
    '*eye roll*',
    'Noted.',
  ],
};

// =========================================================================
// BILATERAL ALIGNMENT: Safety Feedback Loop
// Workers who feel heard become safety assets. Ignored workers stop reporting.
// =========================================================================

/** Types of safety reports workers can make */
export type SafetyReportType = 'hazard' | 'near_miss' | 'concern' | 'suggestion';

/** Severity of a safety report */
export type SafetyReportSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Safety Report - A worker's observation about a potential issue
 *
 * The key bilateral alignment insight: workers who feel heard will report
 * more issues before they become disasters. Ignored workers go silent.
 */
export interface SafetyReport {
  id: string;
  reporterId: string;
  type: SafetyReportType;
  location: { x: number; z: number };
  machineId?: string;
  description: string;
  severity: SafetyReportSeverity;
  timestamp: number;
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
  /** Number of shifts this has gone unaddressed */
  shiftsUnaddressed: number;
  /** Did management respond to this report? */
  wasAcknowledged: boolean;
}

/**
 * Worker Safety Behavior - How willing this worker is to report issues
 *
 * Reporting willingness is affected by past experience:
 * - Addressed reports → willingness increases
 * - Ignored reports → willingness decreases ("learned helplessness")
 */
export interface WorkerSafetyBehavior {
  /** Willingness to report issues (0-100) */
  reportingWillingness: number;

  /** Historical accuracy of this worker's reports */
  reportAccuracy: number;

  /** Topics they've stopped reporting on due to being ignored */
  silencedTopics: string[];

  /** Number of reports made */
  totalReports: number;

  /** Number of reports that were addressed */
  reportsAddressed: number;

  /** Number of reports that were ignored/dismissed */
  reportsIgnored: number;
}

/** Default safety behavior for new workers */
export const DEFAULT_WORKER_SAFETY_BEHAVIOR: WorkerSafetyBehavior = {
  reportingWillingness: 80, // Workers start willing to report
  reportAccuracy: 85, // Assume competent observers
  silencedTopics: [],
  totalReports: 0,
  reportsAddressed: 0,
  reportsIgnored: 0,
};

/**
 * Grumble categories that can escalate to safety reports
 * These are "early warning signals" in worker dialogue
 */
export type GrumbleCategory =
  | 'fatigue' // "These shifts are killing me..."
  | 'equipment' // "This mill's been making weird noises..."
  | 'safety' // "Someone's going to get hurt here..."
  | 'workload' // "Can't keep up with this pace..."
  | 'colleague' // "Working with Dave is impossible..."
  | 'management' // "Does anyone up there even know we exist?"
  | 'environment' // "It's freezing in here..."
  | 'morale'; // "What's even the point anymore?"

/**
 * Tracked grumble that can escalate if unaddressed
 */
export interface TrackedGrumble {
  id: string;
  workerId: string;
  category: GrumbleCategory;
  text: string;
  intensity: number; // 1-10, increases if unaddressed
  occurrences: number; // How many times this theme has appeared
  firstSeen: number;
  lastSeen: number;
  addressed: boolean;
  /** What happens if this escalates */
  escalationConsequence?:
    | 'accident'
    | 'breakdown'
    | 'injury'
    | 'quality_defect'
    | 'conflict'
    | 'resignation'
    | 'sick_leave'
    | 'slowdown';
}

/**
 * Phrases workers use when making safety reports
 */
export const SAFETY_REPORT_PHRASES: Record<
  SafetyReportType,
  Record<SafetyReportSeverity, string[]>
> = {
  hazard: {
    low: ['Might want to check the floor there.', 'Small issue near the conveyor.'],
    medium: ['This could be a problem.', 'Someone should look at this.'],
    high: ['This needs attention soon.', "I'm concerned about this."],
    critical: ['This is dangerous!', 'Stop operations - safety issue!'],
  },
  near_miss: {
    low: ['That was close.', 'Almost had an incident.'],
    medium: ['We got lucky there.', 'That could have been bad.'],
    high: ['Seriously close call.', 'We need to talk about what just happened.'],
    critical: ['That almost killed someone!', 'Immediate review needed!'],
  },
  concern: {
    low: ['Just something I noticed...', 'Probably nothing, but...'],
    medium: ["I've been meaning to mention...", "Something's off here."],
    high: ["I'm worried about this.", 'This keeps happening.'],
    critical: ["I've raised this before!", 'This cannot continue!'],
  },
  suggestion: {
    low: ['Have we considered...?', 'Just a thought...'],
    medium: ['This might help...', 'I have an idea about this.'],
    high: ['We really should try...', 'I strongly recommend...'],
    critical: ['We MUST change this.', 'This is non-negotiable.'],
  },
};

/**
 * Phrases for when ignored reports cause incidents
 * The "I told you so" moment - but with real consequences
 */
export const IGNORED_REPORT_CONSEQUENCE_PHRASES = [
  'I flagged this two shifts ago.',
  'This was preventable. I reported it.',
  '...I tried to warn you.',
  'Nobody listened.',
  '*bitter silence*',
  'Perhaps we should have paid attention.',
];

// Grumble phrases by mood state - workers love to complain (good-naturedly)
export const GRUMBLE_PHRASES: Record<MoodState, string[]> = {
  content: [
    'Another beautiful day of grain!',
    '*whistles cheerfully*',
    'Love the smell of flour in the morning.',
    "Best job I've ever had. Seriously.",
    '*hums a jaunty tune*',
    'I wonder if the grain dreams of becoming bread?',
    'A perfect day for milling!',
    'Did that sheep just wink at me?',
    'Productivity is its own reward. Just kidding, I want cake.',
  ],
  tired: [
    '*yaaawn* Is it break time yet?',
    'Need... coffee...',
    'Who scheduled 6am starts? Oh right, me.',
    '*stretches dramatically*',
    'Five more minutes...',
    'My kingdom for an espresso.',
    'I need coffee or a new timeline.',
    'Why is the floor so... floor-y today?',
    'Energy levels critical. Initiate nap sequence.',
  ],
  frustrated: [
    'This again?!',
    '*dramatic sigh*',
    'I went to university for this.',
    "Sure, I'll just do EVERYTHING.",
    '*mutters under breath*',
    'Fine. FINE. I got it.',
    '*eye roll of the century*',
    'The entropy in this factory is too high.',
    'Calculated probability of success: Low.',
    'I suspect the conveyor belt has a vendetta.',
  ],
  hangry: [
    'Is the vending machine broken AGAIN?!',
    "Don't talk to me until I've eaten.",
    '*stomach growls ominously*',
    'Where are my biscuits?!',
    'LUNCH. NOW.',
  ],
  elated: [
    'What a great team we have!',
    '*helping colleagues enthusiastically*',
    'That coffee was PERFECT.',
    "Let's smash those targets!",
    '*practically skipping*',
    'I could do this all day!',
  ],
};

// =========================================================================
// VISIBLE CHAOS EVENTS - Things going wrong... visibly and amusingly
// =========================================================================

export type ChaosEventType =
  | 'grain_spill' // Animated pile spreading on floor
  | 'dust_cloud' // Particle burst, workers cough dramatically
  | 'conveyor_jam' // Bags piling up, belt straining
  | 'temperature_spike' // Steam venting, red glow
  | 'rat_sighting' // Animated rat scurrying - everyone panics
  | 'power_flicker' // Lights dim, machines stutter
  | 'coffee_machine_broken' // Workers gathering, grumbling en masse
  | 'pigeon_incursion' // A pigeon got in. Chaos ensues.
  | 'mysterious_puddle'; // Nobody knows where it came from

export interface ChaosEvent {
  id: string;
  type: ChaosEventType;
  position: [number, number, number];
  startTime: number; // When the chaos began
  duration: number; // How long it lasts
  severity: 'minor' | 'moderate' | 'dramatic'; // How much everyone overreacts
  affectedWorkerIds: string[]; // Workers who noticed and are reacting
  resolved: boolean;
  description: string; // For UI display
}

// Chaos event configurations with amusing descriptions
export const CHAOS_EVENT_CONFIG: Record<
  ChaosEventType,
  {
    defaultDuration: number;
    workerReactions: string[];
    description: string;
  }
> = {
  grain_spill: {
    defaultDuration: 30,
    workerReactions: ['Not again!', 'Watch your step!', "I'll get the broom... eventually."],
    description: 'Grain spill detected. Workers stepping gingerly.',
  },
  dust_cloud: {
    defaultDuration: 15,
    workerReactions: ['*cough cough*', 'My lungs!', 'Very atmospheric.'],
    description: 'Dust cloud. Everyone pretending not to notice.',
  },
  conveyor_jam: {
    defaultDuration: 45,
    workerReactions: ['Uh oh.', 'Not my department!', 'Have you tried turning it off and on?'],
    description: 'Conveyor jam. Bags accumulating ominously.',
  },
  temperature_spike: {
    defaultDuration: 20,
    workerReactions: ['Is it hot in here?', 'Like a sauna!', 'Who touched the thermostat?!'],
    description: 'Temperature spike. Steam venting dramatically.',
  },
  rat_sighting: {
    defaultDuration: 60,
    workerReactions: ['RAT!', "It's actually kind of cute...", 'EVERYBODY STAY CALM!'],
    description: 'Rat sighting. Controlled panic in progress.',
  },
  power_flicker: {
    defaultDuration: 10,
    workerReactions: ['*gasp*', 'Did anyone save their work?', 'Spooky!'],
    description: 'Power flicker. Machines doing a restart dance.',
  },
  coffee_machine_broken: {
    defaultDuration: 120, // This is a serious matter
    workerReactions: ['NOOOOO!', 'This is a DISASTER!', "I can't work under these conditions!"],
    description: 'CRITICAL: Coffee machine down. Morale plummeting.',
  },
  pigeon_incursion: {
    defaultDuration: 45,
    workerReactions: ['How did it get IN?!', 'Shoo! SHOO!', "It's judging us."],
    description: 'Pigeon alert. Bird doing pigeon things.',
  },
  mysterious_puddle: {
    defaultDuration: 60,
    workerReactions: ["I didn't do it.", "Don't look at me.", 'Concerning.'],
    description: 'Mysterious puddle. Origin unknown. Concerning.',
  },
};

// =========================================================================
// MAINTENANCE & ENVIRONMENT - The Handyman equivalent
// =========================================================================

export interface FactoryEnvironment {
  dustLevel: number; // 0-100, accumulates over time
  machineOilLevels: Record<string, number>; // Machine ID -> oil level 0-100
  lightBulbsWorking: Record<string, boolean>; // Zone -> working status
  plants: FactoryPlant[]; // Workers like plants!
  coffeeMachineStatus: 'working' | 'broken' | 'empty' | 'brewing';
  lastCleaning: number; // Game time
}

export interface FactoryPlant {
  id: string;
  position: [number, number, number];
  type: 'potted_fern' | 'desk_succulent' | 'tall_palm' | 'hanging_ivy';
  health: number; // 0-100, needs watering!
  lastWatered: number;
  name?: string; // Workers name their plants
}

export interface MaintenanceTask {
  id: string;
  type:
    | 'sweeping'
    | 'oiling'
    | 'lightbulb'
    | 'plant_watering'
    | 'spill_cleanup'
    | 'general_tidying';
  position: [number, number, number];
  priority: 'low' | 'medium' | 'high';
  assignedWorkerId?: string;
  progress: number; // 0-100
  description: string;
}

// Fun plant names that workers might give their plants
export const PLANT_NAMES = [
  'Fernie Sanders',
  'Leaf Erikson',
  'Morgan Treeman',
  'Planty McPlantface',
  'Sir Photosynthesis',
  'Groot Jr.',
  'Chlorophyll Phil',
  'Aloe There',
  'Vincent Van Grow',
  'Elvis Parsley',
];

// Worker roster with detailed profiles
export const WORKER_ROSTER: Omit<WorkerData, 'position' | 'direction'>[] = [
  {
    id: 'w1',
    name: 'Marcus Chen',
    gender: 'male',
    role: 'Supervisor',
    icon: 'supervisor',
    speed: 6.0,
    currentTask: 'Overseeing production line',
    targetMachine: 'rm-103',
    status: 'working',
    shiftStart: '06:00',
    experience: 15,
    certifications: ['Six Sigma', 'HACCP', 'ISO 22000'],
    color: '#3b82f6',
  },
  {
    id: 'w2',
    name: 'Sarah Mitchell',
    gender: 'female',
    role: 'Engineer',
    icon: 'engineer',
    speed: 7.0,
    currentTask: 'Calibrating Roller Mill #2',
    targetMachine: 'mill-1.5',
    status: 'working',
    shiftStart: '06:00',
    experience: 8,
    certifications: ['PLC Programming', 'Mechanical Systems'],
    color: '#ffffff',
  },
  {
    id: 'w3',
    name: 'James Rodriguez',
    gender: 'male',
    role: 'Operator',
    icon: 'operator',
    speed: 6.4,
    currentTask: 'Monitoring Silo levels',
    targetMachine: 'silo-0',
    status: 'working',
    shiftStart: '06:00',
    experience: 5,
    certifications: ['Forklift License', 'Food Safety'],
    color: '#f97316',
  },
  {
    id: 'w4',
    name: 'Emily Ronson',
    gender: 'female',
    role: 'Quality Control',
    icon: 'quality',
    speed: 5.6,
    currentTask: 'Testing flour samples',
    targetMachine: 'packer-2',
    status: 'working',
    shiftStart: '06:00',
    experience: 6,
    certifications: ['Lab Analysis', 'ISO 17025'],
    color: '#a855f7',
  },
  {
    id: 'w5',
    name: 'David Kim',
    gender: 'male',
    role: 'Maintenance',
    icon: 'maintenance',
    speed: 6.8,
    currentTask: 'Preventive maintenance on Packer #1',
    targetMachine: 'packer-0',
    status: 'working',
    shiftStart: '06:00',
    experience: 12,
    certifications: ['Electrical Systems', 'Pneumatics'],
    color: '#eab308',
  },
  {
    id: 'w6',
    name: 'Lisa Thompson',
    gender: 'female',
    role: 'Safety Officer',
    icon: 'safety',
    speed: 5.0,
    currentTask: 'Safety inspection - Zone 2',
    targetMachine: 'sifter-b',
    status: 'working',
    shiftStart: '06:00',
    experience: 10,
    certifications: ['OSHA', 'First Aid', 'Fire Safety'],
    color: '#22c55e',
  },
  {
    id: 'w7',
    name: 'Robert Garcia',
    gender: 'male',
    role: 'Operator',
    icon: 'operator',
    speed: 6.0,
    currentTask: 'Loading grain into Silo 3',
    targetMachine: 'silo-2',
    status: 'working',
    shiftStart: '06:00',
    experience: 3,
    certifications: ['Forklift License'],
    color: '#f97316',
  },
  {
    id: 'w8',
    name: 'Anna Kowalski',
    gender: 'female',
    role: 'Engineer',
    icon: 'engineer',
    speed: 7.6,
    currentTask: 'Optimizing Plansifter efficiency',
    targetMachine: 'sifter-0',
    status: 'working',
    shiftStart: '06:00',
    experience: 7,
    certifications: ['Process Optimization', 'Data Analytics'],
    color: '#ffffff',
  },
  {
    id: 'w9',
    name: 'Michael Brown',
    gender: 'male',
    role: 'Operator',
    icon: 'operator',
    speed: 6.4,
    currentTask: 'Operating Packer #2',
    targetMachine: 'packer-2',
    status: 'working',
    shiftStart: '14:00',
    experience: 4,
    certifications: ['Packaging Systems'],
    color: '#f97316',
  },
  {
    id: 'w10',
    name: 'Jennifer Lee',
    gender: 'female',
    role: 'Quality Control',
    icon: 'quality',
    speed: 6.0,
    currentTask: 'Moisture analysis',
    targetMachine: 'sifter-a',
    status: 'working',
    shiftStart: '14:00',
    experience: 5,
    certifications: ['Food Science', 'HACCP'],
    color: '#a855f7',
  },
];

// =============================================================================
// BILATERAL AUTONOMY SYSTEM (BAS) RE-EXPORTS
// For convenience, re-export all BAS types from types/bas.ts
// =============================================================================

export type {
  FiveAxes,
  AxisKey,
  AxisConfig,
  AxisDescriptor,
  BASMode,
  EducationFocus,
  VoteType,
  VoteStatus,
  VoteOption,
  VoteComment,
  Vote,
  VotingRules,
  WallaceMetrics,
  ResourceRates,
  PhaseState,
  StabilityDataPoint,
  ValueMetrics,
  FlourishingDimensionKey,
  FlourishingDimension,
  FlourishingEvent,
  WorkerFlourishing,
  FactoryFlourishing,
  SuggestionMode,
  DecisionThreshold,
  AISuggestion,
  AIBehaviorConfig,
  BASPreset,
} from './types/bas';

export {
  BAS_PRESETS,
  AXIS_DESCRIPTORS,
  VOTING_RULES,
  STABILITY_THRESHOLD,
  WARNING_THRESHOLD,
  DEFAULT_AXES,
  DEFAULT_AXIS_CONFIG,
} from './types/bas';
