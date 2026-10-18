import { translate } from '../i18n';
import { utilityAssetsMessages } from './utilityAssets.messages';

export type UtilityAssetKind = 'horizontal_tank' | 'lpg_vessel';
export type UtilityCompound = 'tank_farm' | 'propane';

export interface UtilityAssetDefinition {
  id: string;
  label: string;
  contents: string;
  kind: UtilityAssetKind;
  compound: UtilityCompound;
  capacityLitres: number;
  nominalLevelPercent: number;
  nominalTemperatureC: number;
  nominalPressureBar: number;
  relativePosition: readonly [number, number, number];
  length?: number;
  radius: number;
  height?: number;
  color: string;
  accentColor: string;
}

/**
 * Shared identity and geometry contract for the five visible utility vessels.
 * The 3D yard and simulated SCADA read the same ids, labels, contents, and
 * capacities so a vessel cannot silently become a different asset in the UI.
 */
export const UTILITY_ASSET_DEFINITIONS: readonly UtilityAssetDefinition[] = [
  {
    id: 'utility-fuel-oil-01',
    label: 'FUEL OIL 01',
    contents: 'Low sulphur fuel oil',
    kind: 'horizontal_tank',
    compound: 'tank_farm',
    capacityLitres: 36000,
    nominalLevelPercent: 72,
    nominalTemperatureC: 18,
    nominalPressureBar: 0.12,
    relativePosition: [0, 0.16, -15],
    length: 10,
    radius: 3,
    color: '#dce4e5',
    accentColor: '#2f6f8f',
  },
  {
    id: 'utility-process-oil-02',
    label: 'PROCESS OIL 02',
    contents: 'Food-grade process oil',
    kind: 'horizontal_tank',
    compound: 'tank_farm',
    capacityLitres: 22000,
    nominalLevelPercent: 54,
    nominalTemperatureC: 20,
    nominalPressureBar: 0.1,
    relativePosition: [0, 0.16, 0],
    length: 8,
    radius: 2.5,
    color: '#eef1ed',
    accentColor: '#4f765b',
  },
  {
    id: 'utility-diesel-03',
    label: 'RESERVE DIESEL 03',
    contents: 'Standby generator diesel',
    kind: 'horizontal_tank',
    compound: 'tank_farm',
    capacityLitres: 36000,
    nominalLevelPercent: 81,
    nominalTemperatureC: 17,
    nominalPressureBar: 0.1,
    relativePosition: [0, 0.16, 15],
    length: 10,
    radius: 3,
    color: '#dce4e5',
    accentColor: '#9a6b2f',
  },
  {
    id: 'utility-lpg-01',
    label: 'LPG 01',
    contents: 'Liquefied petroleum gas',
    kind: 'lpg_vessel',
    compound: 'propane',
    capacityLitres: 18000,
    nominalLevelPercent: 63,
    nominalTemperatureC: 14,
    nominalPressureBar: 7.4,
    relativePosition: [-2.5, 0.14, 0],
    height: 5,
    radius: 1.5,
    color: '#f1f3ef',
    accentColor: '#b83a32',
  },
  {
    id: 'utility-lpg-02',
    label: 'LPG 02',
    contents: 'Liquefied petroleum gas',
    kind: 'lpg_vessel',
    compound: 'propane',
    capacityLitres: 12000,
    nominalLevelPercent: 76,
    nominalTemperatureC: 14,
    nominalPressureBar: 7.7,
    relativePosition: [2.5, 0.14, 0],
    height: 4,
    radius: 1.2,
    color: '#f1f3ef',
    accentColor: '#b83a32',
  },
];

const UTILITY_CONTENTS_KEYS: Record<string, keyof typeof utilityAssetsMessages.en> = {
  'utility-fuel-oil-01': 'lowSulphurFuelOil',
  'utility-process-oil-02': 'foodGradeProcessOil',
  'utility-diesel-03': 'standbyGeneratorDiesel',
  'utility-lpg-01': 'liquefiedPetroleumGas',
  'utility-lpg-02': 'liquefiedPetroleumGas',
};

/**
 * What a vessel holds, in the language active now. `contents` stays the
 * canonical English contract (it is copied into telemetry state and the SCADA
 * tag descriptions), so display code resolves the label here at render time.
 */
export function getUtilityAssetContentsLabel(asset: { id: string; contents: string }): string {
  const key = UTILITY_CONTENTS_KEYS[asset.id];
  return key ? translate(utilityAssetsMessages, key) : asset.contents;
}
