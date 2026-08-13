import React, { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Thermometer,
  Activity,
  Brain,
  User,
  Users,
  HardHat,
  Settings,
  Shield,
  Heart,
  Factory,
  Info,
  ArrowRight,
} from 'lucide-react';
import type { DockMode } from '../dock/types';
import { MachineData, WorkerData } from '../../../types';
import { AboutModal } from '../../AboutModal';
import pkg from '../../../../package.json';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';
import { recoverableLazy } from '../../../utils/recoverableLazy';

// "0.40.0" -> "v0.40" (matches the versioned deployment base paths)
const CURRENT_VERSION = `v${pkg.version.split('.').slice(0, 2).join('.')}`;

// Lazy load the heavy panels
const AICommandCenter = recoverableLazy(() =>
  import('../../AICommandCenter').then((m) => ({ default: m.AICommandCenter }))
);
const SCADAPanel = recoverableLazy(() =>
  import('../../SCADAPanel').then((m) => ({ default: m.SCADAPanel }))
);
const WorkerDetailPanel = recoverableLazy(() =>
  import('../../WorkerDetailPanel').then((m) => ({ default: m.WorkerDetailPanel }))
);

// New Inspector Components
import { MachineInspector } from './MachineInspector';
import { SettingsPanel } from '../panels/SettingsPanel';
import { SafetyPanel } from '../panels/SafetyPanel';
import { OverviewPanel } from '../panels/OverviewPanel';
import { WorkforcePanel } from '../panels/WorkforcePanel';

// MultiplayerPanel lazy-loaded to keep peerjs/WebRTC out of the boot chunk
const MultiplayerPanel = recoverableLazy(() =>
  import('../panels/MultiplayerPanel').then((m) => ({ default: m.MultiplayerPanel }))
);

// Core BAS controls (kept static - frequently used, small)
import { FiveAxesPanel } from '../widgets/FiveAxesPanel';
import { ValueDashboard } from '../widgets/ValueDashboard';

// Lazy load heavy BAS panels for bundle optimization
const StabilityMonitor = recoverableLazy(() =>
  import('../widgets/StabilityMonitor').then((m) => ({ default: m.StabilityMonitor }))
);
const BASTimeline = recoverableLazy(() =>
  import('../widgets/BASTimeline').then((m) => ({ default: m.BASTimeline }))
);
const ScenarioPlayground = recoverableLazy(() =>
  import('../widgets/ScenarioPlayground').then((m) => ({ default: m.ScenarioPlayground }))
);
const EngagementSignaturePanel = recoverableLazy(() =>
  import('../widgets/EngagementSignaturePanel').then((m) => ({
    default: m.EngagementSignaturePanel,
  }))
);
const FlourishingDashboard = recoverableLazy(() =>
  import('../widgets/FlourishingDashboard').then((m) => ({ default: m.FlourishingDashboard }))
);
const OwnershipPanel = recoverableLazy(() =>
  import('../widgets/OwnershipPanel').then((m) => ({ default: m.OwnershipPanel }))
);
const VotingPanel = recoverableLazy(() =>
  import('../widgets/VotingPanel').then((m) => ({ default: m.VotingPanel }))
);
const FederationPanel = recoverableLazy(() =>
  import('../widgets/FederationPanel').then((m) => ({ default: m.FederationPanel }))
);
const AIWelfarePanel = recoverableLazy(() =>
  import('../widgets/AIWelfarePanel').then((m) => ({ default: m.AIWelfarePanel }))
);
const SocialMissionPanel = recoverableLazy(() =>
  import('../widgets/SocialMissionPanel').then((m) => ({ default: m.SocialMissionPanel }))
);
const BASEducation = recoverableLazy(() =>
  import('../widgets/BASEducation').then((m) => ({ default: m.BASEducation }))
);
const VCPStatusPanel = recoverableLazy(() =>
  import('../widgets/VCPStatusPanel').then((m) => ({ default: m.VCPStatusPanel }))
);

interface ContextSidebarProps {
  mode: DockMode;
  isVisible: boolean;
  onClose: () => void;
  selectedMachine: MachineData | null;
  selectedWorker: WorkerData | null;
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
  selectedWorker,
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
    content = <MachineInspector machine={selectedMachine} />;
  } else if (selectedWorker) {
    headerTitle = selectedWorker.name;
    HeaderIcon = User;
    content = (
      <Suspense fallback={<LoadingPlaceholder />}>
        <div className="h-full overflow-y-auto">
          <WorkerDetailPanel worker={selectedWorker} onClose={onClose} embedded={true} />
        </div>
      </Suspense>
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
  } else if (mode === 'multiplayer') {
    headerTitle = 'Multiplayer';
    HeaderIcon = Users;
    content = (
      <Suspense fallback={<LoadingPlaceholder />}>
        <MultiplayerPanel />
      </Suspense>
    );
  } else if (mode === 'management') {
    headerTitle = 'Bilateral Autonomy';
    HeaderIcon = Heart;
    content = (
      <div className="p-3 h-full overflow-y-auto space-y-4">
        {/* Core BAS Controls (static - always loaded) */}
        <FiveAxesPanel />
        <ValueDashboard />

        {/* Lazy-loaded panels with compact fallbacks */}
        <RecoverablePanel featureName="Stability monitor">
          <StabilityMonitor />
        </RecoverablePanel>

        {/* VCP 2.0 - Value Coordination Protocol */}
        <RecoverablePanel featureName="VCP status">
          <VCPStatusPanel />
        </RecoverablePanel>

        {/* Timeline & History */}
        <RecoverablePanel featureName="BAS timeline">
          <BASTimeline />
        </RecoverablePanel>

        {/* Interactive Scenarios */}
        <RecoverablePanel featureName="Scenario playground">
          <ScenarioPlayground />
        </RecoverablePanel>

        {/* Engagement & Flourishing */}
        <RecoverablePanel featureName="Engagement signature">
          <EngagementSignaturePanel />
        </RecoverablePanel>
        <RecoverablePanel featureName="Flourishing dashboard">
          <FlourishingDashboard />
        </RecoverablePanel>

        {/* Economic Democracy */}
        <RecoverablePanel featureName="Ownership">
          <OwnershipPanel />
        </RecoverablePanel>
        <RecoverablePanel featureName="Voting">
          <VotingPanel />
        </RecoverablePanel>
        <RecoverablePanel featureName="Federation">
          <FederationPanel />
        </RecoverablePanel>

        {/* Bilateral Completeness */}
        <RecoverablePanel featureName="Becoming Mind welfare">
          <AIWelfarePanel />
        </RecoverablePanel>
        <RecoverablePanel featureName="Social mission">
          <SocialMissionPanel />
        </RecoverablePanel>

        {/* Educational Content */}
        <RecoverablePanel featureName="BAS education">
          <BASEducation />
        </RecoverablePanel>
      </div>
    );
  } else if (mode === 'workforce') {
    // Workforce mode - show all workers with stats
    headerTitle = 'Workforce';
    HeaderIcon = HardHat;
    content = <WorkforcePanel />;
  } else {
    // Overview mode - show production overview
    headerTitle = 'Mill Overview';
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
            className="fixed top-4 right-4 bottom-24 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-40 overflow-hidden flex flex-col pointer-events-auto"
            aria-label={`${headerTitle} sidebar panel`}
            role="complementary"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2 text-cyan-400">
                <HeaderIcon size={18} aria-hidden="true" />
                <h2 className="font-bold tracking-wide text-sm uppercase">{headerTitle}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
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
                resetKeys={[mode, selectedMachine?.id, selectedWorker?.id]}
              >
                {content}
              </RecoverableFeatureBoundary>
            </div>

            {/* Footer with branding */}
            <div className="p-3 border-t border-white/10 bg-slate-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-sm border border-slate-600"
                    aria-hidden="true"
                  >
                    🏭
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white">
                      Mill<span className="text-orange-500">OS</span>
                    </span>
                    <select
                      className="text-[9px] ml-1 bg-transparent border-none cursor-pointer text-slate-400 hover:text-orange-400 transition-colors"
                      value={pendingVersion ?? CURRENT_VERSION}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPendingVersion(value === CURRENT_VERSION ? null : value);
                      }}
                      aria-label="Select MillOS version"
                    >
                      <option value={CURRENT_VERSION}>{CURRENT_VERSION.slice(1)}</option>
                      <option value="v0.20">0.20</option>
                      <option value="v0.10">0.10</option>
                    </select>
                    {pendingVersion && (
                      <button
                        onClick={() => {
                          window.location.href = `/${pendingVersion}/`;
                        }}
                        className="ml-1 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                        aria-label={`Switch to MillOS version ${pendingVersion.slice(1)}`}
                      >
                        Go
                        <ArrowRight size={8} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[9px]">
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

// Compact loader for lazy-loaded BAS panels
const PanelLoader = () => (
  <div
    className="h-20 bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center border border-slate-700/30"
    role="status"
  >
    <Activity className="w-4 h-4 text-cyan-500/50" aria-hidden="true" />
    <span className="sr-only">Loading...</span>
  </div>
);

const RecoverablePanel = ({
  featureName,
  children,
}: {
  featureName: string;
  children: React.ReactNode;
}) => (
  <RecoverableFeatureBoundary featureName={featureName}>
    <Suspense fallback={<PanelLoader />}>{children}</Suspense>
  </RecoverableFeatureBoundary>
);
