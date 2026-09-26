import React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
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
}) => (
  <MotionConfig reducedMotion="user">
    {enableAudioReactive && <AudioReactiveProvider />}

    <GameInterface
      productionSpeed={productionSpeed}
      setProductionSpeed={setProductionSpeed}
      showZones={showZones}
      setShowZones={setShowZones}
      selectedMachine={selectedMachine}
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
          aria-label={`Forklift ${selectedForklift.id}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="pointer-events-auto fixed right-4 top-20 z-50 min-w-64 rounded-lg border border-amber-500/30 bg-gray-900/95 p-4 shadow-xl backdrop-blur-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-amber-400">Forklift</h2>
            <button
              type="button"
              onClick={onClearForklift}
              aria-label="Close forklift details"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-400">ID</dt>
              <dd className="font-mono text-white">{selectedForklift.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-400">Control</dt>
              <dd className="text-white">Autonomous</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-400">Cargo</dt>
              <dd
                className={selectedForklift.cargo === 'pallet' ? 'text-green-400' : 'text-gray-500'}
              >
                {selectedForklift.cargo === 'pallet' ? 'Loaded' : 'Empty'}
              </dd>
            </div>
          </dl>
        </motion.aside>
      )}
    </AnimatePresence>

    {!fpsMode && <CameraPresetIndicator />}
    <FPSCrosshair />
    {isMobile ? (
      <MobileFPSInstructions
        visible={showFpsInstructions && fpsMode}
        onDismiss={onDismissFpsInstructions}
      />
    ) : (
      <FPSInstructions visible={showFpsInstructions && fpsMode} />
    )}

    <AnimatePresence>
      {qualityNotification && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          className="pointer-events-none fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2"
        >
          <div
            className={`rounded-xl border px-6 py-4 text-center shadow-2xl backdrop-blur-xl ${
              qualityNotification === 'EMERGENCY STOP'
                ? 'animate-pulse border-red-500 bg-red-900/95 text-red-100'
                : 'border-slate-600 bg-slate-800/90 text-slate-300'
            }`}
          >
            <div className="text-3xl font-bold uppercase tracking-wider">{qualityNotification}</div>
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
  </MotionConfig>
);

export default DeferredOperationalUI;
