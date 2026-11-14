/**
 * The forklift-only stop: every forklift holds where it is and the mill keeps
 * running. The X key and the Safety panel set and release it through here, so
 * a phone (no X key) gets the same stop: the klaxon, the PA line on the
 * forklift-stop topic (retired on release by the PA scheduler), and an entry
 * in the incident log.
 * Working if the panel's stop and the X key's leave the same state behind, and
 * both refuse during a drill and while a facility stop owns the release.
 */
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { safetyStoreMessages } from '../../../stores/safetyStore.messages';
import { audioManager } from '../../../utils/audioManager';
import { FORKLIFT_STOP_TOPIC } from '../../game/shared';
import { sharedMessages } from '../../game/shared.messages';
import { registerAlertCatalog } from '../../../i18n/alertCopy';
import { translate } from '../../../i18n';

// The stop's PA line, filed by key so it follows a language switch and a
// reload. The catalogue id predates the panel control: saved lines carry it.
const FORKLIFT_STOP_PA_CATALOG = 'keyboardShortcutsPA';
const FORKLIFT_STOP_PA_KEY = 'forkliftStop';
registerAlertCatalog(FORKLIFT_STOP_PA_CATALOG, sharedMessages);

/** Why the stop cannot be set or released now, or null when it can. */
export type ForkliftStopRefusal = 'drill' | 'facilityStop';

/**
 * A drill holds the forklifts whatever the flag says, and a facility stop owns
 * the release of a forklift stop set before it. Setting the stop outside a
 * drill is always allowed.
 */
export function forkliftStopRefusal(): ForkliftStopRefusal | null {
  const sim = useGameSimulationStore.getState();
  if (sim.emergencyDrillMode) return 'drill';
  if (sim.emergencyActive && useSafetyStore.getState().forkliftEmergencyStop) return 'facilityStop';
  return null;
}

/** Set the stop. False when refused or already set. */
export function engageForkliftStop(source: 'keyboard' | 'panel'): boolean {
  if (forkliftStopRefusal() !== null) return false;
  const safety = useSafetyStore.getState();
  if (safety.forkliftEmergencyStop) return false;
  safety.setForkliftEmergencyStop(true);
  audioManager.playEmergencyStop();
  audioManager.startEmergencyStopAlarm();
  // Forklift-only stop: the PA must not claim the mill has stopped. On the
  // forklift-stop topic, so the release retires it even after a language
  // switch changed the line's wording.
  useProductionStore.getState().addAnnouncement({
    type: 'emergency',
    message: translate(sharedMessages, FORKLIFT_STOP_PA_KEY),
    priority: 4,
    channel: 'safety',
    topic: FORKLIFT_STOP_TOPIC,
    copy: { catalog: FORKLIFT_STOP_PA_CATALOG, key: FORKLIFT_STOP_PA_KEY },
  });
  // Kept by key, so the log reads in the language active when read.
  const descriptionKey = source === 'keyboard' ? 'keyboardEmergencyStop' : 'panelForkliftStop';
  safety.addSafetyIncident({
    type: 'emergency',
    description: translate(safetyStoreMessages, descriptionKey),
    descriptionKey,
  });
  return true;
}

/** Release the stop. False when refused or not set. */
export function releaseForkliftStop(): boolean {
  if (forkliftStopRefusal() !== null) return false;
  const safety = useSafetyStore.getState();
  if (!safety.forkliftEmergencyStop) return false;
  safety.setForkliftEmergencyStop(false);
  audioManager.stopEmergencyStopAlarm();
  return true;
}
