import { copy } from './stakeholders.messages';
import { formatFixed } from '../i18n';
/**
 * Organisations that are not customers (docs/CHRONICLE.md, system 18), after
 * Awakening's lesson that loyalty is who shows up: Ser Derren on the wall,
 * four soldiers in the mob. Each is an organisation; nothing here scores a
 * person or the workforce.
 */
import { clampRelationship, relationshipTier } from './customers';
import type { ForecastKind, StakeholderId, StakeholderRelationship } from './types';

export const STAKEHOLDERS: ReadonlyArray<{ id: StakeholderId; name: string; phrase: string }> = [
  { id: 'growers', name: 'Growers’ cooperative', phrase: 'the growers’ cooperative' },
  { id: 'haulier', name: 'Valley Haulage', phrase: 'Valley Haulage' },
  { id: 'village', name: 'Village committee', phrase: 'the village committee' },
  { id: 'federation', name: 'Regional federation', phrase: 'the regional federation' },
];

/** The organisation as it reads mid-sentence. */
export function stakeholderPhrase(id: StakeholderId): string {
  return STAKEHOLDERS.find((party) => party.id === id)?.phrase ?? id;
}

export const STAKEHOLDER_START = 50;

export function initialStakeholders(start = STAKEHOLDER_START): StakeholderRelationship[] {
  return STAKEHOLDERS.map((party) => ({
    id: party.id,
    name: party.name,
    value: clampRelationship(start),
  }));
}

export function stakeholderName(id: StakeholderId): string {
  return STAKEHOLDERS.find((party) => party.id === id)?.name ?? id;
}

function tierOf(stakeholders: readonly StakeholderRelationship[], id: StakeholderId) {
  const party = stakeholders.find((candidate) => candidate.id === id);
  return party ? relationshipTier(party.value) : 'neutral';
}

/** Crop treatment price multiplier: warm growers lend drying and blending capacity. */
export const GROWERS_TREATMENT = { warm: 0.75, cool: 1.25 } as const;
/** Forecast points a warm haulier takes off road works, and a cool one adds. */
export const HAULIER_FORECAST = 0.1;
/** Forecast points a warm village committee takes off storms (it clears the drains). */
export const VILLAGE_FORECAST = 0.1;
/** Reinvestment added while the federation is warm. */
export const FEDERATION_REINVESTMENT = 0.03;

export function treatmentMultiplier(stakeholders: readonly StakeholderRelationship[]): number {
  const tier = tierOf(stakeholders, 'growers');
  return tier === 'warm' ? GROWERS_TREATMENT.warm : tier === 'cool' ? GROWERS_TREATMENT.cool : 1;
}

/** Signed forecast points the organisations add (negative is relief). */
export function stakeholderForecastShift(
  stakeholders: readonly StakeholderRelationship[],
  kind: ForecastKind
): number {
  if (kind === 'delayed_truck') {
    const tier = tierOf(stakeholders, 'haulier');
    return tier === 'warm' ? -HAULIER_FORECAST : tier === 'cool' ? HAULIER_FORECAST : 0;
  }
  if (kind === 'severe_rain' && tierOf(stakeholders, 'village') === 'warm')
    return -VILLAGE_FORECAST;
  return 0;
}

export function stakeholderReinvestment(stakeholders: readonly StakeholderRelationship[]): number {
  return tierOf(stakeholders, 'federation') === 'warm' ? FEDERATION_REINVESTMENT : 0;
}

/** What each organisation does at its tier, for its row in the Partners tab. */
export function stakeholderStanding(
  stakeholders: readonly StakeholderRelationship[],
  id: StakeholderId
): string | null {
  const tier = tierOf(stakeholders, id);
  if (id === 'growers')
    return tier === 'warm' ? 'crop treatment -25%' : tier === 'cool' ? 'crop treatment +25%' : null;
  if (id === 'haulier')
    return tier === 'warm'
      ? `road works -${HAULIER_FORECAST * 100} points`
      : tier === 'cool'
        ? `road works +${HAULIER_FORECAST * 100} points`
        : null;
  if (id === 'village')
    return tier === 'warm' ? `storm front -${VILLAGE_FORECAST * 100} points` : null;
  return tier === 'warm' ? `reinvestment +${FEDERATION_REINVESTMENT * 100}%` : null;
}

export function localizedStakeholderPhrase(id: StakeholderId): string {
  return copy(STAKEHOLDERS.find((party) => party.id === id)?.phrase ?? id);
}

export function localizedStakeholderName(id: StakeholderId): string {
  return copy(STAKEHOLDERS.find((party) => party.id === id)?.name ?? id);
}

export function localizedStakeholderStanding(
  stakeholders: readonly StakeholderRelationship[],
  id: StakeholderId
): string | null {
  const tier = tierOf(stakeholders, id);
  if (id === 'growers')
    return tier === 'warm'
      ? copy('crop treatment -25%')
      : tier === 'cool'
        ? copy('crop treatment +25%')
        : null;
  if (id === 'haulier')
    return tier === 'warm'
      ? copy('road works -{points} points', { points: formatFixed(HAULIER_FORECAST * 100) })
      : tier === 'cool'
        ? copy('road works +{points} points', { points: formatFixed(HAULIER_FORECAST * 100) })
        : null;
  if (id === 'village')
    return tier === 'warm'
      ? copy('storm front -{points} points', { points: formatFixed(VILLAGE_FORECAST * 100) })
      : null;
  return tier === 'warm'
    ? copy('reinvestment +{points}%', { points: formatFixed(FEDERATION_REINVESTMENT * 100) })
    : null;
}
