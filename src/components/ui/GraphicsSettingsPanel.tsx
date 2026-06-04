import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  ChevronDown,
  ChevronUp,
  Eye,
  Sparkles,
  Wind,
  Activity,
  Layers,
  Sun,
  User,
  Monitor,
  Gauge,
  Keyboard,
  RotateCcw,
  Grid,
  Triangle,
} from 'lucide-react';
import { useGraphicsStore, GraphicsQuality } from '../../stores/graphicsStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { FPSDisplay } from '../FPSMonitor';
import { useShallow } from 'zustand/react/shallow';

export const GraphicsSettingsPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
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
    key: keyof typeof graphics;
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
    // Display options
    {
      key: 'enableTextureFiltering',
      label: 'Texture Filtering',
      icon: <Grid className="w-3 h-3" />,
      category: 'Display',
    },
    {
      key: 'enableWireframe',
      label: 'Wireframe Mode',
      icon: <Triangle className="w-3 h-3" />,
      category: 'Display',
    },
  ];

  // Group settings by category
  const categories = ['Post-Processing', 'Particles', 'Machines', 'Lighting', 'Display'];

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
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
                  className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
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
                  aria-label={`Set graphics quality to ${quality}`}
                  aria-pressed={graphics.quality === quality}
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
                            setGraphicsSetting(
                              key as keyof typeof graphics,
                              !graphics[key as keyof typeof graphics]
                            )
                          }
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                            graphics[key as keyof typeof graphics]
                              ? theme === 'light'
                                ? 'bg-slate-200 text-slate-800'
                                : 'bg-slate-700/50 text-white'
                              : theme === 'light'
                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                : 'bg-slate-800/30 text-slate-500 hover:bg-slate-800/50'
                          }`}
                          role="switch"
                          aria-checked={Boolean(graphics[key as keyof typeof graphics])}
                          aria-label={`${label}: ${graphics[key as keyof typeof graphics] ? 'enabled' : 'disabled'}`}
                        >
                          <span
                            className={
                              graphics[key as keyof typeof graphics]
                                ? 'text-green-500'
                                : theme === 'light'
                                  ? 'text-slate-400'
                                  : 'text-slate-600'
                            }
                            aria-hidden="true"
                          >
                            {icon}
                          </span>
                          <span className="flex-1 text-left">{label}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              graphics[key as keyof typeof graphics]
                                ? 'bg-green-500'
                                : theme === 'light'
                                  ? 'bg-slate-300'
                                  : 'bg-slate-600'
                            }`}
                            aria-hidden="true"
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
                <label
                  htmlFor="dust-particle-count"
                  className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  <Wind className="w-3 h-3" aria-hidden="true" />
                  Particle Count
                </label>
                <span className="text-cyan-500 font-mono font-bold">
                  {graphics.dustParticleCount}
                </span>
              </div>
              <input
                id="dust-particle-count"
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
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
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

            {/* Resolution Scale Slider */}
            <div
              className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}
            >
              <div className="flex justify-between text-xs mb-1">
                <label
                  htmlFor="resolution-scale"
                  className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  <Monitor className="w-3 h-3" aria-hidden="true" />
                  Resolution Scale
                </label>
                <span className="text-cyan-500 font-mono font-bold">
                  {Math.round(graphics.resolutionScale * 100)}%
                </span>
              </div>
              <input
                id="resolution-scale"
                type="range"
                min="0.25"
                max="1"
                step="0.05"
                value={graphics.resolutionScale}
                onChange={(e) => setGraphicsSetting('resolutionScale', parseFloat(e.target.value))}
                aria-label="Resolution scale"
                aria-valuemin={25}
                aria-valuemax={100}
                aria-valuenow={Math.round(graphics.resolutionScale * 100)}
                aria-valuetext={`${Math.round(graphics.resolutionScale * 100)}% resolution`}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                }`}
              />
              <div
                className={`flex justify-between text-[9px] mt-0.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}
              >
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Worker LOD Distance Slider */}
            <div
              className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-800'}`}
            >
              <div className="flex justify-between text-xs mb-1">
                <label
                  htmlFor="worker-lod-distance"
                  className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  <User className="w-3 h-3" aria-hidden="true" />
                  Worker LOD Distance
                </label>
                <span className="text-cyan-500 font-mono font-bold">
                  {graphics.workerLodDistance}m
                </span>
              </div>
              <input
                id="worker-lod-distance"
                type="range"
                min="10"
                max="100"
                step="5"
                value={graphics.workerLodDistance}
                onChange={(e) => setGraphicsSetting('workerLodDistance', parseInt(e.target.value))}
                aria-label="Worker level of detail distance"
                aria-valuemin={10}
                aria-valuemax={100}
                aria-valuenow={graphics.workerLodDistance}
                aria-valuetext={`${graphics.workerLodDistance} meters`}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                }`}
              />
              <div
                className={`flex justify-between text-[9px] mt-0.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-600'}`}
              >
                <span>10m</span>
                <span>55m</span>
                <span>100m</span>
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
                    I
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
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Restart the day? This clears today's progress and resets the clock to 10:00."
                      )
                    )
                      return;
                    clearPersistedState();
                  }}
                  className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${
                    theme === 'light'
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-amber-900/50 text-amber-300 hover:bg-amber-800/50'
                  }`}
                >
                  Restart Day
                </button>
                <button
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Reset the entire simulation? This clears saved progress and graphics settings, then reloads.'
                      )
                    )
                      return;
                    localStorage.removeItem('millos-graphics');
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
