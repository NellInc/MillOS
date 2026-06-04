import React from 'react';
import {
  Volume2,
  Monitor,
  Gauge,
  Music,
  Wind,
  Eye,
  Activity,
  RotateCcw,
  Grid3X3,
  Cog,
  BookOpen,
  MessageSquare,
  Sparkles,
  Bell,
} from 'lucide-react';
import { useGraphicsStore, GraphicsQuality } from '../../../stores/graphicsStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
// Import optimized audio hook (uses useSyncExternalStore instead of forceUpdate)
import { useAudioStateWithControls as useAudioState } from '../../../hooks/useAudioState';
import { useKnowledgeStore } from '../../../stores/knowledgeStore';
import { useAINarrationStore } from '../../../stores/aiNarrationStore';
import { FEATURE_FLAGS } from '../../../config/featureFlags';

export const SettingsPanel: React.FC<{
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones?: boolean;
  setShowZones?: (v: boolean) => void;
}> = ({ productionSpeed, setProductionSpeed, showZones, setShowZones }) => {
  const graphics = useGraphicsStore();
  const setGraphicsQuality = useGraphicsStore((state) => state.setGraphicsQuality);
  const clearPersistedState = useGameSimulationStore((state) => state.clearPersistedState);
  const audio = useAudioState();

  // Knowledge system settings
  const {
    showTooltips,
    showLoadingQuotes,
    showAINarration,
    showUnlockNotifications,
    setShowTooltips,
    setShowLoadingQuotes,
    setShowAINarration,
    setShowUnlockNotifications,
  } = useKnowledgeStore();
  const narrationEnabled = useAINarrationStore((state) => state.enabled);
  const setNarrationEnabled = useAINarrationStore((state) => state.setEnabled);

  return (
    <div className="p-4 space-y-6 h-full overflow-y-auto custom-scrollbar">
      {/* Simulation Speed */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gauge size={14} className="text-orange-500" aria-hidden="true" />
          Simulation Control
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5">
          <div className="flex justify-between text-xs mb-2">
            <label htmlFor="production-speed-slider" className="text-slate-300">
              Production Speed
            </label>
            <span className="text-orange-400 font-mono font-bold" aria-live="polite">
              {(productionSpeed * 100).toFixed(0)}%
            </span>
          </div>
          <input
            id="production-speed-slider"
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={productionSpeed}
            onChange={(e) => setProductionSpeed(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            aria-valuemin={0}
            aria-valuemax={200}
            aria-valuenow={productionSpeed * 100}
            aria-valuetext={`${(productionSpeed * 100).toFixed(0)} percent`}
          />
        </div>
      </section>

      {/* Audio Settings */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Volume2 size={14} className="text-cyan-400" aria-hidden="true" />
          Audio
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-4">
          {/* Master Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="master-volume-slider" className="text-xs text-slate-200">
                Master Volume
              </label>
              <button
                onClick={() => audio.setMuted(!audio.muted)}
                aria-label={audio.muted ? 'Unmute audio' : 'Mute audio'}
                aria-pressed={audio.muted}
                className="text-[10px] text-cyan-400 hover:text-cyan-300"
              >
                {audio.muted ? 'UNMUTE' : 'MUTE'}
              </button>
            </div>
            <input
              id="master-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audio.volume}
              onChange={(e) => audio.setVolume(parseFloat(e.target.value))}
              disabled={audio.muted}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(audio.volume * 100)}
              aria-valuetext={`${Math.round(audio.volume * 100)} percent`}
            />
          </div>

          {/* Music Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Music size={12} className="text-slate-300" aria-hidden="true" />
                <label htmlFor="music-volume-slider" className="text-xs text-slate-200">
                  Music
                </label>
              </div>
              <button
                onClick={() => audio.setMusicEnabled(!audio.musicEnabled)}
                aria-label={audio.musicEnabled ? 'Disable music' : 'Enable music'}
                aria-pressed={audio.musicEnabled}
                className={`text-[10px] px-2 py-0.5 rounded ${audio.musicEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}
              >
                {audio.musicEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <input
              id="music-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audio.musicVolume}
              onChange={(e) => audio.setMusicVolume(parseFloat(e.target.value))}
              disabled={!audio.musicEnabled}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(audio.musicVolume * 100)}
              aria-valuetext={`${Math.round(audio.musicVolume * 100)} percent`}
            />
          </div>

          {/* Machine Sounds Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Cog size={12} className="text-slate-300" aria-hidden="true" />
                <label htmlFor="machine-volume-slider" className="text-xs text-slate-200">
                  Machine Sounds
                </label>
              </div>
              <span className="text-[10px] text-orange-400 font-mono">
                {Math.round(audio.machineVolume * 100)}%
              </span>
            </div>
            <input
              id="machine-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audio.machineVolume}
              onChange={(e) => audio.setMachineVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(audio.machineVolume * 100)}
              aria-valuetext={`${Math.round(audio.machineVolume * 100)} percent`}
            />
          </div>

          {/* TTS Toggle */}
          <div className="flex justify-between items-center pt-2 border-t border-white/5">
            <span className="text-xs text-slate-200">PA Announcements</span>
            <button
              onClick={() => audio.setTtsEnabled(!audio.ttsEnabled)}
              aria-label={audio.ttsEnabled ? 'Disable PA announcements' : 'Enable PA announcements'}
              aria-pressed={audio.ttsEnabled}
              className={`text-[10px] px-2 py-0.5 rounded ${audio.ttsEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-300'}`}
            >
              {audio.ttsEnabled ? 'ENABLED' : 'MUTED'}
            </button>
          </div>
        </div>
      </section>

      {/* Knowledge System Settings */}
      {FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED && (
        <section>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <BookOpen size={14} className="text-amber-400" aria-hidden="true" />
            Knowledge System
          </h3>
          <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-1">
            <Toggle
              label="Philosophy Tooltips"
              icon={<MessageSquare size={12} />}
              value={showTooltips}
              onChange={setShowTooltips}
            />
            <Toggle
              label="Loading Screen Quotes"
              icon={<Sparkles size={12} />}
              value={showLoadingQuotes}
              onChange={setShowLoadingQuotes}
            />
            <Toggle
              label="AI Reflections"
              icon={<Eye size={12} />}
              value={showAINarration && narrationEnabled}
              onChange={(v) => {
                setShowAINarration(v);
                setNarrationEnabled(v);
              }}
            />
            <Toggle
              label="Unlock Notifications"
              icon={<Bell size={12} />}
              value={showUnlockNotifications}
              onChange={setShowUnlockNotifications}
            />
            <p className="text-[9px] text-slate-500 mt-2 px-2">
              Control how educational content about bilateral alignment and economic democracy is
              presented.
            </p>
          </div>
        </section>
      )}

      {/* Graphics Settings */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Monitor size={14} className="text-purple-400" aria-hidden="true" />
          Graphics
        </h3>

        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-4">
          {/* Quality Presets */}
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Graphics quality">
            {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((quality) => (
              <button
                key={quality}
                onClick={() => setGraphicsQuality(quality)}
                role="radio"
                aria-checked={graphics.graphics.quality === quality}
                aria-label={`${quality} quality`}
                className={`py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                  graphics.graphics.quality === quality
                    ? quality === 'low'
                      ? 'bg-slate-600 text-white'
                      : quality === 'medium'
                        ? 'bg-yellow-600 text-white'
                        : quality === 'high'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {quality}
              </button>
            ))}
          </div>

          {/* Post-Processing */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">
              Post-Processing
            </div>
            <Toggle
              label="Light Shafts"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableLightShafts}
              onChange={(v) => graphics.setGraphicsSetting('enableLightShafts', v)}
            />
            <Toggle
              label="Ambient Occlusion"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableSSAO}
              onChange={(v) => graphics.setGraphicsSetting('enableSSAO', v)}
            />
            <Toggle
              label="Bloom Glow"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableBloom}
              onChange={(v) => graphics.setGraphicsSetting('enableBloom', v)}
            />
            <Toggle
              label="Vignette"
              icon={<Monitor size={12} />}
              value={graphics.graphics.enableVignette}
              onChange={(v) => graphics.setGraphicsSetting('enableVignette', v)}
            />
            <Toggle
              label="Depth of Field"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableDepthOfField}
              onChange={(v) => graphics.setGraphicsSetting('enableDepthOfField', v)}
            />
          </div>

          {/* Particles & Effects */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">
              Particles & Effects
            </div>
            <Toggle
              label="Dust Particles"
              icon={<Wind size={12} />}
              value={graphics.graphics.enableDustParticles}
              onChange={(v) => graphics.setGraphicsSetting('enableDustParticles', v)}
            />
            <Toggle
              label="Grain Flow"
              icon={<Wind size={12} />}
              value={graphics.graphics.enableGrainFlow}
              onChange={(v) => graphics.setGraphicsSetting('enableGrainFlow', v)}
            />
            <Toggle
              label="Atmospheric Haze"
              icon={<Wind size={12} />}
              value={graphics.graphics.enableAtmosphericHaze}
              onChange={(v) => graphics.setGraphicsSetting('enableAtmosphericHaze', v)}
            />
          </div>

          {/* Scene & Machines */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">
              Scene & Machines
            </div>
            <Toggle
              label="Machine Vibration"
              icon={<Activity size={12} />}
              value={graphics.graphics.enableMachineVibration}
              onChange={(v) => graphics.setGraphicsSetting('enableMachineVibration', v)}
            />
            <Toggle
              label="Wireframe Mode"
              icon={<Grid3X3 size={12} />}
              value={graphics.graphics.enableWireframe}
              onChange={(v) => graphics.setGraphicsSetting('enableWireframe', v)}
            />
            <Toggle
              label="Procedural Textures"
              icon={<Grid3X3 size={12} />}
              value={graphics.graphics.enableProceduralTextures}
              onChange={(v) => graphics.setGraphicsSetting('enableProceduralTextures', v)}
            />
            <Toggle
              label="Textures Enabled"
              icon={<Grid3X3 size={12} />}
              value={graphics.graphics.enableTextureFiltering}
              onChange={(v) => graphics.setGraphicsSetting('enableTextureFiltering', v)}
            />
            <Toggle
              label="Contact Shadows"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableContactShadows}
              onChange={(v) => graphics.setGraphicsSetting('enableContactShadows', v)}
            />
            <Toggle
              label="High-Res Shadows"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableHighResShadows}
              onChange={(v) => graphics.setGraphicsSetting('enableHighResShadows', v)}
            />
            <Toggle
              label="Floor Puddles"
              icon={<Wind size={12} />}
              value={graphics.graphics.enableFloorPuddles}
              onChange={(v) => graphics.setGraphicsSetting('enableFloorPuddles', v)}
            />
            <Toggle
              label="Audio Reactive"
              icon={<Activity size={12} />}
              value={graphics.graphics.enableAudioReactive}
              onChange={(v) => graphics.setGraphicsSetting('enableAudioReactive', v)}
            />
            {setShowZones && (
              <Toggle
                label="Zone Markers"
                icon={<Grid3X3 size={12} />}
                value={showZones ?? true}
                onChange={setShowZones}
              />
            )}
          </div>

          {/* Resolution Scale Slider */}
          <div className="pt-2 border-t border-white/5">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Monitor size={12} className="text-slate-300" aria-hidden="true" />
                <label htmlFor="resolution-scale-slider" className="text-xs text-slate-200">
                  Resolution Scale
                </label>
              </div>
              <span className="text-cyan-400 font-mono font-bold text-[10px]" aria-live="polite">
                {Math.round((graphics.graphics.resolutionScale ?? 1) * 100)}%
              </span>
            </div>
            <input
              id="resolution-scale-slider"
              type="range"
              min="0.25"
              max="1"
              step="0.05"
              value={graphics.graphics.resolutionScale ?? 1}
              onChange={(e) =>
                graphics.setGraphicsSetting('resolutionScale', parseFloat(e.target.value))
              }
              aria-label="Resolution scale"
              aria-valuemin={25}
              aria-valuemax={100}
              aria-valuenow={Math.round((graphics.graphics.resolutionScale ?? 1) * 100)}
              aria-valuetext={`${Math.round((graphics.graphics.resolutionScale ?? 1) * 100)} percent`}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[9px] text-slate-400 mt-1" aria-hidden="true">
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Simulation Reset Section */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <RotateCcw size={14} className="text-amber-500" aria-hidden="true" />
          Simulation
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-2">
          <button
            onClick={clearPersistedState}
            className="w-full py-2 rounded-lg text-xs font-medium bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 flex items-center justify-center gap-2 transition-colors"
          >
            Reset to 10am
          </button>
          <button
            onClick={() => {
              if (
                !window.confirm(
                  'Reset the simulation and clear all saved data? This clears saved progress, graphics settings, and your Gemini API key, then reloads. This cannot be undone.'
                )
              ) {
                return;
              }
              // Clear every persisted MillOS store (keys are namespaced "millos-*").
              // This includes millos-graphics and millos-ai-config (the plaintext
              // Gemini API key), which a full reset should remove.
              Object.keys(localStorage)
                .filter((key) => key.startsWith('millos-'))
                .forEach((key) => localStorage.removeItem(key));
              setGraphicsQuality('medium');
              window.location.reload();
            }}
            className="w-full py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-900/20 flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Reset Simulation
          </button>
        </div>
      </section>
    </div>
  );
};

const Toggle: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, icon, value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    aria-label={`${value ? 'Disable' : 'Enable'} ${label}`}
    aria-pressed={value}
    className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${value ? 'bg-slate-700/50 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
  >
    <div className="flex items-center gap-2 text-xs">
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </div>
    <div
      className={`w-2 h-2 rounded-full ${value ? 'bg-green-400' : 'bg-slate-500'}`}
      aria-hidden="true"
    />
  </button>
);
