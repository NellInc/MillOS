/**
 * Canonical personnel model contract.
 *
 * The ten named workers use explicit identity profiles rather than pseudo-random
 * colours derived from their IDs. The profiles are shared by every LOD so a
 * person keeps the same silhouette, PPE, and role cues at every distance.
 */

import * as THREE from 'three';

export type HairStyle = 'bald' | 'short' | 'medium' | 'curly' | 'ponytail';
export type WorkerBodyType = 'masculine' | 'feminine';

export type ToolType =
  'clipboard' | 'tablet' | 'radio' | 'wrench' | 'magnifier' | 'sample-kit' | 'none';

export type WorkerWorkAction =
  'supervise' | 'inspect' | 'operate' | 'sample' | 'repair' | 'radio' | 'none';

export interface WorkerAppearance {
  bodyType: WorkerBodyType;
  uniformColor: string;
  skinTone: string;
  hatColor: string;
  hasVest: boolean;
  pantsColor: string;
  hairColor: string;
  hairStyle: HairStyle;
  tool: ToolType;
  eyeColor: string;
  accentColor: string;
  heightScale: number;
  bodyScale: number;
  headScale: number;
  hasHardHat: boolean;
  hasSafetyGlasses: boolean;
  hasHearingProtection: boolean;
  hasGloves: boolean;
  hasLabCoat: boolean;
  hasToolBelt: boolean;
  hasRadio: boolean;
  workAction: WorkerWorkAction;
}

export interface WorkerPoseRefs {
  torso: React.RefObject<THREE.Group | null>;
  head: React.RefObject<THREE.Group | null>;
  leftArm: React.RefObject<THREE.Group | null>;
  rightArm: React.RefObject<THREE.Group | null>;
  leftLeg: React.RefObject<THREE.Group | null>;
  rightLeg: React.RefObject<THREE.Group | null>;
  hips: React.RefObject<THREE.Mesh | null>;
  chest: React.RefObject<THREE.Mesh | null>;
  leftEyelid: React.RefObject<THREE.Mesh | null>;
  rightEyelid: React.RefObject<THREE.Mesh | null>;
  leftFingers: React.RefObject<THREE.Mesh | null>;
  rightFingers: React.RefObject<THREE.Mesh | null>;
}

export interface SimplifiedPoseRefs {
  leftArm: React.RefObject<THREE.Group | null>;
  rightArm: React.RefObject<THREE.Group | null>;
  leftLeg: React.RefObject<THREE.Group | null>;
  rightLeg: React.RefObject<THREE.Group | null>;
}

export const SKIN_TONES = [
  '#f5d0c5',
  '#d4a574',
  '#8d5524',
  '#c68642',
  '#e0ac69',
  '#ffdbac',
  '#f1c27d',
  '#cd8c52',
] as const;

export const HAIR_COLORS = [
  '#151312',
  '#2d1810',
  '#4a2b1a',
  '#6b4423',
  '#a06a3b',
  '#c59a5b',
  '#5a1f18',
] as const;

export const HAIR_STYLES: HairStyle[] = ['bald', 'short', 'medium', 'curly', 'ponytail'];

const ROLE_DEFAULTS: Record<string, WorkerAppearance> = {
  Supervisor: {
    bodyType: 'masculine',
    uniformColor: '#1d4ed8',
    skinTone: '#d4a574',
    hatColor: '#2563eb',
    hasVest: true,
    pantsColor: '#172033',
    hairColor: '#151312',
    hairStyle: 'short',
    tool: 'clipboard',
    eyeColor: '#3b2a20',
    accentColor: '#60a5fa',
    heightScale: 1.03,
    bodyScale: 1.02,
    headScale: 1,
    hasHardHat: true,
    hasSafetyGlasses: false,
    hasHearingProtection: false,
    hasGloves: false,
    hasLabCoat: false,
    hasToolBelt: false,
    hasRadio: true,
    workAction: 'supervise',
  },
  Engineer: {
    bodyType: 'feminine',
    uniformColor: '#334155',
    skinTone: '#f1c27d',
    hatColor: '#f8fafc',
    hasVest: false,
    pantsColor: '#1e293b',
    hairColor: '#4a2b1a',
    hairStyle: 'ponytail',
    tool: 'tablet',
    eyeColor: '#456174',
    accentColor: '#38bdf8',
    heightScale: 1,
    bodyScale: 0.97,
    headScale: 1,
    hasHardHat: true,
    hasSafetyGlasses: true,
    hasHearingProtection: false,
    hasGloves: false,
    hasLabCoat: false,
    hasToolBelt: false,
    hasRadio: false,
    workAction: 'inspect',
  },
  Operator: {
    bodyType: 'masculine',
    uniformColor: '#475569',
    skinTone: '#c68642',
    hatColor: '#eab308',
    hasVest: true,
    pantsColor: '#1e3a5f',
    hairColor: '#151312',
    hairStyle: 'short',
    tool: 'none',
    eyeColor: '#3b2a20',
    accentColor: '#facc15',
    heightScale: 1,
    bodyScale: 1,
    headScale: 1,
    hasHardHat: true,
    hasSafetyGlasses: false,
    hasHearingProtection: true,
    hasGloves: true,
    hasLabCoat: false,
    hasToolBelt: false,
    hasRadio: false,
    workAction: 'operate',
  },
  'Safety Officer': {
    bodyType: 'feminine',
    uniformColor: '#166534',
    skinTone: '#d4a574',
    hatColor: '#22c55e',
    hasVest: true,
    pantsColor: '#173b2b',
    hairColor: '#4a2b1a',
    hairStyle: 'ponytail',
    tool: 'radio',
    eyeColor: '#425c4c',
    accentColor: '#4ade80',
    heightScale: 0.98,
    bodyScale: 0.96,
    headScale: 1,
    hasHardHat: true,
    hasSafetyGlasses: true,
    hasHearingProtection: false,
    hasGloves: true,
    hasLabCoat: false,
    hasToolBelt: false,
    hasRadio: true,
    workAction: 'radio',
  },
  'Quality Control': {
    bodyType: 'feminine',
    uniformColor: '#f8fafc',
    skinTone: '#f5d0c5',
    hatColor: '#f8fafc',
    hasVest: false,
    pantsColor: '#312e81',
    hairColor: '#5a1f18',
    hairStyle: 'medium',
    tool: 'sample-kit',
    eyeColor: '#536b7a',
    accentColor: '#8b5cf6',
    heightScale: 0.97,
    bodyScale: 0.95,
    headScale: 1.01,
    hasHardHat: true,
    hasSafetyGlasses: true,
    hasHearingProtection: false,
    hasGloves: true,
    hasLabCoat: true,
    hasToolBelt: false,
    hasRadio: false,
    workAction: 'sample',
  },
  Maintenance: {
    bodyType: 'masculine',
    uniformColor: '#9a3412',
    skinTone: '#e0ac69',
    hatColor: '#f97316',
    hasVest: true,
    pantsColor: '#3f2a22',
    hairColor: '#151312',
    hairStyle: 'short',
    tool: 'wrench',
    eyeColor: '#3b2a20',
    accentColor: '#fb923c',
    heightScale: 1.01,
    bodyScale: 1.04,
    headScale: 1,
    hasHardHat: true,
    hasSafetyGlasses: true,
    hasHearingProtection: false,
    hasGloves: true,
    hasLabCoat: false,
    hasToolBelt: true,
    hasRadio: false,
    workAction: 'repair',
  },
};

const NAMED_PERSONNEL_PROFILES: Record<string, Partial<WorkerAppearance>> = {
  w1: {
    bodyType: 'masculine',
    skinTone: '#d4a574',
    hairColor: '#151312',
    hairStyle: 'short',
    eyeColor: '#33251f',
    heightScale: 1.06,
    bodyScale: 1.04,
  },
  w2: {
    bodyType: 'feminine',
    skinTone: '#f1c27d',
    hairColor: '#6b4423',
    hairStyle: 'ponytail',
    eyeColor: '#44677d',
    heightScale: 0.99,
    bodyScale: 0.96,
  },
  w3: {
    bodyType: 'masculine',
    skinTone: '#c68642',
    hairColor: '#151312',
    hairStyle: 'curly',
    eyeColor: '#35231b',
    heightScale: 1.03,
    bodyScale: 1.02,
  },
  w4: {
    bodyType: 'feminine',
    skinTone: '#f5d0c5',
    hairColor: '#5a1f18',
    hairStyle: 'medium',
    eyeColor: '#4e6678',
    heightScale: 0.96,
    bodyScale: 0.94,
  },
  w5: {
    bodyType: 'masculine',
    skinTone: '#e0ac69',
    hairColor: '#151312',
    hairStyle: 'short',
    eyeColor: '#2e2923',
    heightScale: 1.01,
    bodyScale: 1.05,
  },
  w6: {
    bodyType: 'feminine',
    skinTone: '#d4a574',
    hairColor: '#4a2b1a',
    hairStyle: 'ponytail',
    eyeColor: '#385445',
    heightScale: 0.98,
    bodyScale: 0.96,
  },
  w7: {
    bodyType: 'masculine',
    skinTone: '#8d5524',
    hairColor: '#151312',
    hairStyle: 'curly',
    eyeColor: '#2c211b',
    heightScale: 1.05,
    bodyScale: 1.03,
  },
  w8: {
    bodyType: 'feminine',
    skinTone: '#f5d0c5',
    hairColor: '#c59a5b',
    hairStyle: 'ponytail',
    eyeColor: '#506f83',
    heightScale: 1.02,
    bodyScale: 0.95,
  },
  w9: {
    bodyType: 'masculine',
    skinTone: '#d4a574',
    hairColor: '#2d1810',
    hairStyle: 'bald',
    eyeColor: '#3d3026',
    heightScale: 1.08,
    bodyScale: 1.06,
  },
  w10: {
    bodyType: 'feminine',
    skinTone: '#e0ac69',
    hairColor: '#151312',
    hairStyle: 'medium',
    eyeColor: '#3c3029',
    heightScale: 0.95,
    bodyScale: 0.94,
  },
};

export function getWorkerAppearance(role: string, color: string, id: string): WorkerAppearance {
  const base = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.Operator;
  const namedProfile = NAMED_PERSONNEL_PROFILES[id] ?? {};

  return {
    ...base,
    uniformColor: role === 'Operator' && color ? color : base.uniformColor,
    ...namedProfile,
  };
}

export function getPersonnelProfileIds(): string[] {
  return Object.keys(NAMED_PERSONNEL_PROFILES);
}
