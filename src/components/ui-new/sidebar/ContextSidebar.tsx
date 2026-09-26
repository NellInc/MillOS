import React, { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Thermometer,
  Activity,
  Brain,
  Settings,
  Shield,
  Cpu,
  Factory,
  Info,
  ArrowRight,
} from 'lucide-react';
import { DockMode } from '../dock/Dock';
import { MachineData } from '../../../types';
import { AboutModal } from '../../AboutModal';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';
import { recoverableLazy } from '../../../utils/recoverableLazy';
import { CURRENT_RELEASE_VERSION, SELECTABLE_RELEASES } from '../../../config/releaseVersions';

// Lazy load the heavy panels
const AICommandCenter = recoverableLazy(() =>
  import('../../AICommandCenter').then((m) => ({ default: m.AICommandCenter }))
);
const SCADAPanel = recoverableLazy(() =>
  import('../../SCADAPanel').then((m) => ({ default: m.SCADAPanel }))
);
// New Inspector Components
import { MachineInspector } from './MachineInspector';
import { SettingsPanel } from '../panels/SettingsPanel';
import { SafetyPanel } from '../panels/SafetyPanel';
import { OverviewPanel } from '../panels/OverviewPanel';
import { AutonomyPanel } from '../widgets/AutonomyPanel';

interface ContextSidebarProps {
  mode: DockMode;
  isVisible: boolean;
  onClose: () => void;
  selectedMachine: MachineData | null;
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones?: boolean;
  setShowZones?: (v: boolean) => void;
  onFocusMachine?: (machineId: string) => void;
}

// Panel preloading for smoother transitions
import { preloadPanelsForMode } from './panelPreloader';

export const ContextSidebar: React.FC<ContextSidebarProps> = ({
  mode,
  isVisible,
  onClose,
  selectedMachine,
  productionSpeed,
  setProductionSpeed,
  showZones,
  setShowZones,
  onFocusMachine,
}) => {
  React.useEffect(() => {
    if (!isVisible) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, onClose]);

  // Preload panels related to current mode when it changes
  React.useEffect(() => {
    if (isVisible) {
      preloadPanelsForMode(mode);
    }
  }, [mode, isVisible]);

  const [showAbout, setShowAbout] = React.useState(false);
  // Version switching requires explicit confirmation (WCAG 3.2.2): changing the
  // <select> only stages the choice; the Go button performs the navigation.
  const [pendingVersion, setPendingVersion] = React.useState<string | null>(null);

  const isMachineInspector = selectedMachine !== null && mode !== 'scada';

  // Determine effective content type
  let content = null;
  let headerTitle = 'Inspector';
  let HeaderIcon = Thermometer; // Default concrete icon

  if (mode === 'scada') {
    headerTitle = 'Simulated SCADA';
    HeaderIcon = Activity;
    content = (
      <Suspense fallback={<LoadingPlaceholder />}>
        <SCADAPanel
          isOpen={true}
          onClose={onClose}
          embedded={true}
          selectedMachineId={selectedMachine?.id}
          onFocusMachine={onFocusMachine}
        />
      </Suspense>
    );
  } else if (selectedMachine) {
    headerTitle = selectedMachine.name;
    HeaderIcon = Thermometer;
    content = (
      <MachineInspector
        key={selectedMachine.id}
        machine={selectedMachine}
        onFocusMachine={onFocusMachine}
      />
    );
  } else if (mode === 'ai') {
    headerTitle = 'AI Partner';
    HeaderIcon = Brain;
    content = (
      <Suspense fallback={<LoadingPlaceholder />}>
        <div className="h-full flex flex-col">
          <AICommandCenter isOpen={true} onClose={onClose} embedded={true} />
        </div>
      </Suspense>
    );
  } else if (mode === 'settings') {
    headerTitle = 'System Settings';
    HeaderIcon = Settings;
    content = (
      <SettingsPanel
        productionSpeed={productionSpeed}
        setProductionSpeed={setProductionSpeed}
        showZones={showZones}
        setShowZones={setShowZones}
      />
    );
  } else if (mode === 'safety') {
    headerTitle = 'Safety & Emergency';
    HeaderIcon = Shield;
    content = <SafetyPanel />;
  } else if (mode === 'management') {
    headerTitle = 'Autonomy & Optimization';
    HeaderIcon = Cpu;
    content = <AutonomyPanel />;
  } else {
    // Overview mode - show production overview
    headerTitle = mode === 'production' ? 'Production' : 'Mill Overview';
    HeaderIcon = Factory;
    content = <OverviewPanel />;
  }

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.aside
            id="context-sidebar"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-12 right-0 bottom-0 w-[var(--millos-sidebar-width,min(24rem,42vw))] bg-[#071722]/98 backdrop-blur-xl border-l border-cyan-100/15 shadow-2xl z-40 overflow-hidden flex flex-col pointer-events-auto"
            aria-label={`${headerTitle} sidebar panel`}
            role="complementary"
          >
            {/* Header */}
            <div
              className={`flex items-start justify-between gap-3 ${
                isMachineInspector ? 'px-6 pt-8 pb-2' : 'p-4 border-b border-white/10'
              }`}
            >
              <div className="flex min-w-0 items-start gap-2 text-cyan-300">
                {!isMachineInspector && (
                  <HeaderIcon size={18} className="mt-1 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <h2
                    className={`leading-tight text-slate-100 break-words ${
                      isMachineInspector ? 'text-4xl font-normal' : 'text-xl font-semibold'
                    }`}
                  >
                    {headerTitle}
                  </h2>
                  {selectedMachine && mode !== 'scada' && (
                    <p className="mt-3 text-lg capitalize text-slate-300">
                      {selectedMachine.type.toLowerCase().replaceAll('_', ' ')}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="-m-2 shrink-0 p-3 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
                aria-label="Close sidebar panel"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
              <RecoverableFeatureBoundary
                featureName={headerTitle}
                onDismiss={onClose}
                resetKeys={[mode, selectedMachine?.id]}
              >
                {content}
              </RecoverableFeatureBoundary>
            </div>

            {/* Footer with branding */}
            <div className="p-3 border-t border-white/10 bg-black/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-sm border border-slate-600"
                    aria-hidden="true"
                  >
                    🏭
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white">
                      Mill<span className="text-cyan-300">OS</span>
                    </span>
                    <select
                      className="text-[12px] ml-1 bg-transparent border-none cursor-pointer text-slate-400 hover:text-cyan-300 transition-colors"
                      value={pendingVersion ?? CURRENT_RELEASE_VERSION}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPendingVersion(value === CURRENT_RELEASE_VERSION ? null : value);
                      }}
                      aria-label="Select MillOS version"
                    >
                      {SELECTABLE_RELEASES.map((release) => (
                        <option key={release.version} value={release.version}>
                          {release.displayLabel}
                        </option>
                      ))}
                    </select>
                    {pendingVersion && (
                      <button
                        onClick={() => {
                          window.location.href = `/${pendingVersion}/`;
                        }}
                        className="ml-1 inline-flex items-center gap-0.5 text-[12px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
                        aria-label={`Go to MillOS version ${pendingVersion.slice(1)}`}
                      >
                        Go
                        <ArrowRight size={8} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-cyan-400 italic">Nell Watson</span>
                  <button
                    onClick={() => setShowAbout(true)}
                    className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
                    aria-label="About MillOS"
                  >
                    <Info size={12} aria-hidden="true" />
                    About
                  </button>
                  <a
                    href="https://github.com/NellWatson/MillOS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
                    aria-label="View source code on GitHub"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Source
                  </a>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      {/* Rendered outside the animated aside so the modal's fixed positioning is not
          captured by the aside's transform containing block */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} theme="dark" />
    </>
  );
};

// --- Sub-components ---
const LoadingPlaceholder = () => (
  <div
    className="flex items-center justify-center h-full text-cyan-500 animate-pulse"
    role="status"
    aria-live="polite"
  >
    <Activity size={24} aria-hidden="true" />
    <span className="sr-only">Loading panel content...</span>
  </div>
);
