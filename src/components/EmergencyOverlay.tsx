import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { OctagonX, Siren } from 'lucide-react';
import { useSafetyStore } from '../stores/safetyStore';
import {
  selectInAppReducedMotion,
  useMotionPreferenceStore,
} from '../stores/motionPreferenceStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useChronicleStore } from '../stores/chronicleStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useT } from '../i18n';
import { emergencyOverlayMessages } from './EmergencyOverlay.messages';
import { LiveRegionPortal } from './ui/LiveRegionPortal';
import { releaseForkliftStop } from './ui-new/panels/forkliftStop';

// Emergency Overlay Component - shows flashing red border
export const EmergencyOverlay: React.FC = () => {
  const t = useT(emergencyOverlayMessages);
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  // 'E-STOP' is the Safety panel's own stop: the operator is the cause.
  const deliberateStop = useGameSimulationStore((state) => state.emergencyMachineId === 'E-STOP');
  // A Mill Chronicle duct fire is cleared from its own prompt, not the Safety panel.
  const chronicleFire = useGameSimulationStore(
    (state) =>
      state.crisisState.type === 'fire' && state.crisisState.metadata?.source === 'chronicle'
  );
  // A Chronicle dialog on screen is either the fire's own guidance or one the
  // player opened; the strip would cover it, and returns when it closes.
  const dialogOpen = useChronicleStore((state) => state.dialogOpen);
  // A phone sheet (z-50, under this layer) is what is read while it is open:
  // the banner and guidance sat over its tabs and controls. They step aside
  // and return when it closes; the border and the spoken alert stay.
  const sheetOpen = useMobileControlStore((state) => state.mobilePanelVisible);
  // Once suppression or a clean is under way the fire has no prompt left.
  const chronicleCleaning = useChronicleStore(
    (state) => state.chronicle.fire.active && state.chronicle.fire.suppressing
  );
  // framer's hook reads only the OS media query; the in-app setting is OR'd in.
  const inAppReducedMotion = useMotionPreferenceStore(selectInAppReducedMotion);
  const reduceMotion = useReducedMotion() || inAppReducedMotion;

  // Either emergency type triggers the overlay
  const isEmergency = forkliftEmergencyStop || emergencyActive;
  const isDrill = emergencyDrillMode;
  // The X-key stop holds only the forklifts; production keeps running.
  const forkliftOnly = forkliftEmergencyStop && !emergencyActive;

  // Release takes itself away with the stop, so focus goes back to what had
  // it when the stop came on, else to the Safety dock button, never to <body>
  // (where the next Space is the forklift stop again). Moved in the press,
  // since the exit fade keeps the button mounted a moment longer.
  const focusBeforeStop = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!forkliftOnly) return;
    const active = document.activeElement;
    focusBeforeStop.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }, [forkliftOnly]);
  const releaseAndRefocus = () => {
    releaseForkliftStop();
    const before = focusBeforeStop.current;
    focusBeforeStop.current = null;
    const target =
      before?.isConnected && !before.closest('[data-emergency-overlay]')
        ? before
        : (document.querySelector<HTMLElement>('button[data-dock-mode="safety"]') ??
          document.querySelector<HTMLElement>('button[data-notification-bell]'));
    target?.focus();
  };
  const accent = isDrill ? 'rgba(245, 158, 11, 0.82)' : 'rgba(239, 68, 68, 0.82)';
  const wash = isDrill ? 'rgba(245, 158, 11, 0.16)' : 'rgba(239, 68, 68, 0.24)';
  const Icon = isDrill ? Siren : OctagonX;
  const title = isDrill
    ? t('drillTitle')
    : forkliftOnly
      ? t('forkliftStopTitle')
      : t('facilityStopTitle');
  const guidance = isDrill
    ? t('drillGuidance')
    : forkliftOnly
      ? t('forkliftStopGuidance')
      : chronicleFire
        ? chronicleCleaning
          ? t('chronicleFireCleaningGuidance')
          : t('chronicleFireGuidance')
        : deliberateStop
          ? t('deliberateStopGuidance')
          : t('facilityStopGuidance');

  return (
    <>
      {/* The spoken path is one persistent alert region at document.body, so a
          compact sheet's aria-hidden, inert HUD root cannot silence it. The
          banner below is what the eye reads, and is hidden from screen readers
          so the stop is announced once. It keeps the banner's accessible name
          (the stop's title) while a stop is active. */}
      <LiveRegionPortal>
        <div
          role="alert"
          aria-atomic="true"
          aria-label={isEmergency ? title : undefined}
          className="sr-only"
        >
          {isEmergency ? t('liveRegion', { title, guidance }) : ''}
        </div>
      </LiveRegionPortal>
      <AnimatePresence>
        {isEmergency && (
          <motion.div
            key={isDrill ? 'simulated-drill' : forkliftOnly ? 'forklift-stop' : 'facility-stop'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-0 z-[60]"
            data-emergency-overlay=""
          >
            {/* Flashing red border */}
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
              }
              className="absolute inset-0"
              style={{
                boxShadow: `inset 0 0 0 4px ${accent}, inset 0 0 52px ${wash}`,
              }}
            />

            {/* Explicit safety-state banner. Below the HUD row (48 px) on a
                desktop: over it, it hid the programme and the commitment. On
                a phone, below the bell row (its 48 px bell from the safe-area
                top, StatusHUD compact): over it, it covered the bell. A
                landscape phone is sm-wide but short: at top-16 it covered the
                soundtrack card's controls, so there it drops to 7.5rem, compact,
                clear of two lines of Portuguese guidance below it.
                Working if both read while a stop or drill holds. */}
            {!sheetOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                data-testid="emergency-banner"
                aria-hidden="true"
                className="absolute left-1/2 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 sm:top-16 [@media(min-width:640px)_and_(max-height:480px)]:top-[7.5rem]"
              >
                <div
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-white shadow-lg backdrop-blur-sm [@media(max-height:480px)]:py-1 ${
                    isDrill
                      ? 'border-amber-300 bg-amber-700/95 shadow-amber-500/30'
                      : 'border-red-300 bg-red-700/95 shadow-red-500/40'
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span className="font-bold text-sm uppercase tracking-wide [@media(max-height:480px)]:text-xs">
                    {title}
                  </span>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
              </motion.div>
            )}

            {/* Unambiguous response guidance */}
            {!dialogOpen && !sheetOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-4 right-4 top-[calc(max(0.75rem,env(safe-area-inset-top))+7rem)] sm:bottom-28 sm:left-1/2 sm:right-auto sm:top-auto sm:-translate-x-1/2"
              >
                <div
                  aria-hidden="true"
                  className="mx-auto max-w-md rounded-lg border border-slate-600 bg-slate-950/95 px-4 py-2 text-center text-xs text-slate-100 backdrop-blur-sm"
                >
                  {guidance}
                </div>
                {/* The stop shows as on here over every panel, so its release
                    is here too (a phone has no X key). A facility stop or a
                    drill owns the forklifts' release; the guidance names it. */}
                {forkliftOnly && !isDrill && (
                  <button
                    type="button"
                    onClick={releaseAndRefocus}
                    className="pointer-events-auto mx-auto mt-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-amber-300/60 bg-amber-900/90 px-4 text-xs font-bold uppercase text-amber-50 hover:bg-amber-800"
                  >
                    {t('releaseForkliftStop')}
                  </button>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
