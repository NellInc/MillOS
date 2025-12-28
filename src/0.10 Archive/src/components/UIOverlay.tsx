import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Sun, Sunset, Moon, Shield, ChevronDown, ChevronUp, Activity, AlertTriangle, Users, Plus, Trash2, MapPin, Settings, Monitor, Sparkles, Wind, Eye, Layers, OctagonX, Clock, History, RotateCcw, Gauge, Keyboard, HelpCircle, PanelLeftClose, PanelLeft, GripVertical, X, SunMedium, MoonStar, FileText, Download, TrendingUp, Truck, Music, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { MachineData, WorkerData } from '../types';
import { ProductionMetrics } from './ProductionMetrics';
import { audioManager } from '../utils/audioManager';
import { useMillStore, GraphicsQuality, GRAPHICS_PRESETS } from '../store';
import { FPSDisplay } from './FPSMonitor';
import { SafetyScoreBadge } from './EmergencyOverlay';
import { PAAnnouncementSystem, ProductionTargetsWidget, GamificationBar, MiniMap, IncidentReplayControls } from './GameFeatures';

// Speed options: 0 = paused, 1 = 1x, 60 = 60x (1 sec = 1 min), 300 = 5 min/sec
const SPEED_OPTIONS = [
  { value: 0, label: 'Paused', display: 'II' },
  { value: 1, label: '1x', display: '1x' },
  { value: 60, label: '60x', display: '60x' },
  { value: 300, label: '300x', display: '5m/s' },
];

// Isolated Mill Clock component - only this re-renders every second, not the parent
const MillClockDisplay: React.FC<{ theme: 'dark' | 'light' }> = React.memo(({ theme }) => {
  const [time, setTime] = useState(() => {
    const start = new Date();
    start.setHours(6, 0, 0, 0);
    return start;
  });
  const [speedIndex, setSpeedIndex] = useState(2); // Default to 60x

  const speed = SPEED_OPTIONS[speedIndex].value;

  useEffect(() => {
    if (speed === 0) return;
    const interval = setInterval(() => {
      setTime(prev => {
        const next = new Date(prev);
        next.setSeconds(next.getSeconds() + speed);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [speed]);

  const hours = time.getHours();
  const shift = useMemo(() => {
    if (hours >= 6 && hours < 14) return { name: 'Day Shift', color: 'text-yellow-400', Icon: Sun };
    if (hours >= 14 && hours < 22) return { name: 'Evening Shift', color: 'text-orange-400', Icon: Sunset };
    return { name: 'Night Shift', color: 'text-blue-400', Icon: Moon };
  }, [hours]);

  const timeString = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const togglePause = () => setSpeedIndex(i => i === 0 ? 2 : 0);
  const cycleSpeed = () => setSpeedIndex(i => {
    const next = i + 1;
    return next >= SPEED_OPTIONS.length ? 1 : next;
  });
  const speedLabel = SPEED_OPTIONS[speedIndex].label;

  return (
    <div className={`flex items-center justify-between rounded-lg px-2 py-1.5 mb-2 border ${
      theme === 'light'
        ? 'bg-slate-100 border-slate-200'
        : 'bg-slate-900/50 border-slate-800'
    }`}>
      <div className="flex items-center gap-1.5">
        <shift.Icon className={`w-5 h-5 ${shift.color}`} />
        <div>
          <div className={`text-lg font-mono font-bold tracking-wider leading-tight ${
            speed === 0
              ? (theme === 'light' ? 'text-slate-400' : 'text-slate-500')
              : (theme === 'light' ? 'text-slate-800' : 'text-white')
          }`}>
            {timeString}
          </div>
          <div className={`text-[9px] font-medium uppercase tracking-wider ${shift.color}`}>
            {shift.name}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={togglePause}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
            speed === 0
              ? 'bg-cyan-500/20 text-cyan-400'
              : theme === 'light'
                ? 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
          title={speed === 0 ? 'Resume' : 'Pause'}
        >
          {speed === 0 ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6zm8 0h4v16h-4z"/>
            </svg>
          )}
        </button>
        <button
          onClick={cycleSpeed}
          className={`px-1.5 h-6 rounded text-[9px] font-mono font-bold transition-all min-w-[36px] ${
            theme === 'light'
              ? 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
          title="Cycle speed"
        >
          {speedLabel}
        </button>
      </div>
    </div>
  );
});

function useAudioState() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    return audioManager.subscribe(() => forceUpdate({}));
  }, []);
  return {
    muted: audioManager.muted,
    volume: audioManager.volume,
    setMuted: (v: boolean) => { audioManager.muted = v; },
    setVolume: (v: number) => { audioManager.volume = v; },
    musicEnabled: audioManager.musicEnabled,
    musicVolume: audioManager.musicVolume,
    currentTrack: audioManager.currentTrack,
    setMusicEnabled: (v: boolean) => { audioManager.musicEnabled = v; },
    setMusicVolume: (v: number) => { audioManager.musicVolume = v; },
    nextTrack: () => audioManager.nextTrack(),
    prevTrack: () => audioManager.prevTrack(),
    startMusic: () => audioManager.startMusic(),
    ttsEnabled: audioManager.ttsEnabled,
    setTTSEnabled: (v: boolean) => { audioManager.ttsEnabled = v; },
  };
}

// Safety Metrics Display Component
const SafetyMetricsDisplay: React.FC = () => {
  const safetyMetrics = useMillStore(state => state.safetyMetrics);
  const theme = useMillStore(state => state.theme);
  const [prevMetrics, setPrevMetrics] = useState(safetyMetrics);
  const [flashStop, setFlashStop] = useState(false);
  const [flashEvasion, setFlashEvasion] = useState(false);

  // Flash animation when metrics change
  useEffect(() => {
    if (safetyMetrics.safetyStops > prevMetrics.safetyStops) {
      setFlashStop(true);
      setTimeout(() => setFlashStop(false), 500);
    }
    if (safetyMetrics.workerEvasions > prevMetrics.workerEvasions) {
      setFlashEvasion(true);
      setTimeout(() => setFlashEvasion(false), 500);
    }
    setPrevMetrics(safetyMetrics);
  }, [safetyMetrics, prevMetrics]);

  // Calculate time since last incident
  const timeSinceIncident = useMemo(() => {
    if (!safetyMetrics.lastIncidentTime) return 'No incidents';
    const seconds = Math.floor((Date.now() - safetyMetrics.lastIncidentTime) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }, [safetyMetrics.lastIncidentTime]);

  const cardBg = theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50';

  return (
    <div className={`rounded-lg p-2 mb-2 border ${
      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
    }`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Activity className="w-3.5 h-3.5 text-green-500" />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${
          theme === 'light' ? 'text-slate-500' : 'text-slate-400'
        }`}>Safety Stats</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className={`text-center p-1.5 rounded transition-all ${flashStop ? 'bg-red-500/30 scale-105' : cardBg}`}>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
          </div>
          <div className="text-lg font-bold text-amber-500 font-mono">{safetyMetrics.safetyStops}</div>
          <div className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Stops</div>
        </div>
        <div className={`text-center p-1.5 rounded transition-all ${flashEvasion ? 'bg-blue-500/30 scale-105' : cardBg}`}>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Users className="w-3 h-3 text-blue-500" />
          </div>
          <div className="text-lg font-bold text-blue-500 font-mono">{safetyMetrics.workerEvasions}</div>
          <div className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Evasions</div>
        </div>
        <div className={`text-center p-1.5 rounded ${cardBg}`}>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Shield className="w-3 h-3 text-green-500" />
          </div>
          <div className="text-[10px] font-bold text-green-500 leading-tight">{timeSinceIncident}</div>
          <div className={`text-[8px] uppercase ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Last Event</div>
        </div>
      </div>
    </div>
  );
};

// Emergency & Environment Controls Panel
const EmergencyEnvironmentPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const emergencyActive = useMillStore(state => state.emergencyActive);
  const emergencyDrillMode = useMillStore(state => state.emergencyDrillMode);
  const startEmergencyDrill = useMillStore(state => state.startEmergencyDrill);
  const endEmergencyDrill = useMillStore(state => state.endEmergencyDrill);
  const shiftChangeActive = useMillStore(state => state.shiftChangeActive);
  const currentShift = useMillStore(state => state.currentShift);
  const triggerShiftChange = useMillStore(state => state.triggerShiftChange);
  const weather = useMillStore(state => state.weather);
  const setWeather = useMillStore(state => state.setWeather);
  const showHeatMap = useMillStore(state => state.showHeatMap);
  const setShowHeatMap = useMillStore(state => state.setShowHeatMap);
  const clearHeatMap = useMillStore(state => state.clearHeatMap);

  const weatherOptions: Array<{ value: 'clear' | 'cloudy' | 'rain' | 'storm'; label: string; icon: string }> = [
    { value: 'clear', label: 'Clear', icon: 'sun' },
    { value: 'cloudy', label: 'Cloudy', icon: 'cloud' },
    { value: 'rain', label: 'Rain', icon: 'rain' },
    { value: 'storm', label: 'Storm', icon: 'bolt' }
  ];

  return (
    <div className="border-t border-slate-700/50 pt-2 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs font-medium text-slate-300 hover:text-white transition-colors py-1"
      >
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-400" />
          Emergency & Environment
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Emergency Drill Button */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Emergency Drill</div>
              <button
                onClick={() => emergencyDrillMode ? endEmergencyDrill() : startEmergencyDrill()}
                className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  emergencyDrillMode
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : emergencyActive
                    ? 'bg-orange-600 text-white cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
                disabled={emergencyActive && !emergencyDrillMode}
              >
                {emergencyDrillMode ? 'END DRILL' : emergencyActive ? 'EMERGENCY ACTIVE' : 'START DRILL'}
              </button>
              <p className="text-[9px] text-slate-500 mt-1">
                {emergencyDrillMode ? 'Workers responding to drill...' : 'Test emergency response procedures'}
              </p>
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
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Weather</div>
              <div className="grid grid-cols-4 gap-1">
                {weatherOptions.map(opt => (
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
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Worker Heat Map</div>
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
  const graphics = useMillStore(state => state.graphics);
  const setGraphicsQuality = useMillStore(state => state.setGraphicsQuality);
  const setGraphicsSetting = useMillStore(state => state.setGraphicsSetting);
  const theme = useMillStore(state => state.theme);

  const qualityColors: Record<GraphicsQuality, string> = {
    low: 'text-slate-400',
    medium: 'text-yellow-400',
    high: 'text-cyan-400',
    ultra: 'text-purple-400'
  };

  const toggleSettings: Array<{ key: keyof typeof graphics; label: string; icon: React.ReactNode; category: string }> = [
    // Post-processing
    { key: 'enableSSAO', label: 'Ambient Occlusion', icon: <Eye className="w-3 h-3" />, category: 'Post-Processing' },
    { key: 'enableBloom', label: 'Bloom Glow', icon: <Sparkles className="w-3 h-3" />, category: 'Post-Processing' },
    { key: 'enableVignette', label: 'Vignette', icon: <Monitor className="w-3 h-3" />, category: 'Post-Processing' },
    { key: 'enableChromaticAberration', label: 'Chromatic Aberration', icon: <Layers className="w-3 h-3" />, category: 'Post-Processing' },
    { key: 'enableFilmGrain', label: 'Film Grain', icon: <Wind className="w-3 h-3" />, category: 'Post-Processing' },
    // Scene effects
    { key: 'enableDustParticles', label: 'Dust Particles', icon: <Wind className="w-3 h-3" />, category: 'Particles' },
    { key: 'enableGrainFlow', label: 'Grain Flow', icon: <Wind className="w-3 h-3" />, category: 'Particles' },
    { key: 'enableAtmosphericHaze', label: 'Atmospheric Haze', icon: <Wind className="w-3 h-3" />, category: 'Particles' },
    // Machine enhancements
    { key: 'enableMachineVibration', label: 'Machine Vibration', icon: <Activity className="w-3 h-3" />, category: 'Machines' },
    { key: 'enableProceduralTextures', label: 'Detailed Textures', icon: <Layers className="w-3 h-3" />, category: 'Machines' },
    { key: 'enableWeathering', label: 'Weathering Effects', icon: <Wind className="w-3 h-3" />, category: 'Machines' },
    // Lighting & Shadows
    { key: 'enableLightShafts', label: 'Light Shafts', icon: <Sun className="w-3 h-3" />, category: 'Lighting' },
    { key: 'enableContactShadows', label: 'Contact Shadows', icon: <Layers className="w-3 h-3" />, category: 'Lighting' },
    { key: 'enableHighResShadows', label: 'High-Res Shadows', icon: <Eye className="w-3 h-3" />, category: 'Lighting' },
  ];

  // Group settings by category
  const categories = ['Post-Processing', 'Particles', 'Machines', 'Lighting'];

  return (
    <div className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light' ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-purple-400" />
          Graphics Quality
          <span className={`text-[10px] font-bold uppercase ${qualityColors[graphics.quality]}`}>
            {graphics.quality}
          </span>
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
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
                      ? quality === 'low' ? 'bg-slate-600 text-white'
                        : quality === 'medium' ? 'bg-yellow-600 text-white'
                        : quality === 'high' ? 'bg-cyan-600 text-white'
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
                  <div className={`text-[9px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>{category}</div>
                  <div className="space-y-0.5">
                    {toggleSettings
                      .filter((s) => s.category === category)
                      .map(({ key, label, icon }) => (
                        <button
                          key={key}
                          onClick={() => setGraphicsSetting(key as keyof typeof graphics, !graphics[key as keyof typeof graphics])}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-all ${
                            graphics[key as keyof typeof graphics]
                              ? theme === 'light' ? 'bg-slate-200 text-slate-800' : 'bg-slate-700/50 text-white'
                              : theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-800/30 text-slate-500 hover:bg-slate-800/50'
                          }`}
                        >
                          <span className={graphics[key as keyof typeof graphics] ? 'text-green-500' : theme === 'light' ? 'text-slate-400' : 'text-slate-600'}>
                            {icon}
                          </span>
                          <span className="flex-1 text-left">{label}</span>
                          <span className={`w-2 h-2 rounded-full ${
                            graphics[key as keyof typeof graphics] ? 'bg-green-500' : theme === 'light' ? 'bg-slate-300' : 'bg-slate-600'
                          }`} />
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Particle Count Slider */}
            <div className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex justify-between text-xs mb-1">
                <span className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Wind className="w-3 h-3" />
                  Particle Count
                </span>
                <span className="text-cyan-500 font-mono font-bold">{graphics.dustParticleCount}</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="25"
                value={graphics.dustParticleCount}
                onChange={(e) => setGraphicsSetting('dustParticleCount', parseInt(e.target.value))}
                disabled={!graphics.enableDustParticles}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                } ${!graphics.enableDustParticles ? 'opacity-50' : ''}`}
              />
              <div className={`flex justify-between text-[9px] mt-0.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>
                <span>0</span>
                <span>250</span>
                <span>500</span>
              </div>
            </div>

            {/* FPS Monitor */}
            <div className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-3.5 h-3.5 text-green-500" />
                <span className={`text-[9px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Performance</span>
              </div>
              <FPSDisplay showDetailed={true} />
            </div>

            {/* Keyboard Shortcuts */}
            <div className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Keyboard className="w-3.5 h-3.5 text-blue-500" />
                <span className={`text-[9px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Shortcuts</span>
              </div>
              {/* Graphics Quality */}
              <div className={`text-[8px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>Quality</div>
              <div className="grid grid-cols-4 gap-1 text-[10px] mb-2">
                <div className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>F1</kbd>
                </div>
                <div className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/50 text-yellow-300'}`}>F2</kbd>
                </div>
                <div className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-900/50 text-cyan-300'}`}>F3</kbd>
                </div>
                <div className={`flex items-center justify-center rounded px-1 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1 py-0.5 rounded font-mono text-[9px] ${theme === 'light' ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/50 text-purple-300'}`}>F4</kbd>
                </div>
              </div>
              {/* Controls */}
              <div className={`text-[8px] uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}>Controls</div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>P</kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Pause</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>A</kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>AI Panel</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>Z</kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Zones</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>H</kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Heatmap</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>+/-</kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Speed</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'}`}>ESC</kbd>
                  <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Close</span>
                </div>
              </div>
            </div>

            {/* Performance Info */}
            <div className={`text-[9px] pt-1 border-t ${theme === 'light' ? 'border-slate-200 text-slate-400' : 'border-slate-800 text-slate-500'}`}>
              <p><span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Low:</span> Best for older devices</p>
              <p><span className="text-yellow-500">Medium:</span> Balanced performance</p>
              <p><span className="text-cyan-500">High:</span> Enhanced visuals</p>
              <p><span className="text-purple-500">Ultra:</span> Maximum quality</p>
            </div>

            {/* Reset Settings Button */}
            <button
              onClick={() => {
                localStorage.removeItem('millos-settings');
                setGraphicsQuality('medium');
                window.location.reload();
              }}
              className={`w-full mt-2 py-1.5 rounded text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${
                theme === 'light'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-red-900/50 text-red-300 hover:bg-red-800/50'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              Reset All Settings
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Emergency Stop Button Component
const EmergencyStopButton: React.FC = () => {
  const forkliftEmergencyStop = useMillStore(state => state.forkliftEmergencyStop);
  const setForkliftEmergencyStop = useMillStore(state => state.setForkliftEmergencyStop);
  const addSafetyIncident = useMillStore(state => state.addSafetyIncident);

  const handleEmergencyStop = () => {
    const newState = !forkliftEmergencyStop;
    setForkliftEmergencyStop(newState);
    if (newState) {
      audioManager.playEmergencyStop();
      addSafetyIncident({
        type: 'emergency',
        description: 'Emergency stop activated - all forklifts halted'
      });
    }
  };

  return (
    <button
      onClick={handleEmergencyStop}
      className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
        forkliftEmergencyStop
          ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
          : 'bg-slate-800 text-red-400 hover:bg-red-900/50 border border-red-800'
      }`}
    >
      <OctagonX className="w-5 h-5" />
      {forkliftEmergencyStop ? 'RELEASE E-STOP' : 'EMERGENCY STOP'}
    </button>
  );
};

// Incident History Panel Component
const IncidentHistoryPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const safetyIncidents = useMillStore(state => state.safetyIncidents);
  const clearSafetyIncidents = useMillStore(state => state.clearSafetyIncidents);
  const theme = useMillStore(state => state.theme);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getIncidentColor = (type: string) => {
    if (theme === 'light') {
      switch (type) {
        case 'emergency': return 'text-red-600 bg-red-100';
        case 'stop': return 'text-amber-600 bg-amber-100';
        case 'evasion': return 'text-blue-600 bg-blue-100';
        case 'near_miss': return 'text-orange-600 bg-orange-100';
        default: return 'text-slate-600 bg-slate-100';
      }
    }
    switch (type) {
      case 'emergency': return 'text-red-400 bg-red-500/20';
      case 'stop': return 'text-amber-400 bg-amber-500/20';
      case 'evasion': return 'text-blue-400 bg-blue-500/20';
      case 'near_miss': return 'text-orange-400 bg-orange-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  return (
    <div className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light' ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          Incident Log ({safetyIncidents.length})
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1 pt-2 overflow-hidden"
          >
            {safetyIncidents.length === 0 ? (
              <div className={`text-center text-xs py-2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>No incidents recorded</div>
            ) : (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {safetyIncidents.slice(0, 20).map(incident => (
                    <div
                      key={incident.id}
                      className={`flex items-start gap-2 p-1.5 rounded text-[10px] ${getIncidentColor(incident.type)}`}
                    >
                      <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{formatTime(incident.timestamp)}</div>
                        <div className={`truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>{incident.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {safetyIncidents.length > 0 && (
                  <button
                    onClick={clearSafetyIncidents}
                    className={`w-full text-[10px] transition-colors py-1 ${
                      theme === 'light' ? 'text-slate-400 hover:text-red-500' : 'text-slate-500 hover:text-red-400'
                    }`}
                  >
                    Clear history
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Safety Analytics Panel Component
const SafetyAnalyticsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const safetyIncidents = useMillStore(state => state.safetyIncidents);
  const forkliftMetrics = useMillStore(state => state.forkliftMetrics);
  const incidentHeatMap = useMillStore(state => state.incidentHeatMap);
  const showIncidentHeatMap = useMillStore(state => state.showIncidentHeatMap);
  const setShowIncidentHeatMap = useMillStore(state => state.setShowIncidentHeatMap);
  const clearIncidentHeatMap = useMillStore(state => state.clearIncidentHeatMap);
  const resetForkliftMetrics = useMillStore(state => state.resetForkliftMetrics);
  const theme = useMillStore(state => state.theme);

  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const weekAgoMs = todayMs - 7 * 24 * 60 * 60 * 1000;

  const todayIncidents = safetyIncidents.filter(i => i.timestamp >= todayMs);
  const weekIncidents = safetyIncidents.filter(i => i.timestamp >= weekAgoMs);

  // Calculate forklift efficiency
  const forkliftIds = Object.keys(forkliftMetrics);
  const efficiencyData = forkliftIds.map(id => {
    const m = forkliftMetrics[id];
    const total = m.totalMovingTime + m.totalStoppedTime;
    const efficiency = total > 0 ? (m.totalMovingTime / total) * 100 : 100;
    return { id, efficiency, movingTime: m.totalMovingTime, stoppedTime: m.totalStoppedTime };
  });

  // Generate safety report
  const generateReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: new Date(weekAgoMs).toISOString(),
        end: new Date().toISOString()
      },
      summary: {
        totalIncidents: weekIncidents.length,
        byType: {
          emergency: weekIncidents.filter(i => i.type === 'emergency').length,
          nearMiss: weekIncidents.filter(i => i.type === 'near_miss').length,
          stop: weekIncidents.filter(i => i.type === 'stop').length,
          evasion: weekIncidents.filter(i => i.type === 'evasion').length
        }
      },
      forkliftEfficiency: efficiencyData,
      incidents: weekIncidents.map(i => ({
        timestamp: new Date(i.timestamp).toISOString(),
        type: i.type,
        description: i.description,
        location: i.location
      })),
      hotspots: incidentHeatMap.slice(0, 10).map(h => ({
        location: { x: h.x, z: h.z },
        intensity: h.intensity,
        type: h.type
      }))
    };

    // Download as JSON
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safety-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light' ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-500" />
          Safety Analytics
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                <div className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Today</div>
                <div className="text-xl font-bold text-cyan-500">{todayIncidents.length}</div>
                <div className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>incidents</div>
              </div>
              <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                <div className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>This Week</div>
                <div className="text-xl font-bold text-blue-500">{weekIncidents.length}</div>
                <div className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>incidents</div>
              </div>
            </div>

            {/* Incident Heat Map Toggle */}
            <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Incident Heat Map</div>
                  <p className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>{incidentHeatMap.length} hotspots recorded</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowIncidentHeatMap(!showIncidentHeatMap)}
                    className={`py-1 px-3 rounded text-[10px] font-medium transition-all ${
                      showIncidentHeatMap
                        ? 'bg-red-600 text-white'
                        : theme === 'light'
                          ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {showIncidentHeatMap ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={clearIncidentHeatMap}
                    className={`py-1 px-2 rounded text-[10px] font-medium ${
                      theme === 'light'
                        ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Forklift Efficiency */}
            <div className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-amber-500" />
                  <span className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Forklift Efficiency</span>
                </div>
                <button
                  onClick={resetForkliftMetrics}
                  className={`text-[9px] transition-colors ${theme === 'light' ? 'text-slate-400 hover:text-red-500' : 'text-slate-500 hover:text-red-400'}`}
                >
                  Reset
                </button>
              </div>
              {efficiencyData.length === 0 ? (
                <div className={`text-[10px] text-center py-2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>No data yet</div>
              ) : (
                <div className="space-y-1.5">
                  {efficiencyData.map(({ id, efficiency, movingTime, stoppedTime }) => (
                    <div key={id} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>{id.replace('forklift-', 'Forklift ')}</span>
                        <span className={`font-bold ${
                          efficiency >= 80 ? 'text-green-500' :
                          efficiency >= 60 ? 'text-yellow-500' :
                          'text-red-500'
                        }`}>
                          {efficiency.toFixed(1)}%
                        </span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`}>
                        <div
                          className={`h-full rounded-full transition-all ${
                            efficiency >= 80 ? 'bg-green-500' :
                            efficiency >= 60 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${efficiency}%` }}
                        />
                      </div>
                      <div className={`flex justify-between text-[8px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span>Moving: {movingTime.toFixed(0)}s</span>
                        <span>Stopped: {stoppedTime.toFixed(0)}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generate Report Button */}
            <button
              onClick={generateReport}
              className="w-full py-2 rounded-lg font-medium text-xs bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Download Safety Report
              <Download className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Zone Customization Panel Component
const ZoneCustomizationPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', x: 0, z: 0, radius: 4 });
  const speedZones = useMillStore(state => state.speedZones);
  const addSpeedZone = useMillStore(state => state.addSpeedZone);
  const removeSpeedZone = useMillStore(state => state.removeSpeedZone);
  const theme = useMillStore(state => state.theme);

  const handleAddZone = () => {
    if (newZone.name.trim()) {
      addSpeedZone(newZone);
      setNewZone({ name: '', x: 0, z: 0, radius: 4 });
      setShowAddForm(false);
    }
  };

  return (
    <div className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light' ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" />
          Speed Zones ({speedZones.length})
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 pt-2 overflow-hidden"
          >
            {/* Zone List */}
            <div className="max-h-32 overflow-y-auto space-y-1">
              {speedZones.map(zone => (
                <div
                  key={zone.id}
                  className={`flex items-center justify-between rounded px-2 py-1 text-xs group ${
                    theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>{zone.name}</div>
                    <div className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                      ({zone.x}, {zone.z}) r={zone.radius}m
                    </div>
                  </div>
                  <button
                    onClick={() => removeSpeedZone(zone.id)}
                    className={`opacity-0 group-hover:opacity-100 p-1 transition-all ${
                      theme === 'light' ? 'text-red-500 hover:text-red-600' : 'text-red-400 hover:text-red-300'
                    }`}
                    title="Remove zone"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Zone Form */}
            {showAddForm ? (
              <div className={`rounded p-2 space-y-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}>
                <input
                  type="text"
                  placeholder="Zone name"
                  value={newZone.name}
                  onChange={e => setNewZone({ ...newZone, name: e.target.value })}
                  className={`w-full rounded px-2 py-1 text-xs border outline-none ${
                    theme === 'light'
                      ? 'bg-white text-slate-700 placeholder-slate-400 border-slate-300 focus:border-amber-500'
                      : 'bg-slate-900 text-white placeholder-slate-500 border-slate-700 focus:border-amber-500'
                  }`}
                />
                <div className="grid grid-cols-3 gap-1">
                  <div>
                    <label className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>X</label>
                    <input
                      type="number"
                      value={newZone.x}
                      onChange={e => setNewZone({ ...newZone, x: parseFloat(e.target.value) || 0 })}
                      className={`w-full rounded px-1.5 py-0.5 text-xs border outline-none ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300 focus:border-amber-500'
                          : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Z</label>
                    <input
                      type="number"
                      value={newZone.z}
                      onChange={e => setNewZone({ ...newZone, z: parseFloat(e.target.value) || 0 })}
                      className={`w-full rounded px-1.5 py-0.5 text-xs border outline-none ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300 focus:border-amber-500'
                          : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Radius</label>
                    <input
                      type="number"
                      value={newZone.radius}
                      onChange={e => setNewZone({ ...newZone, radius: parseFloat(e.target.value) || 4 })}
                      className={`w-full rounded px-1.5 py-0.5 text-xs border outline-none ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300 focus:border-amber-500'
                          : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={handleAddZone}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-1 rounded text-xs font-medium transition-colors"
                  >
                    Add Zone
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      theme === 'light'
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className={`w-full flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Plus className="w-3 h-3" />
                Add Speed Zone
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Safety Configuration Panel Component
const SafetyConfigPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const safetyConfig = useMillStore(state => state.safetyConfig);
  const setSafetyConfig = useMillStore(state => state.setSafetyConfig);
  const theme = useMillStore(state => state.theme);

  return (
    <div className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light' ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-500" />
          Safety Configuration
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3 pt-2"
        >
          {/* Worker Detection Radius */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Worker Detection</span>
              <span className="text-green-500 font-mono font-bold">{safetyConfig.workerDetectionRadius.toFixed(1)}m</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={safetyConfig.workerDetectionRadius}
              onChange={(e) => setSafetyConfig({ workerDetectionRadius: parseFloat(e.target.value) })}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-green-500 ${
                theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
              }`}
            />
          </div>

          {/* Forklift Safety Radius */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Forklift Spacing</span>
              <span className="text-blue-500 font-mono font-bold">{safetyConfig.forkliftSafetyRadius.toFixed(1)}m</span>
            </div>
            <input
              type="range"
              min="2"
              max="8"
              step="0.5"
              value={safetyConfig.forkliftSafetyRadius}
              onChange={(e) => setSafetyConfig({ forkliftSafetyRadius: parseFloat(e.target.value) })}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
              }`}
            />
          </div>

          {/* Path Check Distance */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Look-ahead Distance</span>
              <span className="text-purple-500 font-mono font-bold">{safetyConfig.pathCheckDistance.toFixed(1)}m</span>
            </div>
            <input
              type="range"
              min="2"
              max="10"
              step="0.5"
              value={safetyConfig.pathCheckDistance}
              onChange={(e) => setSafetyConfig({ pathCheckDistance: parseFloat(e.target.value) })}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-purple-500 ${
                theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
              }`}
            />
          </div>

          {/* Speed Zone Slowdown */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Speed Zone Rate</span>
              <span className="text-amber-500 font-mono font-bold">{(safetyConfig.speedZoneSlowdown * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="0.8"
              step="0.1"
              value={safetyConfig.speedZoneSlowdown}
              onChange={(e) => setSafetyConfig({ speedZoneSlowdown: parseFloat(e.target.value) })}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-amber-500 ${
                theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
              }`}
            />
          </div>

          {/* Descriptions */}
          <div className={`text-[9px] space-y-1 pt-1 border-t ${
            theme === 'light' ? 'text-slate-400 border-slate-200' : 'text-slate-500 border-slate-800'
          }`}>
            <p><span className="text-green-500">Worker Detection:</span> How close workers can be</p>
            <p><span className="text-blue-500">Forklift Spacing:</span> Min distance between forklifts</p>
            <p><span className="text-purple-500">Look-ahead:</span> How far ahead to check path</p>
            <p><span className="text-amber-500">Speed Zone:</span> Speed % in slow zones</p>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// Keyboard Shortcuts Modal Component
const KeyboardShortcutsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const theme = useMillStore(state => state.theme);

  if (!isOpen) return null;

  const shortcuts = [
    { category: 'Camera Movement', items: [
      { key: 'W / \u2191', description: 'Move forward' },
      { key: 'S / \u2193', description: 'Move backward' },
      { key: 'A / \u2190', description: 'Strafe left' },
      { key: 'D / \u2192', description: 'Strafe right' },
      { key: 'Q', description: 'Move down' },
      { key: 'E', description: 'Move up' },
      { key: 'Drag', description: 'Rotate camera' },
      { key: 'Scroll', description: 'Zoom in/out' },
      { key: '1-5', description: 'Camera presets' },
      { key: '0', description: 'Reset camera view' },
      { key: 'R', description: 'Toggle auto-rotation' },
    ]},
    { category: 'Controls', items: [
      { key: 'P', description: 'Pause/Resume simulation' },
      { key: 'I', description: 'Toggle AI Command Center' },
      { key: 'Z', description: 'Toggle safety zones' },
      { key: 'H', description: 'Toggle heat map' },
      { key: 'M', description: 'Minimize/Expand panel' },
      { key: 'T', description: 'Toggle theme (dark/light)' },
      { key: 'F', description: 'Toggle fullscreen' },
      { key: 'G', description: 'Toggle GPS mini-map' },
      { key: 'C', description: 'Toggle security cameras' },
      { key: '+/-', description: 'Adjust production speed' },
      { key: 'ESC', description: 'Close panels' },
      { key: 'Click', description: 'Select machine/worker' },
    ]},
    { category: 'Graphics Quality', items: [
      { key: 'F1', description: 'Low quality' },
      { key: 'F2', description: 'Medium quality' },
      { key: 'F3', description: 'High quality' },
      { key: 'F4', description: 'Ultra quality' },
    ]},
    { category: 'Safety', items: [
      { key: 'SPACE', description: 'Emergency Stop (toggle)' },
    ]},
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      onClick={onClose}
    >
      <div className={`absolute inset-0 backdrop-blur-sm ${theme === 'light' ? 'bg-black/40' : 'bg-black/60'}`} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`relative backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden ${
          theme === 'light'
            ? 'bg-white/95 border border-slate-200'
            : 'bg-slate-900/95 border border-slate-700/50'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'
        }`}>
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-cyan-500" />
            <h2 className={`text-lg font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
                theme === 'light' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {section.category}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${
                      theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'
                    }`}
                  >
                    <span className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>{item.description}</span>
                    <kbd className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                      theme === 'light'
                        ? 'bg-white text-slate-700 border-slate-300'
                        : 'bg-slate-700 text-slate-200 border-slate-600'
                    }`}>
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t text-center ${
          theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'
        }`}>
          <p className={`text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
            Press <kbd className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
              theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'
            }`}>?</kbd> to toggle this panel
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Collapsible Legend Component (Draggable)
const CollapsibleLegend: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const legendPosition = useMillStore(state => state.legendPosition);
  const setLegendPosition = useMillStore(state => state.setLegendPosition);
  const resetLegendPosition = useMillStore(state => state.resetLegendPosition);
  const theme = useMillStore(state => state.theme);
  const hasBeenDragged = legendPosition.x !== -1;
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  // Handle mouse down on grip
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    const rect = dragRef.current?.getBoundingClientRect();
    if (rect) {
      elementStartPos.current = {
        x: legendPosition.x === -1 ? window.innerWidth - rect.right + rect.width : legendPosition.x,
        y: legendPosition.y === -1 ? rect.top : legendPosition.y
      };
    }
  }, [legendPosition]);

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
        y: Math.max(0, Math.min(maxY, newY))
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
  const positionStyle = legendPosition.x === -1
    ? { top: '12rem', right: '1rem' }
    : { top: legendPosition.y, right: legendPosition.x };

  return (
    <motion.div
      ref={dragRef}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      style={positionStyle}
      className={`hidden md:block fixed backdrop-blur-xl rounded-xl pointer-events-auto border shadow-xl overflow-hidden ${isDragging ? 'cursor-grabbing' : ''} ${
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
          <GripVertical className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} />
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex-1 flex items-center justify-between p-2.5 pl-1 transition-colors ${
            theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-cyan-500" />
            <span className={`font-medium text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>Legend</span>
          </div>
          {expanded ? <ChevronUp className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} /> : <ChevronDown className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} />}
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
                <h3 className={`font-bold uppercase text-[9px] tracking-wider mb-1.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Equipment</h3>
                <ul className="space-y-1 text-xs">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-slate-300 to-slate-400" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Silos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-blue-400 to-blue-600" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Roller Mills</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-slate-200 to-slate-300 border border-slate-300" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Plansifters</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-orange-400 to-orange-600" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>Packers</span>
                  </li>
                </ul>
              </div>

              {/* Controls */}
              <div className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}>
                <h3 className={`font-bold uppercase text-[9px] tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>Controls</h3>
                <ul className={`space-y-0.5 text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                  <li>Click machines to inspect</li>
                  <li>Click workers for profiles</li>
                  <li>Drag to rotate view</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface UIOverlayProps {
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones: boolean;
  setShowZones: (v: boolean) => void;
  showAIPanel: boolean;
  setShowAIPanel: (v: boolean) => void;
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
  onCloseSelection
}) => {
  const { muted, volume, setMuted, setVolume, musicEnabled, musicVolume, currentTrack, setMusicEnabled, setMusicVolume, nextTrack, prevTrack, startMusic, ttsEnabled, setTTSEnabled } = useAudioState();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  // Panel minimize state
  const panelMinimized = useMillStore(state => state.panelMinimized);
  const setPanelMinimized = useMillStore(state => state.setPanelMinimized);

  // Theme state
  const theme = useMillStore(state => state.theme);
  const toggleTheme = useMillStore(state => state.toggleTheme);

  // Keyboard shortcuts modal state (from store for global access)
  const showShortcuts = useMillStore(state => state.showShortcuts);
  const setShowShortcuts = useMillStore(state => state.setShowShortcuts);

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
    <div className={`absolute top-0 left-0 z-10 w-full h-full pointer-events-none ${theme === 'light' ? 'light-theme' : ''}`}>
      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-4 flex justify-between items-start">
        {/* Main Control Panel */}
        <motion.div
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
                  theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                    : theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="AI Command Center"
              >
                <Brain className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowZones(!showZones)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  showZones
                    ? 'bg-orange-600 text-white'
                    : theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Safety Zones"
              >
                <Shield className="w-4 h-4" />
              </button>
              <button
                onClick={toggleTheme}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  theme === 'light' ? 'bg-slate-100 text-amber-500 hover:bg-slate-200' : 'bg-slate-800 text-blue-400 hover:bg-slate-700'
                }`}
                title="Toggle theme"
              >
                {theme === 'light' ? <SunMedium className="w-4 h-4" /> : <MoonStar className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowShortcuts(true)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Keyboard shortcuts"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          ) : (
          <div
            ref={scrollRef}
            className="p-3 max-h-[calc(100vh-100px)] overflow-y-auto"
          >
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
                <h1 className={`text-lg font-bold tracking-tight leading-tight ${theme === 'light' ? 'text-slate-800' : ''}`}>
                  Mill<span className="text-orange-500">OS</span>
                  <select
                    className={`text-[10px] ml-1 bg-transparent border-none cursor-pointer hover:text-orange-400 transition-colors ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                    value="v0.10"
                    onChange={(e) => {
                      window.location.href = `/${e.target.value}/`;
                    }}
                    title="Switch version"
                  >
                    <option value="v0.10">v0.10</option>
                    <option value="v0.20">v0.20</option>
                    <option value="v0.30">v0.30</option>
                  </select>
                </h1>
                <p className={`text-[9px] uppercase tracking-widest leading-tight ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                  Digital Twin Operations
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  theme === 'light'
                    ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                    : 'bg-slate-800 text-blue-400 hover:bg-slate-700'
                }`}
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <SunMedium className="w-3.5 h-3.5" /> : <MoonStar className="w-3.5 h-3.5" />}
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
          <p className={`text-[9px] italic flex items-center gap-2 leading-tight mb-2 ${theme === 'light' ? 'text-cyan-600' : 'text-cyan-400/70'}`}>
            Nell Watson
            <a
              href="https://github.com/NellWatson/MillOS"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1 transition-colors not-italic ${theme === 'light' ? 'text-slate-400 hover:text-cyan-600' : 'text-slate-500 hover:text-cyan-400'}`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Source
            </a>
          </p>

          {/* Mill Clock - isolated component to prevent parent re-renders every second */}
          <MillClockDisplay theme={theme} />

          {/* Production Metrics */}
          <ProductionMetrics />

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
                <span className="text-orange-400 font-mono font-bold">{(productionSpeed * 100).toFixed(0)}%</span>
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
                  <span className="text-cyan-400 font-mono font-bold">{muted ? 'OFF' : `${(volume * 100).toFixed(0)}%`}</span>
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
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
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
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
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

            {/* PA Voice Announcements Toggle */}
            <div className="flex items-center justify-between py-2 px-1">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                PA Voice
              </span>
              <button
                onClick={() => setTTSEnabled(!ttsEnabled)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                  ttsEnabled
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
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
            >
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                <span>AI Command Center</span>
              </div>
              {showAIPanel && <span className="text-xs opacity-70">ESC to close</span>}
            </button>
          </div>

          {/* Safety Metrics Display */}
          <SafetyMetricsDisplay />

          {/* Safety Score Badge */}
          <SafetyScoreBadge />

          {/* Emergency & Environment Controls */}
          <EmergencyEnvironmentPanel />

          {/* Graphics Options Panel */}
          <GraphicsOptionsPanel />

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
                    theme === 'light' ? 'bg-gradient-to-t from-white to-transparent' : 'bg-gradient-to-t from-slate-950 to-transparent'
                  }`}
                >
                  <ChevronDown className={`w-4 h-4 animate-bounce ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} />
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

      {/* Production Targets Widget - bottom left above metrics */}
      <div className="fixed bottom-24 left-4 z-30 pointer-events-auto w-64">
        <ProductionTargetsWidget />
      </div>

      {/* Gamification Bar - right side with achievements, leaderboard, mini-map toggles */}
      <GamificationBar />

      {/* Mini-map for GPS tracking - bottom right when enabled */}
      <MiniMap />

      {/* Incident Replay Controls - bottom center when in replay mode */}
      <IncidentReplayControls />
    </div>
  );
};

const MachineDetailPanel: React.FC<{ machine: MachineData; onClose: () => void }> = ({ machine, onClose }) => {
  const [metrics, setMetrics] = React.useState(machine.metrics);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({
        rpm: machine.metrics.rpm + (Math.random() - 0.5) * 10,
        temperature: machine.metrics.temperature + (Math.random() - 0.5) * 2,
        vibration: machine.metrics.vibration + (Math.random() - 0.5) * 0.5,
        load: Math.min(100, Math.max(0, machine.metrics.load + (Math.random() - 0.5) * 3))
      });
    }, 500);
    return () => clearInterval(interval);
  }, [machine]);

  const statusColor = machine.status === 'running' ? 'text-green-400' : machine.status === 'warning' ? 'text-yellow-400' : 'text-red-400';

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
              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${machine.status === 'running' ? 'bg-green-500 animate-pulse' : machine.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white leading-tight">{machine.name}</h2>
                <p className="text-cyan-400 text-[10px] sm:text-xs">{machine.type.replace('_', ' ')} <span className="text-slate-500">#{machine.id}</span></p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 transition-colors">
              ×
            </button>
          </div>

          {/* Metrics Row - 2x2 on mobile, 4 columns on larger screens */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <MetricCard label="RPM" value={metrics.rpm.toFixed(0)} unit="" color="blue" />
            <MetricCard label="Temp" value={metrics.temperature.toFixed(1)} unit="°C" color="orange" />
            <MetricCard label="Vibration" value={metrics.vibration.toFixed(2)} unit="mm/s" color="purple" />
            <MetricCard label="Load" value={metrics.load.toFixed(1)} unit="%" color="green" />
          </div>

          {/* Footer with Maintenance & Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 pt-2 border-t border-slate-700/50">
            <div className="text-[9px] sm:text-[10px] text-slate-500 flex sm:block gap-3 sm:gap-0 sm:space-y-0.5">
              <div>Last: <span className="text-slate-400">{machine.lastMaintenance}</span></div>
              <div>Next: <span className="text-cyan-400">{machine.nextMaintenance}</span></div>
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

const MetricCard: React.FC<{ label: string; value: string; unit: string; color: string }> = ({ label, value, unit, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    cyan: 'text-cyan-400'
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
      <div className="text-[9px] text-slate-500 uppercase tracking-wider leading-tight">{label}</div>
      <div className={`text-sm font-bold font-mono ${colorClasses[color]} leading-tight`}>
        {value}
        {unit && <span className="text-[10px] text-slate-500 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
};
