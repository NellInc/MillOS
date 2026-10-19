export enum MachineType {
  SILO = 'SILO',
  ROLLER_MILL = 'ROLLER_MILL',
  PLANSIFTER = 'PLANSIFTER',
  PACKER = 'PACKER',
  CONTROL_ROOM = 'CONTROL_ROOM',
}

export type GrainQuality = 'premium' | 'standard' | 'economy' | 'mixed';
export type PersonalityTrait = 'reliable' | 'temperamental' | 'workhorse' | 'quirky' | 'veteran';
export type MachineMood = 'happy' | 'neutral' | 'grumpy' | 'stressed';
export const BAG_WEIGHT_KG = 25;

export interface MachinePersonality {
  nickname: string;
  trait: PersonalityTrait;
  description: string;
  quirks: string[];
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  type: 'preventive' | 'corrective' | 'emergency';
  serviceUnit: string;
  notes: string;
  duration: number;
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
    wear: number;
    efficiency: number;
  };
  lastMaintenance: string;
  nextMaintenance: string;
  fillLevel?: number;
  grainQuality?: GrainQuality;
  grainType?: string;
  maintenanceCountdown?: number;
  maintenanceHistory?: MaintenanceRecord[];
  personality?: MachinePersonality;
  mood?: MachineMood;
  moodHistory?: Array<{ timestamp: number; mood: MachineMood; reason: string }>;
}

export interface ProductData {
  id: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  axis: 'x' | 'z';
  direction: 1 | -1;
  type: 'GRAIN' | 'FLOUR_BAG';
  batchNumber?: string;
  batchDate?: string;
  quality?: GrainQuality;
  weight?: number;
}

export interface ProductionTarget {
  id: string;
  date: string;
  targetBags: number;
  producedBags: number;
  targetThroughput: number;
  actualThroughput: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AlertData {
  id: string;
  type: 'warning' | 'critical' | 'info' | 'success' | 'safety';
  title: string;
  message: string;
  machineId?: string;
  timestamp: Date;
  acknowledged: boolean;
  /**
   * ISA-18.2 RTN_UNACK: the condition behind this alert has cleared but nobody
   * has acknowledged it. It stays listed for acknowledgement; it no longer
   * holds the safety-critical UI.
   */
  returnedToNormal?: boolean;
  /**
   * Read once to screen readers when it is filed (AlertSystem), whatever the
   * PA mode or audio mute: 'assertive' interrupts (a breakdown, a critical
   * incident), 'polite' waits (a wear warning, a quality hold, a closed
   * shift). Routine alerts and SCADA alarm traffic leave it unset.
   */
  announce?: 'polite' | 'assertive';
}

export type AIDecisionDisposition = 'accepted' | 'modified' | 'rejected' | 'deferred' | 'automatic';

export interface AIDecisionObservation {
  label: string;
  value: string | number;
  unit?: string;
  source: 'simulation' | 'scada' | 'control' | 'schedule' | 'prediction';
  quality: 'good' | 'uncertain' | 'stale' | 'bad';
  capturedAt: number;
}

export interface AIDecisionProvenance {
  capturedAt: number;
  observations: AIDecisionObservation[];
  assumptions: string[];
  affectedSystems: string[];
  affectedEquipment: string[];
  expectedEffect: string;
  alternatives: Array<{ action: string; tradeoff: string }>;
  inputSnapshot: Record<string, string | number | boolean | null>;
}

export interface AIDecisionResponse {
  disposition: AIDecisionDisposition;
  recordedAt: number;
  note?: string;
  modifiedAction?: string;
}

export interface AIDecisionMeasuredOutcome {
  recordedAt: number;
  summary: string;
  measurements: Record<string, string | number | boolean | null>;
}

export interface AIDecision {
  id: string;
  timestamp: Date;
  type: 'coordination' | 'optimization' | 'prediction' | 'maintenance' | 'safety';
  action: string;
  reasoning: string;
  confidence: number;
  impact: string;
  machineId?: string;
  parentDecisionId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'superseded';
  outcome?: string;
  triggeredBy?: 'alert' | 'metric' | 'schedule' | 'prediction' | 'user';
  relatedAlertId?: string;
  alternatives?: Array<{ action: string; tradeoff: string }>;
  uncertainty?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  expiresAt?: Date;
  provenance?: AIDecisionProvenance;
  response?: AIDecisionResponse;
  measuredOutcome?: AIDecisionMeasuredOutcome;
}

export type StrategicCategory = 'efficiency' | 'safety' | 'quality' | 'throughput' | 'energy';

export interface StrategicPriority {
  id: string;
  priority: string;
  weight: 1 | 2 | 3 | 4 | 5;
  category: StrategicCategory;
  machineAffinities: string[];
  createdAt: number;
  expiresAt: number;
}

export interface ForkliftData {
  id: string;
  position: [number, number, number];
  rotation: number;
  status: 'moving' | 'loading' | 'unloading' | 'idle';
  cargo: 'empty' | 'pallet' | 'grain' | 'flour';
  targetPosition?: [number, number, number];
}
