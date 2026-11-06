import { createTranslator, defineMessages, translate, type Locale } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { unifiedGameTickMessages as tickMessages } from '../systems/UnifiedGameTick.messages';
import type { AlertData } from '../types';
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

/** In the language active now, or in `locale` when a review names its reader's. */
const word = (key: MessageKey, locale?: Locale) =>
  locale ? createTranslator(messages, locale)(key) : translate(messages, key);

export function incidentTitle(
  incident: { kind: OperationalIncident['kind'] | string; title: string },
  locale?: Locale
): string {
  const keys = keysFor(incident.kind);
  return keys ? word(keys.title, locale) : incident.title;
}

export function incidentDescription(
  incident: { kind: OperationalIncident['kind'] | string; description: string },
  locale?: Locale
): string {
  const keys = keysFor(incident.kind);
  return keys ? word(keys.description, locale) : incident.description;
}

/*
 * The bell notice an incident raises (UnifiedGameTick) is restored with the
 * plant, so its stored title and message would keep the language it was filed
 * in. These keys word it from the incident's kind in the language active now:
 * the title is the incident's, the message the tick's incidentAlert around its
 * description. An unknown kind words nothing, so the bell keeps the stored text.
 */
const INCIDENT_ALERT_CATALOG = 'campaign-incident';
const alertWords = (locale: Locale) => {
  const campaign = createTranslator(messages, locale);
  const tick = createTranslator(tickMessages, locale);
  return {
    incidentAlertTitle: (p: { kind: string }) => {
      const keys = keysFor(p.kind);
      return keys ? campaign(keys.title) : '';
    },
    incidentAlertMessage: (p: { kind: string }) => {
      const keys = keysFor(p.kind);
      return keys ? tick('incidentAlert', { description: campaign(keys.description) }) : '';
    },
  };
};
registerAlertCatalog(
  INCIDENT_ALERT_CATALOG,
  defineMessages({ en: alertWords('en'), 'pt-BR': alertWords('pt-BR') })
);

/** Keys for the incident's bell notice; undefined for a kind this build does not define. */
export function incidentAlertCopy(
  incident: Pick<OperationalIncident, 'kind'>
): AlertData['copy'] | undefined {
  return keysFor(incident.kind)
    ? {
        catalog: INCIDENT_ALERT_CATALOG,
        title: 'incidentAlertTitle',
        message: 'incidentAlertMessage',
        params: { kind: incident.kind },
      }
    : undefined;
}
