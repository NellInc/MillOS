import { translate } from '../i18n';
import type { IncidentKind, OperationalIncident } from './operationsCampaignStore';
import { operationsCampaignMessages as messages } from './operationsCampaignStore.messages';

type En = typeof messages.en;
/** Plain-string keys only: incident copy takes no parameters. */
type MessageKey = { [K in keyof En]: En[K] extends string ? K : never }[keyof En] & string;

/*
 * An incident record copies its title and description when it fires, and the
 * record is persisted, so the stored strings are in the language active at
 * that moment. Render through these helpers instead: they resolve the kind's
 * copy in the language active now, and fall back to the stored text for a
 * record whose kind this build no longer defines.
 */
const INCIDENT_TEXT_KEYS: Record<IncidentKind, { title: MessageKey; description: MessageKey }> = {
  bearing_overheat: {
    title: 'bearingOverheatTitle',
    description: 'bearingOverheatDescription',
  },
  dust_filter_pressure: {
    title: 'dustFilterPressureTitle',
    description: 'dustFilterPressureDescription',
  },
  power_sag: { title: 'powerSagTitle', description: 'powerSagDescription' },
  delayed_truck: { title: 'delayedTruckTitle', description: 'delayedTruckDescription' },
  supplier_contamination: {
    title: 'supplierContaminationTitle',
    description: 'supplierContaminationDescription',
  },
  packaging_shortage: {
    title: 'packagingShortageTitle',
    description: 'packagingShortageDescription',
  },
  severe_rain: { title: 'severeRainTitle', description: 'severeRainDescription' },
  control_network_degraded: {
    title: 'controlNetworkDegradedTitle',
    description: 'controlNetworkDegradedDescription',
  },
};

const keysFor = (kind: string) =>
  Object.prototype.hasOwnProperty.call(INCIDENT_TEXT_KEYS, kind)
    ? INCIDENT_TEXT_KEYS[kind as IncidentKind]
    : null;

export function incidentTitle(incident: Pick<OperationalIncident, 'kind' | 'title'>): string {
  const keys = keysFor(incident.kind);
  return keys ? translate(messages, keys.title) : incident.title;
}

export function incidentDescription(
  incident: Pick<OperationalIncident, 'kind' | 'description'>
): string {
  const keys = keysFor(incident.kind);
  return keys ? translate(messages, keys.description) : incident.description;
}
