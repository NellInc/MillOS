import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppMotionConfig } from './AppMotionConfig';
import { X } from 'lucide-react';
import { GameInterface } from './ui-new/GameInterface';
import { ProductionTargetWidget } from './ProductionTargetWidget';
import {
  EnergyDashboard,
  MultiObjectiveDashboard,
  CostEstimationOverlay,
  WeatherEffectsOverlay,
} from './ui';
import { AudioReactiveProvider } from './AudioReactiveProvider';
import { MobileControlsOverlay, RotateDeviceOverlay } from './mobile/MobileControlsOverlay';
import { CameraPresetIndicator } from './CameraController';
import { FPSCrosshair, FPSInstructions } from './FirstPersonController';
import { MobileFPSInstructions } from './mobile/MobileFirstPersonController';
import type { ForkliftData } from './ForkliftSystem';
import type { MachineData } from '../types';
import { useT } from '../i18n';
import { deferredOperationalUIMessages } from './DeferredOperationalUI.messages';
import { keyboardShortcutsMessages } from '../hooks/useKeyboardShortcuts.messages';
import { vehicleTelemetryRegistry } from '../simulation/vehicles/vehicleTelemetryRegistry';
import { useForkliftDriveStore } from '../stores/forkliftDriveStore';
import { forkliftCrewLive, isForkliftCrewActive } from '../stores/forkliftCrewStore';
import type { ForkliftCrewPhase } from '../simulation/forkliftCrew';
import { focusDockItem } from './ui-new/dock/focusDockItem';
import { LiveRegionPortal } from './ui/LiveRegionPortal';
import { useModalDialogOpen } from './ui/useModalDialogOpen';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useChronicleStore } from '../stores/chronicleStore';

/**
 * The selected forklift's load as it is now. The click hands over one reading;
 * the forklift keeps publishing its cargo, so the open inspector re-reads it.
 * Working if 'Cargo' changes while the panel stays open on a working forklift.
 */
function useLiveForkliftCargo(forklift: ForkliftData | null): ForkliftData['cargo'] | undefined {
  const [live, setLive] = React.useState<{ id: string; cargo: ForkliftData['cargo'] } | null>(null);
  const id = forklift?.id;
  React.useEffect(() => {
    if (!id) return;
    const read = () => {
      const cargo = vehicleTelemetryRegistry.get(id)?.cargo;
      if (cargo)
        setLive((prev) => (prev?.id === id && prev.cargo === cargo ? prev : { id, cargo }));
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [id]);
  return live && live.id === id ? live.cargo : forklift?.cargo;
}

type CrewStatus = 'seated' | 'climbing' | 'away' | 'waiting';
const CREW_STATUS: Record<ForkliftCrewPhase, CrewStatus> = {
  aboard: 'seated',
  'wants-off': 'seated',
  boarding: 'climbing',
  alighting: 'climbing',
  waiting: 'waiting',
  displaced: 'waiting',
  off: 'away',
};

/**
 * Where the selected forklift's anonymous crew operator is, sampled from the
 * crew's live record (a plain object, not a store). An inactive crew means the
 * forklift works as if crewed, so it reads seated.
 * Working if Control follows the operator off on break and back.
 */
function useForkliftCrewStatus(forkliftId: string | undefined): CrewStatus {
  const [status, setStatus] = React.useState<CrewStatus>('seated');
  React.useEffect(() => {
    if (!forkliftId) return;
    const read = () => {
      const entry = forkliftCrewLive(forkliftId);
      const next =
        entry.state && isForkliftCrewActive(entry, performance.now())
          ? CREW_STATUS[entry.state.phase]
          : 'seated';
      setStatus((prev) => (prev === next ? prev : next));
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [forkliftId]);
  return forkliftId ? status : 'seated';
}

const CREW_LABEL = {
  seated: 'controlCrew',
  climbing: 'controlCrewClimbing',
  away: 'controlCrewAway',
  waiting: 'controlCrewWaiting',
} as const;

interface DeferredOperationalUIProps {
  productionSpeed: number;
  setProductionSpeed: (speed: number) => void;
  showZones: boolean;
  setShowZones: (show: boolean) => void;
  selectedMachine: MachineData | null;
  selectedForklift: ForkliftData | null;
  onCloseSelection: () => void;
  onClearForklift: () => void;
  showAIPanel: boolean;
  showSCADAPanel: boolean;
  onAIPanelChange: (show: boolean) => void;
  onSCADAPanelChange: (show: boolean) => void;
  onFocusMachine: (machineId: string) => void;
  isMobile: boolean;
  isCompactLayout: boolean;
  isLandscape: boolean;
  fpsMode: boolean;
  showFpsInstructions: boolean;
  onDismissFpsInstructions: () => void;
  qualityNotification: string | null;
  enableAudioReactive: boolean;
}

/**
 * The complete DOM operations layer is intentionally loaded after the first
 * useful WebGL frame. This keeps SCADA, knowledge, and animation
 * code from delaying the visible factory while preserving the complete UI once
 * the core scene is on screen.
 */
export const DeferredOperationalUI: React.FC<DeferredOperationalUIProps> = ({
  productionSpeed,
  setProductionSpeed,
  showZones,
  setShowZones,
  selectedMachine,
  selectedForklift,
  onCloseSelection,
  onClearForklift,
  showAIPanel,
  showSCADAPanel,
  onAIPanelChange,
  onSCADAPanelChange,
  onFocusMachine,
  isMobile,
  isCompactLayout,
  isLandscape,
  fpsMode,
  showFpsInstructions,
  onDismissFpsInstructions,
  qualityNotification,
  enableAudioReactive,
}) => {
  const t = useT(deferredOperationalUIMessages);
  // The X-key stop's notice, in the language it was raised in, marks the
  // emergency styling; an English literal missed it in pt-BR.
  const tShortcuts = useT(keyboardShortcutsMessages);
  const forkliftCargo = useLiveForkliftCargo(selectedForklift);
  // Forklifts are crewed and a first-person player can board one, so the
  // Control line names who drives it. Working if boarding it reads 'You'.
  const drivenForkliftId = useForkliftDriveStore((state) => state.drivenId);
  const crewStatus = useForkliftCrewStatus(selectedForklift?.id);
  // Close and Escape unmount the card with focus inside it, dropping it to
  // <body>. A forklift is picked in the scene, so there is no opener to return
  // to: the dock takes it. The card is still on the page here (it animates out).
  // Working if Tab continues from the dock after the card closes.
  const forkliftOpen = selectedForklift !== null;
  // A dialog, a phone sheet or a Chronicle decision is what is read: PAUSED
  // drew over a dialog that opened while paused. The notice steps aside at
  // once (no exit animation over the dialog), as the rain badge does; the
  // live region below still announces it.
  const sheetOpen = useMobileControlStore((state) => state.mobilePanelVisible);
  const chronicleDialog = useChronicleStore((state) => state.dialogOpen);
  const modalOpen = useModalDialogOpen(Boolean(qualityNotification));
  const noticeCovered = sheetOpen || chronicleDialog || modalOpen;
  React.useLayoutEffect(() => {
    if (forkliftOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('#forklift-inspector')) focusDockItem();
  }, [forkliftOpen]);
  return (
    <AppMotionConfig>
      {enableAudioReactive && <AudioReactiveProvider />}

      <GameInterface
        productionSpeed={productionSpeed}
        setProductionSpeed={setProductionSpeed}
        showZones={showZones}
        setShowZones={setShowZones}
        selectedMachine={selectedMachine}
        forkliftSelected={selectedForklift !== null}
        onCloseSelection={onCloseSelection}
        showAIPanel={showAIPanel}
        showSCADAPanel={showSCADAPanel}
        onAIPanelChange={onAIPanelChange}
        onSCADAPanelChange={onSCADAPanelChange}
        onFocusMachine={onFocusMachine}
      />

      {isCompactLayout && <MobileControlsOverlay showTouchControls={isMobile} />}

      <AnimatePresence>
        {selectedForklift && (
          <motion.aside
            id="forklift-inspector"
            aria-label={t('forkliftRegion', { id: selectedForklift.id })}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="pointer-events-auto fixed right-4 top-20 z-50 min-w-64 millos-glass millos-glass-thick rounded-lg border-amber-500/30 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-amber-400">{t('forkliftHeading')}</h2>
              <button
                type="button"
                onClick={onClearForklift}
                aria-label={t('closeForklift')}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">{t('idLabel')}</dt>
                <dd className="font-mono text-white">{selectedForklift.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">{t('controlLabel')}</dt>
                <dd className="text-white">
                  {drivenForkliftId === selectedForklift.id
                    ? t('controlPlayer')
                    : t(CREW_LABEL[crewStatus])}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">{t('cargoLabel')}</dt>
                <dd className={forkliftCargo === 'pallet' ? 'text-green-400' : 'text-gray-500'}>
                  {forkliftCargo === 'pallet' ? t('loaded') : t('empty')}
                </dd>
              </div>
            </dl>
          </motion.aside>
        )}
      </AnimatePresence>

      {!fpsMode && <CameraPresetIndicator />}
      <FPSCrosshair touch={isMobile} />
      {isMobile ? (
        <MobileFPSInstructions
          visible={showFpsInstructions && fpsMode}
          onDismiss={onDismissFpsInstructions}
        />
      ) : (
        <FPSInstructions visible={showFpsInstructions && fpsMode} />
      )}

      {/* A live region inserted together with its text is not read, so the
          notice is announced through one that stays on the page; the card
          below is its visual copy. Working if P, Z or Space is announced. */}
      <LiveRegionPortal>
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {qualityNotification ?? ''}
        </div>
      </LiveRegionPortal>
      <AnimatePresence>
        {qualityNotification && (
          <motion.div
            aria-hidden="true"
            data-shortcut-notice=""
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className={`pointer-events-none fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 ${noticeCovered ? 'invisible' : ''}`}
          >
            <div
              className={`rounded-xl border px-6 py-4 text-center shadow-2xl backdrop-blur-xl ${
                qualityNotification === tShortcuts('emergencyStop')
                  ? 'animate-pulse border-red-500 bg-red-900/95 text-red-100'
                  : 'border-slate-600 bg-slate-800/90 text-slate-300'
              }`}
            >
              <div className="text-3xl font-bold uppercase tracking-wider">
                {qualityNotification}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ProductionTargetWidget />
      <EnergyDashboard />
      <MultiObjectiveDashboard />
      <CostEstimationOverlay />
      <WeatherEffectsOverlay />
      <RotateDeviceOverlay visible={isMobile && !isLandscape} />
    </AppMotionConfig>
  );
};

export default DeferredOperationalUI;
