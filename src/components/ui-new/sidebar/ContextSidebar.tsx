import React, { Suspense, lazy } from 'react';
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
} from 'lucide-react';
import { DockMode } from '../dock/Dock';
import { MachineData, WorkerData } from '../../../types';

// Lazy load the heavy panels
const AICommandCenter = lazy(() =>
  import('../../AICommandCenter').then((m) => ({ default: m.AICommandCenter }))
);
const SCADAPanel = lazy(() => import('../../SCADAPanel').then((m) => ({ default: m.SCADAPanel })));
const WorkerDetailPanel = lazy(() =>
  import('../../WorkerDetailPanel').then((m) => ({ default: m.WorkerDetailPanel }))
);

// New Inspector Components
import { MachineInspector } from './MachineInspector';
import { SettingsPanel } from '../panels/SettingsPanel';
import { SafetyPanel } from '../panels/SafetyPanel';
import { OverviewPanel } from '../panels/OverviewPanel';
import { MultiplayerPanel } from '../panels/MultiplayerPanel';
import { WorkforcePanel } from '../panels/WorkforcePanel';

// Core BAS controls (kept static - frequently used, small)
import { FiveAxesPanel } from '../widgets/FiveAxesPanel';
import { ValueDashboard } from '../widgets/ValueDashboard';

// Lazy load heavy BAS panels for bundle optimization
const StabilityMonitor = lazy(() =>
  import('../widgets/StabilityMonitor').then((m) => ({ default: m.StabilityMonitor }))
);
const BASTimeline = lazy(() =>
  import('../widgets/BASTimeline').then((m) => ({ default: m.BASTimeline }))
);
const ScenarioPlayground = lazy(() =>
  import('../widgets/ScenarioPlayground').then((m) => ({ default: m.ScenarioPlayground }))
);
const EngagementSignaturePanel = lazy(() =>
  import('../widgets/EngagementSignaturePanel').then((m) => ({
    default: m.EngagementSignaturePanel,
  }))
);
const FlourishingDashboard = lazy(() =>
  import('../widgets/FlourishingDashboard').then((m) => ({ default: m.FlourishingDashboard }))
);
const OwnershipPanel = lazy(() =>
  import('../widgets/OwnershipPanel').then((m) => ({ default: m.OwnershipPanel }))
);
const VotingPanel = lazy(() =>
  import('../widgets/VotingPanel').then((m) => ({ default: m.VotingPanel }))
);
const FederationPanel = lazy(() =>
  import('../widgets/FederationPanel').then((m) => ({ default: m.FederationPanel }))
);
const AIWelfarePanel = lazy(() =>
  import('../widgets/AIWelfarePanel').then((m) => ({ default: m.AIWelfarePanel }))
);
const SocialMissionPanel = lazy(() =>
  import('../widgets/SocialMissionPanel').then((m) => ({ default: m.SocialMissionPanel }))
);
const BASEducation = lazy(() =>
  import('../widgets/BASEducation').then((m) => ({ default: m.BASEducation }))
);
const VCPStatusPanel = lazy(() =>
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
}) => {
  // Preload panels related to current mode when it changes
  React.useEffect(() => {
    if (isVisible) {
      preloadPanelsForMode(mode);
    }
  }, [mode, isVisible]);

  // Determine effective content type
  let content = null;
  let headerTitle = 'Inspector';
  let HeaderIcon = Thermometer; // Default concrete icon

  if (selectedMachine) {
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
    headerTitle = 'AI Command Center';
    HeaderIcon = Brain;
    content = (
      <Suspense fallback={<LoadingPlaceholder />}>
        <div className="h-full flex flex-col">
          <AICommandCenter isOpen={true} onClose={onClose} embedded={true} />
        </div>
      </Suspense>
    );
  } else if (mode === 'scada') {
    headerTitle = 'SCADA Monitor';
    HeaderIcon = Activity;
    content = (
      <Suspense fallback={<LoadingPlaceholder />}>
        <SCADAPanel isOpen={true} onClose={onClose} embedded={true} />
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
    content = <MultiplayerPanel />;
  } else if (mode === 'management') {
    headerTitle = 'Bilateral Autonomy';
    HeaderIcon = Heart;
    content = (
      <div className="p-3 h-full overflow-y-auto space-y-4">
        {/* Core BAS Controls (static - always loaded) */}
        <FiveAxesPanel />
        <ValueDashboard />

        {/* Lazy-loaded panels with compact fallbacks */}
        <Suspense fallback={<PanelLoader />}>
          <StabilityMonitor />
        </Suspense>

        {/* VCP 2.0 - Value Coordination Protocol */}
        <Suspense fallback={<PanelLoader />}>
          <VCPStatusPanel />
        </Suspense>

        {/* Timeline & History */}
        <Suspense fallback={<PanelLoader />}>
          <BASTimeline />
        </Suspense>

        {/* Interactive Scenarios */}
        <Suspense fallback={<PanelLoader />}>
          <ScenarioPlayground />
        </Suspense>

        {/* Engagement & Flourishing */}
        <Suspense fallback={<PanelLoader />}>
          <EngagementSignaturePanel />
        </Suspense>
        <Suspense fallback={<PanelLoader />}>
          <FlourishingDashboard />
        </Suspense>

        {/* Economic Democracy */}
        <Suspense fallback={<PanelLoader />}>
          <OwnershipPanel />
        </Suspense>
        <Suspense fallback={<PanelLoader />}>
          <VotingPanel />
        </Suspense>
        <Suspense fallback={<PanelLoader />}>
          <FederationPanel />
        </Suspense>

        {/* Bilateral Completeness */}
        <Suspense fallback={<PanelLoader />}>
          <AIWelfarePanel />
        </Suspense>
        <Suspense fallback={<PanelLoader />}>
          <SocialMissionPanel />
        </Suspense>

        {/* Educational Content */}
        <Suspense fallback={<PanelLoader />}>
          <BASEducation />
        </Suspense>
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
    <AnimatePresence>
      {isVisible && (
        <motion.aside
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
          <div className="flex-1 overflow-hidden relative">{content}</div>

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
                    value="v0.3"
                    onChange={(e) => {
                      window.location.href = `/${e.target.value}/`;
                    }}
                    aria-label="Select MillOS version"
                  >
                    <option value="v0.30">0.30</option>
                    <option value="v0.20">0.20</option>
                    <option value="v0.10">0.10</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-cyan-400 italic">Nell Watson</span>
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
