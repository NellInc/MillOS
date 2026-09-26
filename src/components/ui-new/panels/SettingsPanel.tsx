import React, { useMemo, useState } from 'react';
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
  Captions,
  Search,
  Trash2,
  Download,
  Palette,
} from 'lucide-react';
import { useGraphicsStore, GraphicsQuality } from '../../../stores/graphicsStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
// Import optimized audio hook (uses useSyncExternalStore instead of forceUpdate)
import { useAudioStateWithControls as useAudioState } from '../../../hooks/useAudioState';
import { useKnowledgeStore } from '../../../stores/knowledgeStore';
import { useAINarrationStore } from '../../../stores/aiNarrationStore';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore, type PAMode } from '../../../stores/announcementsStore';
import { BuildCacheDiagnostics } from './BuildCacheDiagnostics';
import { useIncidentReplayStore } from '../../../stores/incidentReplayStore';

export const SettingsPanel: React.FC<{
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones?: boolean;
  setShowZones?: (v: boolean) => void;
}> = ({ productionSpeed, setProductionSpeed, showZones, setShowZones }) => {
  // Subscribe to the used slice only — the bare useGraphicsStore() form
  // re-rendered the whole panel on any graphics-store mutation.
  const graphics = useGraphicsStore(
    useShallow((state) => ({
      graphics: state.graphics,
      setGraphicsSetting: state.setGraphicsSetting,
    }))
  );
  const setGraphicsQuality = useGraphicsStore((state) => state.setGraphicsQuality);
  const clearPersistedState = useGameSimulationStore((state) => state.clearPersistedState);
  const replayGettingStarted = useUIStore((state) => state.setHasSeenIntro);
  const uiScale = useUIStore((state) => state.uiScale);
  const setUIScale = useUIStore((state) => state.setUIScale);
  const audio = useAudioState();
  const paMode = useAnnouncementsStore((state) => state.mode);
  const setPAMode = useAnnouncementsStore((state) => state.setMode);
  const captionsEnabled = useAnnouncementsStore((state) => state.captionsEnabled);
  const setCaptionsEnabled = useAnnouncementsStore((state) => state.setCaptionsEnabled);
  const transcript = useAnnouncementsStore((state) => state.announcements);
  const clearTranscript = useAnnouncementsStore((state) => state.clearTranscript);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const replayFrames = useIncidentReplayStore((state) => state.replayFrames);
  const diagnosticCommands = useIncidentReplayStore((state) => state.commands);
  const createDiagnosticExport = useIncidentReplayStore((state) => state.createDiagnosticExport);
  const clearDiagnostics = useIncidentReplayStore((state) => state.clearDiagnostics);
  const setReplayMode = useIncidentReplayStore((state) => state.setReplayMode);
  const filteredTranscript = useMemo(() => {
    const query = transcriptQuery.trim().toLocaleLowerCase();
    return transcript
      .filter((announcement) => {
        if (!query) return true;
        return `${announcement.message} ${announcement.source ?? ''} ${announcement.channel}`
          .toLocaleLowerCase()
          .includes(query);
      })
      .slice(-30)
      .reverse();
  }, [transcript, transcriptQuery]);

  // Which reset confirmation dialog is open ('day' = back to 10am, 'full' = wipe
  // all saved data). null = no dialog. Replaces the native window.confirm() calls.
  const [resetConfirm, setResetConfirm] = useState<'day' | 'full' | null>(null);

  // Knowledge system settings (used slice only — same reasoning as graphics)
  const {
    showTooltips,
    showLoadingQuotes,
    showAINarration,
    showUnlockNotifications,
    setShowTooltips,
    setShowLoadingQuotes,
    setShowAINarration,
    setShowUnlockNotifications,
  } = useKnowledgeStore(
    useShallow((state) => ({
      showTooltips: state.showTooltips,
      showLoadingQuotes: state.showLoadingQuotes,
      showAINarration: state.showAINarration,
      showUnlockNotifications: state.showUnlockNotifications,
      setShowTooltips: state.setShowTooltips,
      setShowLoadingQuotes: state.setShowLoadingQuotes,
      setShowAINarration: state.setShowAINarration,
      setShowUnlockNotifications: state.setShowUnlockNotifications,
    }))
  );
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
            <output
              htmlFor="production-speed-slider"
              className="text-orange-400 font-mono font-bold"
            >
              {(productionSpeed * 100).toFixed(0)}%
            </output>
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
                aria-label="Mute audio"
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
                aria-label="Music playback"
                aria-pressed={audio.musicEnabled}
                className={`text-[10px] px-2 py-0.5 rounded ${audio.musicEnabled ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white/70'}`}
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

          <fieldset className="space-y-2 border-t border-white/5 pt-3">
            <legend className="text-xs font-medium text-slate-200">PA mode</legend>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="PA mode">
              {(
                [
                  ['focused', 'Focused'],
                  ['characterful', 'Characterful'],
                  ['off', 'Off'],
                ] as const satisfies ReadonlyArray<readonly [PAMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={paMode === mode}
                  onClick={() => setPAMode(mode)}
                  className={`min-h-10 rounded-lg px-2 text-[10px] font-semibold transition-colors ${
                    paMode === mode
                      ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                      : 'bg-slate-900/60 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-4 text-slate-400">
              Focused keeps the PA terse. Characterful lets it talk. Safety messages come through
              regardless.
            </p>
          </fieldset>

          {/* The uncrewed v0.40 site exposes text captions and non-vocal signal tones only. */}
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <span className="flex items-center gap-2 text-xs text-slate-200">
              <Captions size={12} aria-hidden="true" />
              PA captions
            </span>
            <button
              type="button"
              onClick={() => setCaptionsEnabled(!captionsEnabled)}
              aria-label="PA captions"
              aria-pressed={captionsEnabled}
              className={`rounded px-2 py-0.5 text-[10px] ${
                captionsEnabled ? 'bg-teal-700 text-white' : 'bg-slate-700 text-white/70'
              }`}
            >
              {captionsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <details className="border-t border-white/5 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-200">
              PA transcript ({transcript.length})
            </summary>
            <div className="mt-3 space-y-2">
              <label className="relative block">
                <span className="sr-only">Search PA transcript</span>
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={transcriptQuery}
                  onChange={(event) => setTranscriptQuery(event.target.value)}
                  placeholder="Search transcript"
                  className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 pl-8 pr-3 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                />
              </label>
              <div
                role="log"
                aria-label="PA transcript"
                aria-live="off"
                className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-950/50 p-2"
              >
                {filteredTranscript.length === 0 ? (
                  <p className="p-2 text-[10px] text-slate-400">
                    {transcript.length === 0
                      ? 'Nothing announced yet. The mill is either very new or very quiet.'
                      : 'No matches. Try a different search, or accept the silence.'}
                  </p>
                ) : (
                  filteredTranscript.map((announcement) => (
                    <article
                      key={announcement.id}
                      className="rounded border border-slate-800 bg-slate-900/60 p-2"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-slate-500">
                        <span>{announcement.channel}</span>
                        <time dateTime={announcement.timestamp.toISOString()}>
                          {announcement.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <p className="text-[11px] leading-4 text-slate-300">{announcement.message}</p>
                    </article>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={clearTranscript}
                disabled={transcript.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-40"
              >
                <Trash2 size={12} aria-hidden="true" />
                Clear transcript
              </button>
            </div>
          </details>
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
            <button
              type="button"
              onClick={() => replayGettingStarted(false)}
              className="mb-2 flex min-h-11 w-full items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 text-left text-xs text-cyan-200 transition-colors hover:bg-cyan-500/20"
            >
              <span>Replay getting started</span>
              <BookOpen size={14} aria-hidden="true" />
            </button>
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
            {FEATURE_FLAGS.KNOWLEDGE_UNLOCK_TOASTS_ENABLED && (
              <Toggle
                label="Unlock Notifications"
                icon={<Bell size={12} />}
                value={showUnlockNotifications}
                onChange={setShowUnlockNotifications}
              />
            )}
            <p className="text-[9px] text-slate-400 mt-2 px-2">
              Controls the depth of bilateral alignment and economic democracy content.
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
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              Post-Processing
            </div>
            <Toggle
              label="Light Shafts"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableLightShafts}
              onChange={(v) => graphics.setGraphicsSetting('enableLightShafts', v)}
            />
            <Toggle
              label="Colour Grade"
              icon={<Palette size={12} />}
              value={graphics.graphics.enableColorGrade}
              onChange={(v) => graphics.setGraphicsSetting('enableColorGrade', v)}
            />
            <Toggle
              label="Ambient Occlusion"
              icon={<Eye size={12} />}
              value={graphics.graphics.enableAmbientOcclusion}
              onChange={(v) => graphics.setGraphicsSetting('enableAmbientOcclusion', v)}
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
              label="Anti-Aliasing"
              icon={<Monitor size={12} />}
              value={graphics.graphics.enableSMAA}
              onChange={(v) => graphics.setGraphicsSetting('enableSMAA', v)}
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
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
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
          </div>

          {/* Scene & Machines */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
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
            {/* REMOVED: "Textures Enabled" and "Procedural Textures".
                The former setting had zero readers and was retired in graphics
                persistence v5. `enableProceduralTextures`
                does not control procedural texture generation at all (that is
                unconditional, through `getTexture()`); after the App.tsx
                preloader was decoupled from it, all it still gates is two
                conveyor detail groups that cost draw calls for geometry that is
                either enclosed by the belt frame or illegible at 0.06 units.
                Turning it on made the scene slower and no better, so the
                control is gone rather than mislabelled. See the notes on both
                keys in `graphicsStore.ts`. */}
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
              <output
                htmlFor="resolution-scale-slider"
                className="text-[10px] font-mono font-bold text-cyan-400"
              >
                {Math.round((graphics.graphics.resolutionScale ?? 1) * 100)}%
              </output>
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

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Monitor size={14} className="text-cyan-400" aria-hidden="true" />
          Interface accessibility
        </h3>
        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="ui-scale-slider" className="text-xs text-slate-200">
              Interface scale
            </label>
            <output htmlFor="ui-scale-slider" className="font-mono text-xs font-bold text-cyan-300">
              {Math.round(uiScale * 100)}%
            </output>
          </div>
          <input
            id="ui-scale-slider"
            type="range"
            min="0.9"
            max="1.5"
            step="0.05"
            value={uiScale}
            onChange={(event) => setUIScale(Number(event.target.value))}
            aria-valuemin={90}
            aria-valuemax={150}
            aria-valuenow={Math.round(uiScale * 100)}
            aria-valuetext={`${Math.round(uiScale * 100)} percent`}
            className="w-full cursor-pointer accent-cyan-500"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Makes controls and text larger without reducing the 3D render resolution. Browser zoom
            and OS text size still work as expected.
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Download size={14} className="text-emerald-400" aria-hidden="true" />
          Diagnostic replay
        </h3>
        <div className="space-y-3 rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            The last ten minutes of the simulation are buffered — frames, commands, build ID and
            seed. No credentials or identity data leave the building.
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-900/60 p-2">
              <div className="font-mono text-lg text-white">{replayFrames.length}</div>
              <div className="text-slate-400">frames</div>
            </div>
            <div className="rounded-lg bg-slate-900/60 p-2">
              <div className="font-mono text-lg text-white">{diagnosticCommands.length}</div>
              <div className="text-slate-400">commands</div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={replayFrames.length === 0}
              onClick={() => setReplayMode(true)}
              className="min-h-10 rounded-lg bg-cyan-600 px-3 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Enter replay
            </button>
            <button
              type="button"
              onClick={() => {
                const data = createDiagnosticExport();
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `millos-diagnostic-${new Date(data.exportedAt)
                  .toISOString()
                  .replaceAll(':', '-')}.json`;
                // Attach, click, then revoke on the next tick: a synchronous
                // revoke cancels the download in Firefox and some Safari versions.
                document.body.appendChild(anchor);
                anchor.click();
                setTimeout(() => {
                  anchor.remove();
                  URL.revokeObjectURL(url);
                }, 0);
              }}
              className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={clearDiagnostics}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-600"
            >
              <Trash2 size={12} aria-hidden="true" />
              Clear buffer
            </button>
          </div>
        </div>
      </section>

      <BuildCacheDiagnostics />

      {/* Simulation Reset Section */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <RotateCcw size={14} className="text-amber-500" aria-hidden="true" />
          Simulation
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-2">
          <button
            onClick={() => setResetConfirm('day')}
            className="w-full py-2 rounded-lg text-xs font-medium bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 flex items-center justify-center gap-2 transition-colors"
          >
            Reset to 10 AM
          </button>
          <button
            onClick={() => setResetConfirm('full')}
            className="w-full py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-900/20 flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Reset Simulation
          </button>
        </div>
      </section>

      {/* Reset to 10am confirmation */}
      <ConfirmDialog
        isOpen={resetConfirm === 'day'}
        title="Reset to 10 AM"
        tone="amber"
        confirmLabel="Reset to 10 AM"
        message="Wind the clock back to 10 AM — weather, run window and emergency state reset. Production totals, machine states, and achievements survive the trip."
        onCancel={() => setResetConfirm(null)}
        onConfirm={() => {
          clearPersistedState();
          setResetConfirm(null);
        }}
      />

      {/* Full reset confirmation (destructive) */}
      <ConfirmDialog
        isOpen={resetConfirm === 'full'}
        title="Reset Simulation"
        tone="red"
        confirmLabel="Reset Everything"
        message="Wipe everything — saved progress, graphics settings, your Gemini API key — and reload from scratch. There is no undo."
        onCancel={() => setResetConfirm(null)}
        onConfirm={() => {
          // Clear every persisted MillOS store (keys are namespaced "millos-*").
          // This includes millos-graphics and millos-ai-config (the plaintext
          // Gemini API key), which a full reset should remove.
          Object.keys(localStorage)
            .filter((key) => key.startsWith('millos-'))
            .forEach((key) => localStorage.removeItem(key));
          // No graphics write here: the reload boots the default medium preset,
          // and any store write would persist millos-graphics straight back.
          window.location.reload();
        }}
      />
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
    aria-label={label}
    aria-pressed={value}
    className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${value ? 'bg-slate-700/50 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
  >
    <div className="flex items-center gap-2 text-xs">
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </div>
    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
      <span className={value ? 'text-green-300' : 'text-slate-400'}>{value ? 'On' : 'Off'}</span>
      <span
        className={`w-2 h-2 rounded-full ${value ? 'bg-green-400' : 'bg-slate-500'}`}
        aria-hidden="true"
      />
    </span>
  </button>
);
