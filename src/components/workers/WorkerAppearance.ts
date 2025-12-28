/**
 * Worker appearance configuration based on role
 */

import type { HairStyle, ToolType } from './workerTypes';

export interface WorkerAppearanceConfig {
  uniformColor: string;
  skinTone: string;
  hatColor: string;
  hasVest: boolean;
  pantsColor: string;
  hairColor: string;
  hairStyle: HairStyle;
  tool: ToolType;
}

const SKIN_TONES_LOCAL = [
  '#f5d0c5',
  '#d4a574',
  '#8d5524',
  '#c68642',
  '#e0ac69',
  '#ffdbac',
  '#f1c27d',
  '#cd8c52',
];

const HAIR_COLORS_LOCAL = [
  '#1a1a1a',
  '#3d2314',
  '#8b4513',
  '#d4a574',
  '#4a3728',
  '#2d1810',
  '#654321',
  '#8b0000',
];

const HAIR_STYLES_LOCAL: HairStyle[] = ['bald', 'short', 'medium', 'curly', 'ponytail'];

export const getWorkerAppearance = (
  role: string,
  color: string,
  id: string
): WorkerAppearanceConfig => {
  const skinIndex = id.charCodeAt(id.length - 1) % SKIN_TONES_LOCAL.length;
  const hairColorIndex = id.charCodeAt(0) % HAIR_COLORS_LOCAL.length;
  const hairStyleIndex = (id.charCodeAt(1) || 0) % HAIR_STYLES_LOCAL.length;
  const skinTone = SKIN_TONES_LOCAL[skinIndex];
  const hairColor = HAIR_COLORS_LOCAL[hairColorIndex];
  const hairStyle = HAIR_STYLES_LOCAL[hairStyleIndex];

  switch (role) {
    case 'Supervisor':
      return {
        uniformColor: '#1e40af',
        skinTone,
        hatColor: '#1e40af',
        hasVest: false,
        pantsColor: '#1e293b',
        hairColor,
        hairStyle,
        tool: 'clipboard' as ToolType,
      };
    case 'Engineer':
      return {
        uniformColor: '#374151',
        skinTone,
        hatColor: '#ffffff',
        hasVest: false,
        pantsColor: '#1f2937',
        hairColor,
        hairStyle,
        tool: 'tablet' as ToolType,
      };
    case 'Safety Officer':
      return {
        uniformColor: '#166534',
        skinTone,
        hatColor: '#22c55e',
        hasVest: true,
        pantsColor: '#14532d',
        hairColor,
        hairStyle,
        tool: 'radio' as ToolType,
      };
    case 'Quality Control':
      return {
        uniformColor: '#7c3aed',
        skinTone,
        hatColor: '#ffffff',
        hasVest: false,
        pantsColor: '#1e1b4b',
        hairColor,
        hairStyle,
        tool: 'magnifier' as ToolType,
      };
    case 'Maintenance':
      return {
        uniformColor: '#9a3412',
        skinTone,
        hatColor: '#f97316',
        hasVest: true,
        pantsColor: '#431407',
        hairColor,
        hairStyle,
        tool: 'wrench' as ToolType,
      };
    case 'Operator':
    default:
      return {
        uniformColor: color || '#475569',
        skinTone,
        hatColor: '#eab308',
        hasVest: id.charCodeAt(2) % 2 === 0,
        pantsColor: '#1e3a5f',
        hairColor,
        hairStyle,
        tool: 'none' as ToolType,
      };
  }
};
