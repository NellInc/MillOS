import { copy } from './forecasts.messages';
/**
 * Forewarned risk with paid mitigation, after Egypt: Old Kingdom's flood
 * oracle ("Probability of disaster N%" with "Construct dams: -X, chance -Y%").
 * A forecast that strikes raises the real operations incident.
 */
import type { ForecastDefinition, ForecastKind } from './types';

/**
 * Mitigation prices (fix-up c of plan item 4c) are set against the damage the
 * relief avoids by the engine's own price of an incident (`incidentFundCost`
 * on the measured shift, at the 0.70% share of 13 November: storm about 14,
 * grid strain 16, dust 4, road works 2), times the relief: 4.75, 4.84, 1.31
 * and 0.72. At full relief dust pays a little more than it costs and the
 * storm, grid strain and road works a little less (dust also spares three
 * quality points, which the price leaves out); near the 5% floor the relief
 * is cut short and none pays. They were 60, 80, 50 and 45 against damage of
 * 16, 15, 5 and 2; storm and grid strain 6 until the 0.79% share, and dust 2
 * until the 0.70% share left it priced at 1.53 times what it avoids.
 */
export const FORECASTS: Record<ForecastKind, ForecastDefinition> = {
  severe_rain: {
    kind: 'severe_rain',
    title: 'Storm front',
    text: 'The met office expects heavy rain over the valley. Yard drainage and the stream will be loaded.',
    baseChance: 0.6,
    mitigationLabel: 'Clear the drains',
    mitigationCost: 5,
    mitigationRelief: 0.35,
    leadShifts: 2,
  },
  power_sag: {
    kind: 'power_sag',
    title: 'Grid strain',
    text: 'The network operator warns of low reserve margins and voltage dips at peak.',
    baseChance: 0.5,
    mitigationLabel: 'Book demand response',
    mitigationCost: 5,
    mitigationRelief: 0.3,
    leadShifts: 2,
  },
  dust_filter_pressure: {
    kind: 'dust_filter_pressure',
    title: 'Dust load building',
    text: 'Filter differential pressure is trending up on the sifting floor extraction.',
    baseChance: 0.55,
    mitigationLabel: 'Pulse-clean the filters',
    mitigationCost: 1,
    mitigationRelief: 0.35,
    leadShifts: 1,
  },
  delayed_truck: {
    kind: 'delayed_truck',
    title: 'Road works',
    text: 'The county has closed a lane on the haul road. Collections may run late.',
    baseChance: 0.5,
    mitigationLabel: 'Arrange a relief haulier',
    mitigationCost: 1,
    mitigationRelief: 0.3,
    leadShifts: 2,
  },
};

export const FORECAST_KINDS = Object.keys(FORECASTS) as ForecastKind[];

/** Chance a forecast is issued at a shift close, when none is pending. */
export const FORECAST_ISSUE_CHANCE = 0.3;

export function clampChance(value: number): number {
  return Math.min(0.95, Math.max(0.05, Number.isFinite(value) ? value : 0));
}

export function forecastChance(
  kind: ForecastKind,
  options: { shift: number; relief: number; mitigated: boolean }
): number {
  const definition = FORECASTS[kind];
  return clampChance(
    definition.baseChance +
      options.shift -
      options.relief -
      (options.mitigated ? definition.mitigationRelief : 0)
  );
}

export function getForecasts(): Record<ForecastKind, ForecastDefinition> {
  return Object.fromEntries(
    Object.entries(FORECASTS).map(([kind, definition]) => [
      kind,
      {
        ...definition,
        title: copy(definition.title),
        text: copy(definition.text),
        mitigationLabel: copy(definition.mitigationLabel),
      },
    ])
  ) as Record<ForecastKind, ForecastDefinition>;
}
