/**
 * Plain-language effect text, so every choice shows what it does on its own
 * button (Predynastic Egypt's choice hints) rather than in helper text.
 */
import { INCIDENT_DEFINITIONS } from '../stores/operationsCampaignStore';
import { SUSPENSION_CUSTOMER_DELTA } from './certifier';
import { EVENT_DECK } from './eventDeck';
import { FORECASTS } from './forecasts';
import { FRONTS } from './longNight';
import { MARKS, partyName } from './record';
import type { ChronicleEventEffect, ForecastKind, ModifierValues } from './types';

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

/** Standing moves in hundredths of a point, as Castles II's plot variables do. */
export function signedHundredths(value: number): string {
  return `${value > 0 ? '+' : '-'}${(Math.abs(value) / 100).toFixed(2)}`;
}

export function describeModifier(values: ModifierValues): string[] {
  const parts: string[] = [];
  if (values.production !== undefined) parts.push(`production x${values.production}`);
  if (values.energy !== undefined) parts.push(`energy x${values.energy}`);
  if (values.wear !== undefined) parts.push(`wear x${values.wear}`);
  if (values.qualityPenalty) parts.push(`quality ${signed(-values.qualityPenalty)}`);
  if (values.reinvestment)
    parts.push(`reinvestment ${signed(Math.round(values.reinvestment * 100))}%`);
  if (values.forecastChance)
    parts.push(`forecasts ${signed(Math.round(values.forecastChance * 100))} points`);
  if (values.upkeep !== undefined) parts.push(`upkeep x${values.upkeep}`);
  return parts;
}

export function describeEffect(effect: ChronicleEventEffect): string {
  const parts: string[] = [];
  if (effect.fund) parts.push(`fund ${signed(effect.fund)}`);
  if (effect.knowHow) parts.push(`know-how ${signed(effect.knowHow)}`);
  if (effect.modifier) {
    const { shifts, ...values } = effect.modifier;
    const text = describeModifier(values);
    if (text.length)
      parts.push(`${text.join(', ')} for ${shifts} ${shifts === 1 ? 'shift' : 'shifts'}`);
  }
  const deltas = !effect.relationship
    ? []
    : Array.isArray(effect.relationship)
      ? effect.relationship
      : [effect.relationship];
  for (const { customer, delta } of deltas) {
    const name = customer === 'all' ? 'all customers' : partyName(customer);
    parts.push(`${name} ${signed(delta)}`);
  }
  if (effect.standing) parts.push(`standing ${signedHundredths(effect.standing)}`);
  // What a mark does at once is shown; what it leads to later is the record's to tell.
  for (const id of effect.marks ?? []) {
    for (const prepare of MARKS[id]?.prepares ?? [])
      parts.push(`prepares ${FRONTS[prepare.front].subject} for the long night`);
    for (const [kind, relief] of Object.entries(MARKS[id]?.forecastRelief ?? {}))
      parts.push(
        `${FORECASTS[kind as ForecastKind].title.toLowerCase()} -${Math.round((relief ?? 0) * 100)} points`
      );
  }
  if (effect.suspend)
    parts.push(`approval suspended; all customers ${signed(SUSPENSION_CUSTOMER_DELTA)}`);
  if (effect.reinstate) parts.push('approval restored');
  if (effect.resolveChain?.length) {
    const rulings = effect.resolveChain
      .map((id) => {
        const event = EVENT_DECK.find((candidate) => candidate.id === id);
        const choice = event?.choices.find((c) => c.id === event.defaultChoiceId);
        // Each case's default is itself a hand-over, so name the ruling by its record entry.
        const label = choice?.effect.marks?.[0] ? MARKS[choice.effect.marks[0]]?.label : null;
        return label ? label.charAt(0).toLowerCase() + label.slice(1) : null;
      })
      .filter(Boolean);
    parts.push(`the AI partner rules the rest${rulings.length ? `: ${rulings.join(', ')}` : ''}`);
  }
  if (effect.treatCrop) parts.push('treats this crop year');
  if (effect.incident)
    parts.push(`raises: ${INCIDENT_DEFINITIONS[effect.incident].title.toLowerCase()}`);
  if (effect.closeInspection) parts.push('closes the inspection');
  return parts.join('; ');
}
