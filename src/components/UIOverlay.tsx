import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Sun,
  Shield,
  ChevronDown,
  ChevronUp,
  Activity,
  Settings,
  Monitor,
  Sparkles,
  Wind,
  Eye,
  Layers,
  RotateCcw,
  Gauge,
  Keyboard,
  HelpCircle,
  PanelLeftClose,
  PanelLeft,
  GripVertical,
  Music,
  SkipBack,
  SkipForward,
  Info,
  Volume2,
  Pause,
  Play,
  FastForward,
  Trophy,
  TrendingUp,
  History,
  Map,
  Image,
  Download,
  X,
} from 'lucide-react';
import { MachineData } from '../types';
import { GraphicsQuality, GraphicsSettings } from '../stores/graphicsStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useProductionStore } from '../stores/productionStore';
import { useUIStore } from '../stores/uiStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { FPSDisplay } from './FPSMonitor';
import { SafetyScoreBadge } from './EmergencyOverlay';
import { AboutModal } from './AboutModal';
import {
  PAAnnouncementSystem,
  ProductionTargetsWidget,
  MiniMap,
  IncidentReplayControls,
  AchievementsPanel,
  WorkerLeaderboard,
} from './GameFeatures';
import { useHistoricalPlaybackStore } from '../stores/historicalPlaybackStore';

// Import extracted UI components
import { MillClockDisplay } from './ui/MillClockDisplay';
import { SafetyMetricsDisplay } from './ui/SafetyMetricsDisplay';
import { EmergencyStopButton } from './ui/EmergencyStopButton';
import { IncidentHistoryPanel } from './ui/IncidentHistoryPanel';
import { SafetyAnalyticsPanel } from './ui/SafetyAnalyticsPanel';
import { ZoneCustomizationPanel } from './ui/ZoneCustomizationPanel';
import { SafetyConfigPanel } from './ui/SafetyConfigPanel';
import { KeyboardShortcutsModal } from './ui/KeyboardShortcutsModal';
import { MultiplayerLobby } from './multiplayer';
import { TruckScheduleWidget } from './ui/TruckScheduleWidget';
import { PredictiveMaintenancePanel } from './ui/PredictiveMaintenancePanel';
import { FiveAxesPanel } from './ui-new/widgets/FiveAxesPanel';

// Lazy load ProductionMetrics to reduce initial bundle (Recharts is ~403KB)
const ProductionMetrics = lazy(() =>
  import('./ProductionMetrics')
    .then((module) => ({ default: module.ProductionMetrics }))
    .catch(() => {
      return {
        default: () => (
          <div className="text-red-400 text-xs p-2 bg-red-900/20 rounded border border-red-500/30">
            Failed to load metrics
          </div>
        ),
      };
    })
);

// Import optimized audio hook (uses useSyncExternalStore instead of forceUpdate)
// This replaces the old pattern that created new objects on every audio event
import { useAudioStateWithControls } from '../hooks/useAudioState';

// Re-export for local usage - now uses optimized implementation
const useAudioState = useAudioStateWithControls;

// Emergency & Environment Controls Panel
const EmergencyEnvironmentPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0); // Force re-render for timer

  const {
    emergencyActive,
    emergencyDrillMode,
    drillMetrics,
    startEmergencyDrill,
    endEmergencyDrill,
    shiftChangeActive,
    currentShift,
    triggerShiftChange,
    weather,
    setWeather,
  } = useGameSimulationStore(
    useShallow((state) => ({
      emergencyActive: state.emergencyActive,
      emergencyDrillMode: state.emergencyDrillMode,
      drillMetrics: state.drillMetrics,
      startEmergencyDrill: state.startEmergencyDrill,
      endEmergencyDrill: state.endEmergencyDrill,
      shiftChangeActive: state.shiftChangeActive,
      currentShift: state.currentShift,
      triggerShiftChange: state.triggerShiftChange,
      weather: state.weather,
      setWeather: state.setWeather,
    }))
  );

  const { showHeatMap, setShowHeatMap, clearHeatMap, workerCount } = useProductionStore(
    useShallow((state) => ({
      showHeatMap: state.showHeatMap,
      setShowHeatMap: state.setShowHeatMap,
      clearHeatMap: state.clearHeatMap,
      workerCount: state.workers.length,
    }))
  );

  // Auto-update timer during drill
  useEffect(() => {
    if (!emergencyDrillMode || !drillMetrics.active || drillMetrics.evacuationComplete) return;
    const interval = setInterval(() => setTick((t) => t + 1), 100); // Update every 100ms
    return () => clearInterval(interval);
  }, [emergencyDrillMode, drillMetrics.active, drillMetrics.evacuationComplete]);

  const weatherOptions: Array<{
    value: 'clear' | 'cloudy' | 'rain' | 'storm';
    label: string;
    icon: string;
  }> = [
    { value: 'clear', label: 'Clear', icon: 'sun' },
    { value: 'cloudy', label: 'Cloudy', icon: 'cloud' },
    { value: 'rain', label: 'Rain', icon: 'rain' },
    { value: 'storm', label: 'Storm', icon: 'bolt' },
  ];

  return (
    <div className="border-t border-slate-700/50 pt-2 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        aria-expanded={expanded}
        aria-controls="emergency-environment-panel"
        className="w-full flex items-center justify-between text-xs font-medium text-slate-300 hover:text-white transition-colors py-1"
      >
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-400" aria-hidden="true" />
          Emergency & Environment
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="emergency-environment-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Emergency Drill Button */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                Emergency Drill
              </div>
              <button
                onClick={() =>
                  emergencyDrillMode ? endEmergencyDrill() : startEmergencyDrill(workerCount)
                }
                className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  emergencyDrillMode
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : emergencyActive
                      ? 'bg-orange-600 text-white cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
                disabled={emergencyActive && !emergencyDrillMode}
              >
                {emergencyDrillMode
                  ? 'END DRILL'
                  : emergencyActive
                    ? 'EMERGENCY ACTIVE'
                    : 'START DRILL'}
              </button>
              <p className="text-[9px] text-slate-500 mt-1">
                {emergencyDrillMode
                  ? 'Workers responding to drill...'
                  : 'Test emergency response procedures'}
              </p>

              {/* Evacuation Progress - shown during active drill */}
              {emergencyDrillMode && drillMetrics.active && (
                <div className="mt-3 bg-slate-900/50 rounded-lg p-2 border border-red-500/30">
                  {/* Timer */}
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-slate-400">Evacuation Time</span>
                    <span className="text-sm font-mono text-red-400">
                      {drillMetrics.finalTimeSeconds !== null
                        ? `${drillMetrics.finalTimeSeconds.toFixed(1)}s`
                        : `${((Date.now() - drillMetrics.startTime) / 1000).toFixed(1)}s`}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[9px] text-slate-500 mb-1">
                      <span>Evacuated</span>
                      <span>
                        {drillMetrics.evacuatedWorkerIds.length}/{drillMetrics.totalWorkers}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{
                          width: `${drillMetrics.totalWorkers > 0 ? (drillMetrics.evacuatedWorkerIds.length / drillMetrics.totalWorkers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* All Clear indicator */}
                  {drillMetrics.evacuationComplete && (
                    <div className="flex items-center justify-center gap-2 py-1 bg-green-600/20 rounded border border-green-500/50">
                      <span className="text-green-400 font-bold text-xs">ALL CLEAR</span>
                      <span className="text-green-300 text-[10px]">
                        {drillMetrics.finalTimeSeconds?.toFixed(1)}s
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shift Change Button */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                Shift Change
                <span className="ml-2 text-blue-400 capitalize">({currentShift})</span>
              </div>
              <button
                onClick={() => triggerShiftChange()}
                className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  shiftChangeActive
                    ? 'bg-blue-600 text-white animate-pulse cursor-not-allowed'
                    : emergencyActive
                      ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
                disabled={shiftChangeActive || emergencyActive}
              >
                {shiftChangeActive ? 'SHIFT CHANGE IN PROGRESS...' : 'TRIGGER SHIFT CHANGE'}
              </button>
              <p className="text-[9px] text-slate-500 mt-1">
                {shiftChangeActive
                  ? 'Workers leaving and new shift arriving...'
                  : 'Workers will leave and return refreshed'}
              </p>
            </div>

            {/* Weather Control */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                Weather
              </div>
              <div className="grid grid-cols-4 gap-1">
                {weatherOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setWeather(opt.value)}
                    className={`py-1.5 px-2 rounded text-[10px] font-medium transition-all ${
                      weather === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Heat Map Toggle */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Worker Heat Map
                  </div>
                  <p className="text-[9px] text-slate-500">Shows high-traffic areas</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowHeatMap(!showHeatMap)}
                    className={`py-1 px-3 rounded text-[10px] font-medium transition-all ${
                      showHeatMap
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {showHeatMap ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => clearHeatMap()}
                    className="py-1 px-2 rounded text-[10px] font-medium bg-slate-700 text-slate-300 hover:bg-slate-600"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Graphics Options Panel Component
const GraphicsOptionsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  // Consolidated store subscription - only re-renders when graphics settings change
  const { graphics, setGraphicsQuality, setGraphicsSetting } = useGraphicsStore(
    useShallow((state) => ({
      graphics: state.graphics,
      setGraphicsQuality: state.setGraphicsQuality,
      setGraphicsSetting: state.setGraphicsSetting,
    }))
  );
  const theme = useUIStore((state) => state.theme);
  const showFPSCounter = useUIStore((state) => state.showFPSCounter);
  const toggleFPSCounter = useUIStore((state) => state.toggleFPSCounter);
  const clearPersistedState = useGameSimulationStore((state) => state.clearPersistedState);

  const qualityColors: Record<GraphicsQuality, string> = {
    low: 'text-slate-400',
    medium: 'text-yellow-400',
    high: 'text-cyan-400',
    ultra: 'text-purple-400',
  };

  const toggleSettings: Array<{
    key: keyof GraphicsSettings;
    label: string;
    icon: React.ReactNode;
    category: string;
  }> = [
    // Post-processing
    {
      key: 'enableSSAO',
      label: 'Ambient Occlusion',
      icon: <Eye className="w-3 h-3" />,
      category: 'Post-Processing',
    },
    {
      key: 'enableBloom',
      label: 'Bloom Glow',
      icon: <Sparkles className="w-3 h-3" />,
      category: 'Post-Processing',
    },
    {
      key: 'enableVignette',
      label: 'Vignette',
      icon: <Monitor className="w-3 h-3" />,
      category: 'Post-Processing',
    },
    {
      key: 'enableChromaticAberration',
      label: 'Chromatic Aberration',
      icon: <Layers className="w-3 h-3" />,
      category: 'Post-Processing',
    },
    {
      key: 'enableFilmGrain',
      label: 'Film Grain',
      icon: <Wind className="w-3 h-3" />,
      category: 'Post-Processing',
    },
    // Scene effects
    {
      key: 'enableDustParticles',
      label: 'Dust Particles',
      icon: <Wind className="w-3 h-3" />,
      category: 'Particles',
    },
    {
      key: 'enableGrainFlow',
      label: 'Grain Flow',
      icon: <Wind className="w-3 h-3" />,
      category: 'Particles',
    },
    {
      key: 'enableAtmosphericHaze',
      label: 'Atmospheric Haze',
      icon: <Wind className="w-3 h-3" />,
      category: 'Particles',
    },
    // Machine enhancements
    {
      key: 'enableMachineVibration',
      label: 'Machine Vibration',
      icon: <Activity className="w-3 h-3" />,
      category: 'Machines',
    },
    {
      key: 'enableProceduralTextures',
      label: 'Detailed Textures',
      icon: <Layers className="w-3 h-3" />,
      category: 'Machines',
    },
    {
      key: 'enableWeathering',
      label: 'Weathering Effects',
      icon: <Wind className="w-3 h-3" />,
      category: 'Machines',
    },
    // Lighting & Shadows
    {
      key: 'enableLightShafts',
      label: 'Light Shafts',
      icon: <Sun className="w-3 h-3" />,
      category: 'Lighting',
    },
    {
      key: 'enableContactShadows',
      label: 'Contact Shadows',
      icon: <Layers className="w-3 h-3" />,
      category: 'Lighting',
    },
    {
      key: 'enableHighResShadows',
      label: 'High-Res Shadows',
      icon: <Eye className="w-3 h-3" />,
      category: 'Lighting',
    },
  ];

  // Group settings by category
  const categories = ['Post-Processing', 'Particles', 'Machines', 'Lighting'];

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        aria-expanded={expanded}
        aria-controls="graphics-options-panel"
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-purple-400" aria-hidden="true" />
          Graphics Quality
          <span className={`text-[10px] font-bold uppercase ${qualityColors[graphics.quality]}`}>
            {graphics.quality}
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="graphics-options-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Quality Presets */}
            <div className="flex gap-1">
              {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((quality) => (
                <button
                  key={quality}
                  onClick={() => setGraphicsQuality(quality)}
                  className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                    graphics.quality === quality
                      ? quality === 'low'
                        ? 'bg-slate-600 text-white'
                        : quality === 'medium'
                          ? 'bg-yellow-600 text-white'
                          : quality === 'high'
                            ? 'bg-cyan-600 text-white'
                            : 'bg-purple-600 text-white'
                      : theme === 'light'
                        ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {quality}
                </button>
              ))}
            </div>

            {/* Detailed Settings by Category */}
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {categories.map((category) => (
                <div key={category}>
                  <div
                    className={`text-[9px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    {category}
                  </div>
                  <div className="space-y-0.5">
                    {toggleSettings
                      .filter((s) => s.category === category)
                      .map(({ key, label, icon }) => (
                        <button
                          key={key}
                          onClick={() =>
                            setGraphicsSetting(key, !graphics[key as keyof typeof graphics])
                          }
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-all ${
                            graphics[key as keyof typeof graphics]
                              ? theme === 'light'
                                ? 'bg-slate-200 text-slate-800'
                                : 'bg-slate-700/50 text-white'
                              : theme === 'light'
                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                : 'bg-slate-800/30 text-slate-500 hover:bg-slate-800/50'
                          }`}
                        >
                          <span
                            className={
                              graphics[key as keyof typeof graphics]
                                ? 'text-green-500'
                                : theme === 'light'
                                  ? 'text-slate-400'
                                  : 'text-slate-600'
                            }
                          >
                            {icon}
                          </span>
                          <span className="flex-1 text-left">{label}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              graphics[key]
                                ? 'bg-green-500'
                                : theme === 'light'
                                  ? 'bg-slate-300'
                                  : 'bg-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Particle Count Slider */}
            <div
              className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}
            >
              <div className="flex justify-between text-xs mb-1">
                <span
                  className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  <Wind className="w-3 h-3" />
                  Particle Count
                </span>
                <span className="text-cyan-500 font-mono font-bold">
                  {graphics.dustParticleCount}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="25"
                value={graphics.dustParticleCount}
                onChange={(e) => setGraphicsSetting('dustParticleCount', parseInt(e.target.value))}
                disabled={!graphics.enableDustParticles}
                aria-label="Dust particle count"
                aria-valuemin={0}
                aria-valuemax={500}
                aria-valuenow={graphics.dustParticleCount}
                aria-valuetext={`${graphics.dustParticleCount} particles`}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                } ${!graphics.enableDustParticles ? 'opacity-50' : ''}`}
              />
              <div
                className={`flex justify-between text-[9px] mt-0.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}
              >
                <span>0</span>
                <span>250</span>
                <span>500</span>
              </div>
            </div>

            {/* FPS Monitor */}
            <div
              className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5 text-green-500" />
                  <span
                    className={`text-[9px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Performance
                  </span>
                </div>
                <button
                  onClick={() => toggleFPSCounter()}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                    showFPSCounter
                      ? 'bg-green-600 text-white'
                      : theme === 'light'
                        ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                  title="Toggle FPS counter overlay"
                >
                  {showFPSCounter ? 'OVERLAY ON' : 'OVERLAY OFF'}
                </button>
              </div>
              <FPSDisplay showDetailed={true} />
            </div>

            {/* Keyboard Shortcuts */}
            <div
              className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Keyboard className="w-3.5 h-3.5 text-blue-500" />
                <span
                  className={`text-[9px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  Shortcuts
                </span>
              </div>
              {/* Graphics Quality */}
              <div
                className={`text-[8px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}
              >
                Quality
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] mb-2">
                <div
                  className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    F1
                  </kbd>
                </div>
                <div
                  className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/50 text-yellow-300'}`}
                  >
                    F2
                  </kbd>
                </div>
                <div
                  className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-900/50 text-cyan-300'}`}
                  >
                    F3
                  </kbd>
                </div>
                <div
                  className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/50 text-purple-300'}`}
                  >
                    F4
                  </kbd>
                </div>
              </div>
              {/* Controls */}
              <div
                className={`text-[8px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}
              >
                Controls
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    P
                  </kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                    Pause
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    A
                  </kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                    AI Panel
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    Z
                  </kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                    Zones
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    H
                  </kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                    Heatmap
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    +/-
                  </kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                    Speed
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
                >
                  <kbd
                    className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}
                  >
                    ESC
                  </kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                    Close
                  </span>
                </div>
              </div>
            </div>

            {/* Performance Info */}
            <div
              className={`text-[9px] pt-1 border-t ${theme === 'light' ? 'border-slate-200 text-slate-400' : 'border-slate-800 text-slate-500'}`}
            >
              <p>
                <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                  Low:
                </span>{' '}
                Best for older devices
              </p>
              <p>
                <span className="text-yellow-500">Medium:</span> Balanced performance
              </p>
              <p>
                <span className="text-cyan-500">High:</span> Enhanced visuals
              </p>
              <p>
                <span className="text-purple-500">Ultra:</span> Maximum quality
              </p>
            </div>

            {/* Simulation Reset Section */}
            <div
              className={`border-t pt-3 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span
                  className={`text-[9px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  Simulation
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={clearPersistedState}
                  className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${
                    theme === 'light'
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-amber-900/50 text-amber-300 hover:bg-amber-800/50'
                  }`}
                >
                  Reset to 10am
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('millos-settings');
                    localStorage.removeItem('millos-game-simulation');
                    setGraphicsQuality('medium');
                    window.location.reload();
                  }}
                  className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${
                    theme === 'light'
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-red-900/50 text-red-300 hover:bg-red-800/50'
                  }`}
                >
                  Reset Simulation
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Predictive Maintenance Collapsible Panel
const PredictiveMaintenanceCollapsible: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const theme = useUIStore((state) => state.theme);

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        aria-expanded={expanded}
        aria-controls="predictive-maintenance-panel"
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" aria-hidden="true" />
          Predictive Maintenance
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="predictive-maintenance-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-2 overflow-hidden"
          >
            <PredictiveMaintenancePanel />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Collapsible Legend Component (Draggable)
const CollapsibleLegend: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const { legendPosition, setLegendPosition, theme, showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      legendPosition: state.legendPosition,
      setLegendPosition: state.setLegendPosition,
      theme: state.theme,
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const achievements = useProductionStore((state) => state.achievements);
  const isReplaying = useHistoricalPlaybackStore((state) => state.isReplaying);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  // Handle mouse down on grip
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      const rect = dragRef.current?.getBoundingClientRect();
      if (rect) {
        elementStartPos.current = {
          x:
            legendPosition.x === -1
              ? window.innerWidth - rect.right + rect.width
              : legendPosition.x,
          y: legendPosition.y === -1 ? rect.top : legendPosition.y,
        };
      }
    },
    [legendPosition]
  );

  // Handle mouse move while dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      const newX = elementStartPos.current.x - deltaX;
      const newY = elementStartPos.current.y + deltaY;

      // Constrain to viewport
      const maxX = window.innerWidth - 50;
      const maxY = window.innerHeight - 50;
      setLegendPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setLegendPosition]);

  // Calculate position style
  const positionStyle =
    legendPosition.x === -1
      ? { top: '12rem', right: '1rem' }
      : { top: legendPosition.y, right: legendPosition.x };

  return (
    <div
      ref={dragRef}
      style={positionStyle}
      className={`flex flex-col gap-2 fixed pointer-events-auto ${isDragging ? 'cursor-grabbing' : ''}`}
    >
      {/* Daily Target Widget - compact version */}
      <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="w-44">
        <ProductionTargetsWidget />
      </motion.div>

      {/* Truck Schedule Widget */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="w-44"
      >
        <TruckScheduleWidget />
      </motion.div>

      {/* Legend Panel */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        className={`backdrop-blur-xl rounded-xl border shadow-xl overflow-hidden ${
          theme === 'light'
            ? 'bg-white/95 border-slate-200 text-slate-800'
            : 'bg-slate-950/90 border-slate-700/50 text-white'
        }`}
      >
        <div className="flex items-center">
          {/* Drag Handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`px-1.5 py-2.5 cursor-grab transition-colors flex items-center ${
              theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-800/50'
            }`}
            title="Drag to move"
          >
            <GripVertical
              className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
            />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex-1 flex items-center justify-between p-2.5 pl-1 transition-colors ${
              theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-500" />
              <span
                className={`font-medium text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}
              >
                Legend
              </span>
            </div>
            {expanded ? (
              <ChevronUp
                className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
              />
            ) : (
              <ChevronDown
                className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
              />
            )}
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2">
                {/* Equipment */}
                <div>
                  <h3
                    className={`font-bold uppercase text-[9px] tracking-wider mb-1.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Equipment
                  </h3>
                  <ul className="space-y-1 text-xs">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded bg-gradient-to-br from-slate-300 to-slate-400" />
                      <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                        Silos
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded bg-gradient-to-br from-blue-400 to-blue-600" />
                      <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                        Roller Mills
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded bg-gradient-to-br from-slate-200 to-slate-300 border border-slate-300" />
                      <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                        Plansifters
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded bg-gradient-to-br from-orange-400 to-orange-600" />
                      <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                        Packers
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Controls */}
                <div
                  className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
                >
                  <h3
                    className={`font-bold uppercase text-[9px] tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Controls
                  </h3>
                  <ul
                    className={`space-y-0.5 text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    <li>Click machines to inspect</li>
                    <li>Click workers for profiles</li>
                    <li>Drag to rotate view</li>
                  </ul>
                </div>

                {/* Quick Actions - Gamification buttons integrated */}
                <div
                  className={`border-t pt-2 mt-1 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
                >
                  <h3
                    className={`font-bold uppercase text-[9px] tracking-wider mb-1.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Quick Actions
                  </h3>
                  <div className="grid grid-cols-4 gap-1">
                    {/* Achievements */}
                    <button
                      onClick={() => setShowAchievements(!showAchievements)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative ${
                        showAchievements
                          ? 'bg-yellow-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-yellow-600 hover:bg-slate-200'
                            : 'bg-slate-800 text-yellow-400 hover:bg-slate-700'
                      }`}
                      title="Achievements"
                    >
                      <Trophy className="w-4 h-4" />
                      {unlockedCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-500 text-black text-[8px] font-bold rounded-full flex items-center justify-center">
                          {unlockedCount}
                        </span>
                      )}
                    </button>

                    {/* Leaderboard */}
                    <button
                      onClick={() => setShowLeaderboard(!showLeaderboard)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        showLeaderboard
                          ? 'bg-cyan-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-cyan-600 hover:bg-slate-200'
                            : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'
                      }`}
                      title="Leaderboard"
                    >
                      <TrendingUp className="w-4 h-4" />
                    </button>

                    {/* Replay History */}
                    <button
                      onClick={() => {
                        const playbackStore = useHistoricalPlaybackStore.getState();
                        if (playbackStore.isReplaying) {
                          playbackStore.exitReplayMode();
                        } else {
                          playbackStore.enterReplayMode();
                        }
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        isReplaying
                          ? 'bg-red-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-red-500 hover:bg-slate-200'
                            : 'bg-slate-800 text-red-400 hover:bg-slate-700'
                      }`}
                      title="Replay History"
                    >
                      <History className="w-4 h-4" />
                    </button>

                    {/* GPS Map */}
                    <button
                      onClick={() => setShowMiniMap(!showMiniMap)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        showMiniMap
                          ? 'bg-green-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-green-600 hover:bg-slate-200'
                            : 'bg-slate-800 text-green-400 hover:bg-slate-700'
                      }`}
                      title="GPS Map"
                    >
                      <Map className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Screenshot/Export row */}
                  <div className="flex gap-1 mt-1.5">
                    <button
                      onClick={() => {
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                          const link = document.createElement('a');
                          link.download = `millos-${new Date().toISOString().split('T')[0]}.png`;
                          link.href = canvas.toDataURL('image/png');
                          link.click();
                        }
                      }}
                      className={`flex-1 h-7 rounded-lg flex items-center justify-center gap-1 text-[10px] transition-colors ${
                        theme === 'light'
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title="Screenshot"
                    >
                      <Image className="w-3 h-3" />
                      <span>Screenshot</span>
                    </button>
                    <button
                      onClick={() => {
                        const store = useProductionStore.getState();
                        const report = {
                          timestamp: new Date().toISOString(),
                          metrics: store.metrics,
                          productionTarget: store.productionTarget,
                          totalBagsProduced: store.totalBagsProduced,
                          achievements: store.achievements.filter((a) => a.unlockedAt),
                        };
                        const blob = new Blob([JSON.stringify(report, null, 2)], {
                          type: 'application/json',
                        });
                        const link = document.createElement('a');
                        link.download = `millos-report-${new Date().toISOString().split('T')[0]}.json`;
                        link.href = URL.createObjectURL(blob);
                        link.click();
                      }}
                      className={`flex-1 h-7 rounded-lg flex items-center justify-center gap-1 text-[10px] transition-colors ${
                        theme === 'light'
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title="Export Report"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Achievement & Leaderboard Panels */}
      <AnimatePresence>
        {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
        {showLeaderboard && <WorkerLeaderboard onClose={() => setShowLeaderboard(false)} />}
      </AnimatePresence>
    </div>
  );
};

interface UIOverlayProps {
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  showAIPanel: boolean;
  setShowAIPanel: (v: boolean) => void;
  showSCADAPanel: boolean;
  setShowSCADAPanel: (v: boolean) => void;
  selectedMachine: MachineData | null;
  onCloseSelection: () => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  productionSpeed,
  setProductionSpeed,
  showZones,
  setShowZones,
  showAIPanel,
  setShowAIPanel,
  selectedMachine,
  onCloseSelection,
}) => {
  const {
    muted,
    volume,
    musicEnabled,
    musicVolume,
    currentTrack,
    ttsEnabled,
    setMuted,
    setVolume,
    setMusicEnabled,
    setMusicVolume,
    setTtsEnabled,
    startMusic,
    nextTrack,
    prevTrack,
  } = useAudioState();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  // UI store state using useShallow
  const {
    panelMinimized,
    setPanelMinimized,
    theme,
    showShortcuts,
    setShowShortcuts,
    showFPSCounter,
    fpsMode,
    toggleFpsMode,
  } = useUIStore(
    useShallow((state) => ({
      panelMinimized: state.panelMinimized,
      setPanelMinimized: state.setPanelMinimized,
      theme: state.theme,
      showShortcuts: state.showShortcuts,
      setShowShortcuts: state.setShowShortcuts,
      showFPSCounter: state.showFPSCounter,
      fpsMode: state.fpsMode,
      toggleFpsMode: state.toggleFpsMode,
    }))
  );

  // About modal state
  const [showAbout, setShowAbout] = useState(false);

  // Check if panel is scrollable and not at bottom
  React.useEffect(() => {
    const checkScroll = () => {
      const el = scrollRef.current;
      if (el) {
        const hasMoreContent = el.scrollHeight > el.clientHeight;
        const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 10;
        setShowScrollIndicator(hasMoreContent && notAtBottom);
      }
    };

    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    }

    // Re-check when accordion sections expand/collapse
    const observer = new MutationObserver(checkScroll);
    if (el) {
      observer.observe(el, { childList: true, subtree: true, attributes: true });
    }

    return () => {
      if (el) {
        el.removeEventListener('scroll', checkScroll);
      }
      window.removeEventListener('resize', checkScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={`absolute top-0 left-0 z-10 w-full h-full pointer-events-none ${theme === 'light' ? 'light-theme' : ''}`}
    >
      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} theme={theme} />

      {/* Header */}
      <div className="p-4 flex justify-between items-start">
        {/* Main Control Panel */}
        <motion.div
          role="complementary"
          aria-label="Production controls"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0, width: panelMinimized ? 'auto' : 300 }}
          className={`relative backdrop-blur-xl rounded-2xl text-white pointer-events-auto border shadow-2xl ${
            theme === 'light'
              ? 'bg-white/95 border-slate-300/50 shadow-slate-300/20'
              : 'bg-slate-950/95 border-cyan-500/20 shadow-cyan-500/10'
          }`}
        >
          {/* Minimized Panel View */}
          {panelMinimized ? (
            <div className="p-2 flex flex-col gap-1">
              {/* Logo */}
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xl border border-slate-600 mb-1">
                🏭
              </div>

              {/* Quick Action Icons */}
              <button
                onClick={() => setPanelMinimized(false)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  theme === 'light'
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Expand panel"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  showAIPanel
                    ? 'bg-cyan-600 text-white'
                    : theme === 'light'
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="AI Command Center"
                data-testid="ai-panel-toggle"
              >
                <Brain className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleFpsMode()}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  fpsMode
                    ? 'bg-violet-600 text-white'
                    : theme === 'light'
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="First Person Mode (V)"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowZones(!showZones)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  showZones
                    ? 'bg-orange-600 text-white'
                    : theme === 'light'
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Safety Zones"
              >
                <Shield className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowShortcuts(true)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  theme === 'light'
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Keyboard shortcuts"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div ref={scrollRef} className="p-3 max-h-[calc(100vh-100px)] overflow-y-auto">
              {/* Header with Quick Actions */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xl border border-slate-600">
                      🏭
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-slate-950 animate-pulse" />
                  </div>
                  <div>
                    <h1
                      className={`text-lg font-bold tracking-tight leading-tight ${theme === 'light' ? 'text-slate-800' : ''}`}
                    >
                      Mill<span className="text-orange-500">OS</span>
                      <select
                        className={`text-[10px] ml-1 bg-transparent border-none cursor-pointer hover:text-orange-400 transition-colors ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                        value="v0.30"
                        onChange={(e) => {
                          window.location.href = `/${e.target.value}/`;
                        }}
                        title="Switch version"
                        aria-label="Switch app version"
                      >
                        <option value="v0.30">0.30</option>
                        <option value="v0.20">0.20</option>
                        <option value="v0.10">0.10</option>
                      </select>
                    </h1>
                    <p
                      className={`text-[9px] uppercase tracking-widest leading-tight ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      Digital Twin Operations
                    </p>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleFpsMode()}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      fpsMode
                        ? 'bg-violet-600 text-white'
                        : theme === 'light'
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                    title="First Person Mode (V)"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowShortcuts(true)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      theme === 'light'
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                    title="Keyboard shortcuts (?)"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowAbout(true)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      theme === 'light'
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                    title="About MillOS"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPanelMinimized(true)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      theme === 'light'
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                    title="Minimize panel (M)"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Author link */}
              <p
                className={`text-[9px] italic flex items-center gap-2 leading-tight mb-2 ${theme === 'light' ? 'text-cyan-600' : 'text-cyan-400/70'}`}
              >
                Nell Watson
                <a
                  href="https://github.com/NellWatson/MillOS"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 transition-colors not-italic ${theme === 'light' ? 'text-slate-400 hover:text-cyan-600' : 'text-slate-500 hover:text-cyan-400'}`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Source
                </a>
              </p>

              {/* Mill Clock - isolated component to prevent parent re-renders every second */}
              <MillClockDisplay theme={theme} />

              {/* Production Metrics */}
              <Suspense
                fallback={
                  <div className="space-y-1.5 animate-pulse">
                    <div className="grid grid-cols-3 gap-1">
                      <div className="bg-slate-800/50 rounded p-1.5 border border-slate-700/50 h-16" />
                      <div className="bg-slate-800/50 rounded p-1.5 border border-slate-700/50 h-16" />
                      <div className="bg-slate-800/50 rounded p-1.5 border border-slate-700/50 h-16" />
                    </div>
                    <div className="bg-slate-800/30 rounded p-1.5 border border-slate-700/30 h-20" />
                    <div className="grid grid-cols-3 gap-1">
                      <div className="bg-slate-800/30 rounded p-1 h-12" />
                      <div className="bg-slate-800/30 rounded p-1 h-12" />
                      <div className="bg-slate-800/30 rounded p-1 h-12" />
                    </div>
                    <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded p-1.5 border border-green-700/30 h-20" />
                  </div>
                }
              >
                <ProductionMetrics />
              </Suspense>

              {/* Controls */}
              <div className="space-y-2 border-t border-slate-700/50 pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Safety Zones</span>
                  <button
                    onClick={() => setShowZones(!showZones)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all ${
                      showZones
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {showZones ? 'VISIBLE' : 'HIDDEN'}
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Production Speed</span>
                    <span className="text-orange-400 font-mono font-bold">
                      {(productionSpeed * 100).toFixed(0)}%
                    </span>
                  </div>
                  {/* Fast Forward Buttons */}
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => setProductionSpeed(0)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${
                        productionSpeed === 0
                          ? 'bg-orange-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title="Pause"
                    >
                      <Pause className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setProductionSpeed(0.5)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        productionSpeed === 0.5
                          ? 'bg-orange-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title="Half speed"
                    >
                      0.5x
                    </button>
                    <button
                      onClick={() => setProductionSpeed(1)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${
                        productionSpeed === 1
                          ? 'bg-orange-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title="Normal speed"
                    >
                      <Play className="w-3 h-3" />
                      1x
                    </button>
                    <button
                      onClick={() => setProductionSpeed(2)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${
                        productionSpeed === 2
                          ? 'bg-orange-600 text-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title="Double speed"
                    >
                      <FastForward className="w-3 h-3" />
                      2x
                    </button>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={productionSpeed}
                    onChange={(e) => setProductionSpeed(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Sound</span>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-mono font-bold">
                        {muted ? 'OFF' : `${(volume * 100).toFixed(0)}%`}
                      </span>
                      <button
                        onClick={() => setMuted(!muted)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          muted
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                        title={muted ? 'Unmute' : 'Mute'}
                      >
                        {muted ? (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    disabled={muted}
                    className={`w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 ${muted ? 'opacity-50' : ''}`}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5" />
                      Music
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-mono font-bold">
                        {!musicEnabled ? 'OFF' : `${(musicVolume * 100).toFixed(0)}%`}
                      </span>
                      <button
                        onClick={() => {
                          setMusicEnabled(!musicEnabled);
                          if (!musicEnabled) startMusic();
                        }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          musicEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                        title={musicEnabled ? 'Disable Music' : 'Enable Music'}
                      >
                        {musicEnabled ? (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    disabled={!musicEnabled}
                    className={`w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 ${!musicEnabled ? 'opacity-50' : ''}`}
                  />
                  {musicEnabled && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/30">
                      <button
                        onClick={prevTrack}
                        className="w-6 h-6 rounded flex items-center justify-center bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-emerald-400 transition-all"
                        title="Previous Track"
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-emerald-400 font-medium truncate px-2">
                        {currentTrack.name}
                      </span>
                      <button
                        onClick={nextTrack}
                        className="w-6 h-6 rounded flex items-center justify-center bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-emerald-400 transition-all"
                        title="Next Track"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* TTS Toggle */}
                <div className="flex items-center justify-between py-2 border-t border-slate-700/50">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    PA Voice
                  </span>
                  <button
                    onClick={() => setTtsEnabled(!ttsEnabled)}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                      ttsEnabled
                        ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                        : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                    }`}
                    title={
                      ttsEnabled
                        ? 'Disable PA voice announcements'
                        : 'Enable PA voice announcements'
                    }
                  >
                    {ttsEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <button
                  onClick={() => setShowAIPanel(!showAIPanel)}
                  className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all flex items-center justify-between ${
                    showAIPanel
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  data-testid="ai-panel-toggle-expanded"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    <span>AI Command Center</span>
                  </div>
                  {showAIPanel && <span className="text-xs opacity-70">ESC to close</span>}
                </button>

                <button
                  onClick={() => toggleFpsMode()}
                  className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all flex items-center justify-between ${
                    fpsMode
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    <span>First Person Mode</span>
                  </div>
                  {fpsMode ? (
                    <span className="text-xs opacity-70">ESC to exit</span>
                  ) : (
                    <span className="text-xs opacity-50">V</span>
                  )}
                </button>
              </div>

              {/* Safety Metrics Display */}
              <SafetyMetricsDisplay />

              {/* Safety Score Badge */}
              <SafetyScoreBadge />

              {/* Emergency & Environment Controls */}
              <EmergencyEnvironmentPanel />

              {/* Multiplayer Controls */}
              <MultiplayerLobby />

              {/* Graphics Options Panel */}
              <GraphicsOptionsPanel />

              {/* Predictive Maintenance Panel - collapsible */}
              <PredictiveMaintenanceCollapsible />

              {/* Safety Configuration Panel */}
              <SafetyConfigPanel />

              {/* Safety Analytics Panel */}
              <SafetyAnalyticsPanel />

              {/* Zone Customization Panel */}
              <ZoneCustomizationPanel />

              {/* Incident History Panel */}
              <IncidentHistoryPanel />

              {/* Emergency Stop Button */}
              <div className="pt-2 mt-2 border-t border-slate-700/50">
                <EmergencyStopButton />
              </div>
            </div>
          )}

          {/* Scroll indicator (only when not minimized) */}
          {!panelMinimized && (
            <AnimatePresence>
              {showScrollIndicator && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`absolute bottom-0 left-0 right-0 h-8 pointer-events-none rounded-b-2xl flex items-end justify-center pb-1 ${
                    theme === 'light'
                      ? 'bg-gradient-to-t from-white to-transparent'
                      : 'bg-gradient-to-t from-slate-950 to-transparent'
                  }`}
                >
                  <ChevronDown
                    className={`w-4 h-4 animate-bounce ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </motion.div>
      </div>

      {/* Right Side Panel - Collapsible Legend */}
      <CollapsibleLegend />

      {/* Machine Detail Panel */}
      {selectedMachine && (
        <MachineDetailPanel machine={selectedMachine} onClose={onCloseSelection} />
      )}

      {/* === NEW GAMIFICATION & IMMERSION FEATURES === */}

      {/* PA Announcement System - displays at top center */}
      <PAAnnouncementSystem />

      {/* Bilateral Autonomy System: Five Axes Panel - top right below announcements */}
      <div className="fixed top-20 right-4 z-40 pointer-events-auto w-80">
        <FiveAxesPanel />
      </div>

      {/* Gamification controls now integrated into CollapsibleLegend */}

      {/* Mini-map for GPS tracking - bottom right when enabled */}
      <MiniMap />

      {/* Incident Replay Controls - bottom center when in replay mode */}
      <IncidentReplayControls />

      {/* FPS Counter Overlay - top left corner when enabled */}
      {showFPSCounter && (
        <div className="fixed top-20 left-4 z-50 pointer-events-auto">
          <div
            className={`rounded-lg border shadow-lg ${
              theme === 'light'
                ? 'bg-white/90 border-slate-200'
                : 'bg-slate-900/90 border-slate-700'
            }`}
          >
            <FPSDisplay showDetailed={false} />
          </div>
        </div>
      )}
    </div>
  );
};

const MachineDetailPanel: React.FC<{ machine: MachineData; onClose: () => void }> = ({
  machine,
  onClose,
}) => {
  const [metrics, setMetrics] = React.useState(machine.metrics);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({
        rpm: machine.metrics.rpm + (Math.random() - 0.5) * 10,
        temperature: machine.metrics.temperature + (Math.random() - 0.5) * 2,
        vibration: machine.metrics.vibration + (Math.random() - 0.5) * 0.5,
        load: Math.min(100, Math.max(0, machine.metrics.load + (Math.random() - 0.5) * 3)),
        wear: machine.metrics.wear,
        efficiency: machine.metrics.efficiency,
      });
    }, 500);
    return () => clearInterval(interval);
  }, [machine]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95vw] sm:w-[420px] max-w-[480px] pointer-events-auto z-20"
    >
      <div className="bg-slate-950/98 backdrop-blur-xl border border-slate-600/50 rounded-xl shadow-2xl overflow-hidden">
        {/* Animated top border */}
        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />

        <div className="p-3 sm:p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                role="img"
                aria-label={`Status: ${machine.status}`}
                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${machine.status === 'running' ? 'bg-green-500 animate-pulse' : machine.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}
              />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                  {machine.name}
                </h2>
                <p className="text-cyan-400 text-[10px] sm:text-xs">
                  {machine.type.replace('_', ' ')}{' '}
                  <span className="text-slate-500">#{machine.id}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close machine details"
              className="text-slate-500 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Metrics Row - 2x2 on mobile, 4 columns on larger screens */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <MetricCard label="RPM" value={metrics.rpm.toFixed(0)} unit="" color="blue" />
            <MetricCard
              label="Temp"
              value={metrics.temperature.toFixed(1)}
              unit="°C"
              color="orange"
            />
            <MetricCard
              label="Vibration"
              value={metrics.vibration.toFixed(2)}
              unit="mm/s"
              color="purple"
            />
            <MetricCard label="Load" value={metrics.load.toFixed(1)} unit="%" color="green" />
          </div>

          {/* Footer with Maintenance & Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 pt-2 border-t border-slate-700/50">
            <div className="text-[9px] sm:text-[10px] text-slate-500 flex sm:block gap-3 sm:gap-0 sm:space-y-0.5">
              <div>
                Last: <span className="text-slate-400">{machine.lastMaintenance}</span>
              </div>
              <div>
                Next: <span className="text-cyan-400">{machine.nextMaintenance}</span>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg font-medium text-[11px] sm:text-xs transition-colors">
                View Logs
              </button>
              <button className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-medium text-[11px] sm:text-xs transition-colors">
                Schedule
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; unit: string; color: string }> = ({
  label,
  value,
  unit,
  color,
}) => {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    cyan: 'text-cyan-400',
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
      <div className="text-[9px] text-slate-500 uppercase tracking-wider leading-tight">
        {label}
      </div>
      <div className={`text-sm font-bold font-mono ${colorClasses[color]} leading-tight`}>
        {value}
        {unit && <span className="text-[10px] text-slate-500 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
};
