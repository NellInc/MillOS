import React, { useMemo, useRef, useState } from 'react';
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
  Megaphone,
  Search,
  Trash2,
  Download,
  Palette,
} from 'lucide-react';
import { useGraphicsStore, GraphicsQuality } from '../../../stores/graphicsStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { suspendPersistence } from '../../../stores/storage';
import { suspendResourcePersistence } from '../../../utils/resourcePersistence';
import { AUDIO_SETTINGS_KEY } from '../../../utils/audioManager';
import { LOCALE_STORAGE_KEY, formatFixed, useLocale, useT } from '../../../i18n';
import { previewPAVoice } from '../../../audio/paVoice';
import { FEATURED_PA_VOICES, paVoiceFor } from '../../../audio/paVoiceCatalog';
import { isBenchmarkRuntime } from '../../../runtime/runtimeMode';
import { LanguageSwitcher } from '../../../i18n/LanguageSwitcher';
import { keyedText } from '../../../i18n/alertCopy';
import { formatPlantStamp, formatTime } from '../../../utils/timeFormatting';
import { useShallow } from 'zustand/react/shallow';
// Import optimized audio hook (uses useSyncExternalStore instead of forceUpdate)
import { useAudioStateWithControls as useAudioState } from '../../../hooks/useAudioState';
import { useMobileDetection } from '../../../hooks/useMobileDetection';
import { resolutionScaleBounds, useDevicePixelRatio } from '../../../hooks/useDevicePixelRatio';
import { useKnowledgeStore } from '../../../stores/knowledgeStore';
import { useAINarrationStore } from '../../../stores/aiNarrationStore';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { UI_STORAGE_KEY, UI_STORAGE_VERSION, useUIStore } from '../../../stores/uiStore';
import { sanitizeUIState } from '../../../stores/persistenceMigrations';
import {
  MOTION_PREFERENCE_STORAGE_KEY,
  useMotionPreferenceStore,
  type MotionPreferenceMode,
} from '../../../stores/motionPreferenceStore';
import { useAnnouncementsStore, type PAMode } from '../../../stores/announcementsStore';
import { BuildCacheDiagnostics } from './BuildCacheDiagnostics';
import { useIncidentReplayStore } from '../../../stores/incidentReplayStore';
import { settingsPanelMessages } from './SettingsPanel.messages';
import { HistoryStore } from '../../../scada/HistoryStore';
import { peekSCADAService } from '../../../scada/SCADAService';
import { REPLAY_GETTING_STARTED_EVENT } from '../onboarding/replayGettingStarted';

// Settles when the work does, or after `ms`, whichever is first; never rejects.
const settleWithin = (work: Promise<unknown>, ms: number): Promise<void> => {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.then(
      () => undefined,
      () => undefined
    ),
    new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, ms);
    }),
  ]).finally(() => clearTimeout(deadline));
};

// A live link that will not disconnect must not cost the clear, and a blocked
// or wedged IndexedDB must not hold Reset Simulation's reload for the
// historian's own 10 s operation timeout.
const SCADA_STOP_DEADLINE_MS = 1_500;
const SCADA_LATE_STOP_MS = 2_000;
const SCADA_HISTORY_CLEAR_DEADLINE_MS = 4_000;

const clearHistoryOnce = async (): Promise<void> => {
  const history = new HistoryStore();
  try {
    await history.init();
    await history.clearAll();
  } finally {
    await history.close(false);
  }
};

// The SCADA trend history lives in IndexedDB (MillOS_SCADA), outside the
// millos-* localStorage sweep, so History replay after a reset showed the plant
// from before it. Stop the live service first: it flushes what it has buffered
// and closes its connection, so nothing it holds is written back after the
// clear. Then clear through a connection of our own. A stop that runs past its
// deadline flushes when it finally closes, which can land after the clear, so
// once it settles (within a bound) the history is cleared again.
const clearScadaHistory = async (): Promise<void> => {
  const service = peekSCADAService();
  let stopped = !service;
  const stopping = service
    ? service.stop().then(
        () => {
          stopped = true;
        },
        () => {
          stopped = true;
        }
      )
    : Promise.resolve();
  await settleWithin(stopping, SCADA_STOP_DEADLINE_MS);
  const stoppedInTime = stopped;
  await clearHistoryOnce();
  if (stoppedInTime) return;
  await settleWithin(stopping, SCADA_LATE_STOP_MS);
  if (stopped) await clearHistoryOnce();
};

const clearScadaHistoryBounded = (): Promise<void> =>
  settleWithin(clearScadaHistory(), SCADA_HISTORY_CLEAR_DEADLINE_MS);

export const SettingsPanel: React.FC<{
  productionSpeed: number;
  setProductionSpeed: (v: number) => void;
  showZones?: boolean;
  setShowZones?: (v: boolean) => void;
}> = ({ productionSpeed, setProductionSpeed, showZones, setShowZones }) => {
  const t = useT(settingsPanelMessages);
  // Subscribe to the used slice only — the bare useGraphicsStore() form
  // re-rendered the whole panel on any graphics-store mutation.
  const graphics = useGraphicsStore(
    useShallow((state) => ({
      graphics: state.graphics,
      setGraphicsSetting: state.setGraphicsSetting,
    }))
  );
  const setGraphicsQuality = useGraphicsStore((state) => state.setGraphicsQuality);
  // The slider offers only the steps that change the canvas on this screen and
  // tier; a stored scale outside them reads as the nearest end, unrewritten.
  const { floor: resolutionFloor, ceiling: resolutionCeiling } = resolutionScaleBounds(
    useDevicePixelRatio(),
    graphics.graphics.quality
  );
  const shownResolutionScale = Math.min(
    resolutionCeiling,
    Math.max(resolutionFloor, graphics.graphics.resolutionScale ?? 1)
  );
  const shownResolutionPercent = Math.round(shownResolutionScale * 100);
  const resolutionFloorPercent = Math.round(resolutionFloor * 100);
  const resolutionCeilingPercent = Math.round(resolutionCeiling * 100);
  const clearPersistedState = useGameSimulationStore((state) => state.clearPersistedState);
  const replayGettingStarted = useUIStore((state) => state.setHasSeenIntro);
  const uiScale = useUIStore((state) => state.uiScale);
  const setUIScale = useUIStore((state) => state.setUIScale);
  const showFPSCounter = useUIStore((state) => state.showFPSCounter);
  const setShowFPSCounter = useUIStore((state) => state.setShowFPSCounter);
  const { isCompactLayout } = useMobileDetection();
  const motionMode = useMotionPreferenceStore((state) => state.mode);
  const setMotionMode = useMotionPreferenceStore((state) => state.setMode);
  const audio = useAudioState();
  const paMode = useAnnouncementsStore((state) => state.mode);
  const setPAMode = useAnnouncementsStore((state) => state.setMode);
  const captionsEnabled = useAnnouncementsStore((state) => state.captionsEnabled);
  const setCaptionsEnabled = useAnnouncementsStore((state) => state.setCaptionsEnabled);
  const voiceEnabled = useAnnouncementsStore((state) => state.voiceEnabled);
  const setVoiceEnabled = useAnnouncementsStore((state) => state.setVoiceEnabled);
  const voiceNames = useAnnouncementsStore((state) => state.voiceNames);
  const setVoiceName = useAnnouncementsStore((state) => state.setVoiceName);
  const locale = useLocale();
  const transcript = useAnnouncementsStore((state) => state.announcements);
  const clearTranscript = useAnnouncementsStore((state) => state.clearTranscript);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const clearableTranscript = transcript.some((entry) => entry.dismissed);
  const fullResetStartedRef = useRef(false);
  const [fullResetRunning, setFullResetRunning] = useState(false);
  const replayFrames = useIncidentReplayStore((state) => state.replayFrames);
  const diagnosticCommands = useIncidentReplayStore((state) => state.commands);
  const createDiagnosticExport = useIncidentReplayStore((state) => state.createDiagnosticExport);
  const clearDiagnostics = useIncidentReplayStore((state) => state.clearDiagnostics);
  const setReplayMode = useIncidentReplayStore((state) => state.setReplayMode);
  const filteredTranscript = useMemo(() => {
    const query = transcriptQuery.trim().toLocaleLowerCase();
    // Every line the store keeps (50 at most), so the summary's count is the
    // number of rows: a newest-30 slice hid the oldest from the list.
    return transcript
      .filter((announcement) => {
        if (!query) return true;
        // The channel as shown (translated) as well as its id, so the word on
        // the line is a word the search finds.
        return `${keyedText(announcement.copy, announcement.message)} ${announcement.source ?? ''} ${announcement.channel} ${t('paChannel', { channel: announcement.channel })}`
          .toLocaleLowerCase()
          .includes(query);
      })
      .reverse();
  }, [transcript, transcriptQuery, t]);

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
      <section>
        <LanguageSwitcher />
      </section>

      {/* Simulation Speed */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gauge size={14} className="text-orange-500" aria-hidden="true" />
          {t('simulationControl')}
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5">
          <div className="flex justify-between text-xs mb-2">
            <label htmlFor="production-speed-slider" className="text-slate-300">
              {t('productionSpeed')}
            </label>
            <output
              htmlFor="production-speed-slider"
              className="text-orange-400 font-mono font-bold"
            >
              {formatFixed(productionSpeed * 100, 0)}%
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
            aria-valuetext={t('percentValue', { value: formatFixed(productionSpeed * 100, 0) })}
          />
        </div>
      </section>

      {/* Audio Settings */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Volume2 size={14} className="text-cyan-400" aria-hidden="true" />
          {t('audio')}
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-4">
          {/* Master Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="master-volume-slider" className="text-xs text-slate-200">
                {t('masterVolume')}
              </label>
              <button
                onClick={() => audio.setMuted(!audio.muted)}
                aria-label={t('muteAudio')}
                aria-pressed={audio.muted}
                className="text-[10px] text-cyan-400 hover:text-cyan-300"
              >
                {audio.muted ? t('unmute') : t('mute')}
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
              aria-valuetext={t('percentValue', {
                value: formatFixed(Math.round(audio.volume * 100), 0),
              })}
            />
          </div>

          {/* Music Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Music size={12} className="text-slate-300" aria-hidden="true" />
                <label htmlFor="music-volume-slider" className="text-xs text-slate-200">
                  {t('music')}
                </label>
              </div>
              <button
                onClick={() => audio.setMusicEnabled(!audio.musicEnabled)}
                aria-label={t('musicPlayback')}
                aria-pressed={audio.musicEnabled}
                className={`text-[10px] px-2 py-0.5 rounded ${audio.musicEnabled ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white/70'}`}
              >
                {audio.musicEnabled ? t('on') : t('off')}
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
              aria-valuetext={t('percentValue', {
                value: formatFixed(Math.round(audio.musicVolume * 100), 0),
              })}
            />
          </div>

          {/* Machine Sounds Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Cog size={12} className="text-slate-300" aria-hidden="true" />
                <label htmlFor="machine-volume-slider" className="text-xs text-slate-200">
                  {t('machineSounds')}
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
              aria-valuetext={t('percentValue', {
                value: formatFixed(Math.round(audio.machineVolume * 100), 0),
              })}
            />
          </div>

          <fieldset className="space-y-2 border-t border-white/5 pt-3">
            <legend className="text-xs font-medium text-slate-200">{t('paMode')}</legend>
            <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={t('paMode')}>
              {(
                [
                  // 'characterful' differed only by the timed filler lines the
                  // PA no longer speaks (D-054); a saved one reads as on.
                  ['focused', t('paFocused')],
                  ['off', t('paOff')],
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
          </fieldset>

          {/* Captions and the on-device PA voice (D-025) are independent. */}
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <span className="flex items-center gap-2 text-xs text-slate-200">
              <Megaphone size={12} aria-hidden="true" />
              {t('paVoice')}
            </span>
            <button
              type="button"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              aria-label={t('paVoice')}
              aria-pressed={voiceEnabled}
              className={`rounded px-2 py-0.5 text-[10px] ${
                voiceEnabled ? 'bg-teal-700 text-white' : 'bg-slate-700 text-white/70'
              }`}
            >
              {voiceEnabled ? t('on') : t('off')}
            </button>
          </div>
          {voiceEnabled && (
            // Two voices, each introducing itself when picked (D-061), so the
            // choice is made by ear. Picking the current one plays it again.
            <div
              className="grid grid-cols-2 gap-1"
              role="radiogroup"
              aria-label={t('paVoiceChoice')}
            >
              {FEATURED_PA_VOICES[locale].map((name) => {
                const chosen = paVoiceFor(locale, voiceNames) === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => {
                      setVoiceName(locale, name);
                      if (!isBenchmarkRuntime())
                        void previewPAVoice(t('paVoiceSample', { name }), locale, name);
                    }}
                    className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                      chosen
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                        : 'bg-slate-900/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <span className="flex items-center gap-2 text-xs text-slate-200">
              <Captions size={12} aria-hidden="true" />
              {t('paCaptions')}
            </span>
            <button
              type="button"
              onClick={() => setCaptionsEnabled(!captionsEnabled)}
              aria-label={t('paCaptions')}
              aria-pressed={captionsEnabled}
              className={`rounded px-2 py-0.5 text-[10px] ${
                captionsEnabled ? 'bg-teal-700 text-white' : 'bg-slate-700 text-white/70'
              }`}
            >
              {captionsEnabled ? t('on') : t('off')}
            </button>
          </div>

          <details className="border-t border-white/5 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-200">
              {t('paTranscriptSummary', { count: formatFixed(transcript.length, 0) })}
            </summary>
            <div className="mt-3 space-y-2">
              <label className="relative block">
                <span className="sr-only">{t('searchPaTranscript')}</span>
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={transcriptQuery}
                  onChange={(event) => setTranscriptQuery(event.target.value)}
                  placeholder={t('searchTranscript')}
                  className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 pl-8 pr-3 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                />
              </label>
              <div
                role="log"
                aria-label={t('paTranscript')}
                aria-live="off"
                className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-950/50 p-2"
              >
                {filteredTranscript.length === 0 ? (
                  <p className="p-2 text-[10px] text-slate-400">
                    {transcript.length === 0 ? t('transcriptEmpty') : t('transcriptNoMatches')}
                  </p>
                ) : (
                  filteredTranscript.map((announcement) => (
                    <article
                      key={announcement.id}
                      className="rounded border border-slate-800 bg-slate-900/60 p-2"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-slate-500">
                        <span>{t('paChannel', { channel: announcement.channel })}</span>
                        <time dateTime={announcement.timestamp.toISOString()}>
                          {formatPlantStamp(announcement.gameClock) ??
                            formatTime(announcement.timestamp)}
                        </time>
                      </div>
                      {/* Keyed lines read in the language active now. */}
                      <p className="text-[11px] leading-4 text-slate-300">
                        {keyedText(announcement.copy, announcement.message)}
                      </p>
                    </article>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (clearableTranscript) clearTranscript();
                }}
                // Only history clears; a caption still showing stays. Not
                // `disabled`: the button disables itself as it clears, and a
                // focused button that turns disabled loses focus for good (the
                // fallback rescue parks it on the Audio section).
                aria-disabled={!clearableTranscript || undefined}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-700 aria-disabled:opacity-40"
              >
                <Trash2 size={12} aria-hidden="true" />
                {t('clearTranscript')}
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
            {t('knowledgeSystem')}
          </h3>
          <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-1">
            <button
              type="button"
              onClick={() => {
                // After an X close hasSeenIntro is already false, so setting it
                // again notifies nothing: announce the replay for that case.
                const seen = useUIStore.getState().hasSeenIntro;
                replayGettingStarted(false);
                if (!seen) window.dispatchEvent(new Event(REPLAY_GETTING_STARTED_EVENT));
              }}
              className="mb-2 flex min-h-11 w-full items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 text-left text-xs text-cyan-200 transition-colors hover:bg-cyan-500/20"
            >
              <span>{t('replayGettingStarted')}</span>
              <BookOpen size={14} aria-hidden="true" />
            </button>
            {/* Its only readers are in knowledge/KnowledgeTooltip.tsx, which does not ship. */}
            {FEATURE_FLAGS.KNOWLEDGE_TOOLTIPS_ENABLED && (
              <Toggle
                label={t('philosophyTooltips')}
                icon={<MessageSquare size={12} />}
                value={showTooltips}
                onChange={setShowTooltips}
              />
            )}
            <Toggle
              label={t('loadingScreenQuotes')}
              icon={<Sparkles size={12} />}
              value={showLoadingQuotes}
              onChange={setShowLoadingQuotes}
            />
            <Toggle
              label={t('aiReflections')}
              icon={<Eye size={12} />}
              value={showAINarration && narrationEnabled}
              onChange={(v) => {
                setShowAINarration(v);
                setNarrationEnabled(v);
              }}
            />
            {FEATURE_FLAGS.KNOWLEDGE_UNLOCK_TOASTS_ENABLED && (
              <Toggle
                label={t('unlockNotifications')}
                icon={<Bell size={12} />}
                value={showUnlockNotifications}
                onChange={setShowUnlockNotifications}
              />
            )}
            <p className="text-[9px] text-slate-400 mt-2 px-2">{t('knowledgeHelp')}</p>
          </div>
        </section>
      )}

      {/* Graphics Settings */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Monitor size={14} className="text-purple-400" aria-hidden="true" />
          {t('graphics')}
        </h3>

        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-4">
          {/* Quality Presets */}
          <div
            className="grid grid-cols-4 gap-1"
            role="radiogroup"
            aria-label={t('graphicsQuality')}
          >
            {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((quality) => (
              <button
                key={quality}
                onClick={() => setGraphicsQuality(quality)}
                role="radio"
                aria-checked={graphics.graphics.quality === quality}
                aria-label={t('qualityLabel', { quality })}
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
                {t('qualityName', { quality })}
              </button>
            ))}
          </div>

          {/* Post-Processing */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              {t('postProcessing')}
            </div>
            {/* REMOVED: Light Shafts, Contact Shadows, Machine Vibration and
                Floor Puddles. Their keys are read only by modules that do not
                ship (Machines.tsx, machines/InstancedSilos.tsx,
                infrastructure/FactoryFloor.tsx, utils/environmentRegistry.ts),
                so the switches changed nothing. The store keys stay for saved
                graphics records. */}
            <Toggle
              label={t('colourGrade')}
              icon={<Palette size={12} />}
              value={graphics.graphics.enableColorGrade}
              onChange={(v) => graphics.setGraphicsSetting('enableColorGrade', v)}
            />
            <Toggle
              label={t('ambientOcclusion')}
              icon={<Eye size={12} />}
              value={graphics.graphics.enableAmbientOcclusion}
              onChange={(v) => graphics.setGraphicsSetting('enableAmbientOcclusion', v)}
            />
            <Toggle
              label={t('bloomGlow')}
              icon={<Eye size={12} />}
              value={graphics.graphics.enableBloom}
              onChange={(v) => graphics.setGraphicsSetting('enableBloom', v)}
            />
            <Toggle
              label={t('vignette')}
              icon={<Monitor size={12} />}
              value={graphics.graphics.enableVignette}
              onChange={(v) => graphics.setGraphicsSetting('enableVignette', v)}
            />
            <Toggle
              label={t('antiAliasing')}
              icon={<Monitor size={12} />}
              value={graphics.graphics.enableSMAA}
              onChange={(v) => graphics.setGraphicsSetting('enableSMAA', v)}
            />
            <Toggle
              label={t('depthOfField')}
              icon={<Eye size={12} />}
              value={graphics.graphics.enableDepthOfField}
              onChange={(v) => graphics.setGraphicsSetting('enableDepthOfField', v)}
            />
          </div>

          {/* Particles & Effects */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              {t('particlesEffects')}
            </div>
            <Toggle
              label={t('dustParticles')}
              icon={<Wind size={12} />}
              value={graphics.graphics.enableDustParticles}
              onChange={(v) => graphics.setGraphicsSetting('enableDustParticles', v)}
            />
            <Toggle
              label={t('grainFlow')}
              icon={<Wind size={12} />}
              value={graphics.graphics.enableGrainFlow}
              onChange={(v) => graphics.setGraphicsSetting('enableGrainFlow', v)}
            />
          </div>

          {/* Scene & Machines */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              {t('sceneMachines')}
            </div>
            <Toggle
              label={t('wireframeMode')}
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
              label={t('highResShadows')}
              icon={<Eye size={12} />}
              value={graphics.graphics.enableHighResShadows}
              onChange={(v) => graphics.setGraphicsSetting('enableHighResShadows', v)}
            />
            <Toggle
              label={t('audioReactive')}
              icon={<Activity size={12} />}
              value={graphics.graphics.enableAudioReactive}
              onChange={(v) => graphics.setGraphicsSetting('enableAudioReactive', v)}
            />
            {setShowZones && (
              <Toggle
                label={t('zoneMarkers')}
                icon={<Grid3X3 size={12} />}
                value={showZones ?? true}
                onChange={setShowZones}
              />
            )}
            {/* The status bar's readout; millos-ui keeps the choice. The compact
                layout mounts no status bar, so the switch is not offered there. */}
            {!isCompactLayout && (
              <Toggle
                label={t('fpsCounter')}
                icon={<Activity size={12} />}
                value={showFPSCounter}
                onChange={setShowFPSCounter}
              />
            )}
          </div>

          {/* Resolution Scale Slider */}
          <div className="pt-2 border-t border-white/5">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Monitor size={12} className="text-slate-300" aria-hidden="true" />
                <label htmlFor="resolution-scale-slider" className="text-xs text-slate-200">
                  {t('resolutionScale')}
                </label>
              </div>
              <output
                htmlFor="resolution-scale-slider"
                className="text-[10px] font-mono font-bold text-cyan-400"
              >
                {shownResolutionPercent}%
              </output>
            </div>
            <input
              id="resolution-scale-slider"
              type="range"
              min={String(resolutionFloor)}
              max={String(resolutionCeiling)}
              step="0.05"
              value={shownResolutionScale}
              onChange={(e) =>
                graphics.setGraphicsSetting('resolutionScale', parseFloat(e.target.value))
              }
              aria-label={t('resolutionScaleLabel')}
              aria-valuemin={resolutionFloorPercent}
              aria-valuemax={resolutionCeilingPercent}
              aria-valuenow={shownResolutionPercent}
              aria-valuetext={t('percentValue', {
                value: formatFixed(shownResolutionPercent, 0),
              })}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[9px] text-slate-400 mt-1" aria-hidden="true">
              {resolutionFloorPercent % 25 !== 0 && <span>{resolutionFloorPercent}%</span>}
              {[25, 50, 75, 100]
                .filter(
                  (percent) =>
                    percent >= resolutionFloorPercent && percent <= resolutionCeilingPercent
                )
                .map((percent) => (
                  <span key={percent}>{percent}%</span>
                ))}
              {resolutionCeilingPercent % 25 !== 0 &&
                resolutionCeilingPercent !== resolutionFloorPercent && (
                  <span>{resolutionCeilingPercent}%</span>
                )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Monitor size={14} className="text-cyan-400" aria-hidden="true" />
          {t('interfaceAccessibility')}
        </h3>
        <div className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="ui-scale-slider" className="text-xs text-slate-200">
              {t('interfaceScale')}
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
            aria-valuetext={t('percentValue', { value: formatFixed(Math.round(uiScale * 100), 0) })}
            className="w-full cursor-pointer accent-cyan-500"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {t('interfaceScaleHelp')}
          </p>
          {FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED && (
            <fieldset className="mt-3 space-y-2 border-t border-white/5 pt-3">
              <legend className="text-xs font-medium text-slate-200">{t('reduceMotion')}</legend>
              <div
                className="grid grid-cols-2 gap-1"
                role="radiogroup"
                aria-label={t('reduceMotion')}
                aria-describedby="reduce-motion-help"
              >
                {(
                  [
                    ['system', t('reduceMotionSystem')],
                    ['reduce', t('reduceMotionOn')],
                  ] as const satisfies ReadonlyArray<readonly [MotionPreferenceMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={motionMode === mode}
                    onClick={() => setMotionMode(mode)}
                    className={`min-h-10 rounded-lg px-2 text-[10px] font-semibold transition-colors ${
                      motionMode === mode
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                        : 'bg-slate-900/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p id="reduce-motion-help" className="text-[11px] leading-relaxed text-slate-400">
                {t('reduceMotionHelp')}
              </p>
            </fieldset>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Download size={14} className="text-emerald-400" aria-hidden="true" />
          {t('diagnosticReplay')}
        </h3>
        <div className="space-y-3 rounded-xl border border-white/5 bg-slate-800/50 p-3">
          <p className="text-[11px] leading-relaxed text-slate-400">{t('diagnosticReplayHelp')}</p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-900/60 p-2">
              <div className="font-mono text-lg text-white">
                {formatFixed(replayFrames.length, 0)}
              </div>
              <div className="text-slate-400">{t('frames')}</div>
            </div>
            <div className="rounded-lg bg-slate-900/60 p-2">
              <div className="font-mono text-lg text-white">
                {formatFixed(diagnosticCommands.length, 0)}
              </div>
              <div className="text-slate-400">{t('commands')}</div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={replayFrames.length === 0}
              onClick={() => setReplayMode(true)}
              className="min-h-10 rounded-lg bg-cyan-600 px-3 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('enterReplay')}
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
              {t('exportJson')}
            </button>
            <button
              type="button"
              onClick={clearDiagnostics}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-600"
            >
              <Trash2 size={12} aria-hidden="true" />
              {t('clearBuffer')}
            </button>
          </div>
        </div>
      </section>

      <BuildCacheDiagnostics />

      {/* Simulation Reset Section */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <RotateCcw size={14} className="text-amber-500" aria-hidden="true" />
          {t('simulation')}
        </h3>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 space-y-2">
          <button
            onClick={() => setResetConfirm('day')}
            className="w-full py-2 rounded-lg text-xs font-medium bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 flex items-center justify-center gap-2 transition-colors"
          >
            {t('resetToTen')}
          </button>
          <button
            onClick={() => setResetConfirm('full')}
            className="w-full py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-900/20 flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw size={12} aria-hidden="true" />
            {t('resetSimulation')}
          </button>
        </div>
      </section>

      {/* Reset to 10am confirmation */}
      <ConfirmDialog
        isOpen={resetConfirm === 'day'}
        title={t('resetToTen')}
        tone="amber"
        confirmLabel={t('resetToTen')}
        message={t('resetDayMessage')}
        onCancel={() => setResetConfirm(null)}
        onConfirm={() => {
          clearPersistedState();
          setResetConfirm(null);
        }}
      />

      {/* Full reset confirmation (destructive) */}
      <ConfirmDialog
        isOpen={resetConfirm === 'full'}
        title={t('resetSimulation')}
        tone="red"
        busy={fullResetRunning}
        confirmLabel={fullResetRunning ? t('resetting') : t('resetEverything')}
        message={
          FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED
            ? t('resetFullMessageWithMotion')
            : t('resetFullMessage')
        }
        onCancel={() => setResetConfirm(null)}
        onConfirm={() => {
          // The reload waits on the historian clear; a second press meanwhile
          // must not stop the service or clear again.
          if (fullResetStartedRef.current) return;
          fullResetStartedRef.current = true;
          // Cancel, the backdrop and Escape would close the dialog over a
          // paused plant that reloads anyway; it says the reset is running.
          setFullResetRunning(true);
          // Clear every persisted MillOS store (keys are namespaced "millos-*").
          // This includes millos-graphics and millos-ai-config (AI preferences).
          // Cloud API keys live in page memory and vanish on the reload below.
          // Pause first, then suspend persistence: the tick keeps running until
          // the reload commits, and its writes would restore the old orders and
          // clock. The GPU resource cache writes outside the shared store
          // storage, so it is suspended separately. Sound (mute, volume, music),
          // language and reduced motion are the person's preferences, not
          // simulation state.
          // Working if: no millos-* key survives the reload except those three
          // and the interface scale, and the SCADA trend history is empty after it.
          useGameSimulationStore.getState().setGameSpeed(0);
          suspendPersistence();
          suspendResourcePersistence();
          const keptKeys = new Set([
            LOCALE_STORAGE_KEY,
            AUDIO_SETTINGS_KEY,
            MOTION_PREFERENCE_STORAGE_KEY,
          ]);
          // Interface scale is an accessibility preference too, but it shares
          // millos-ui with tour and journey state: carry the scale alone
          // across the sweep. An unreadable record costs the scale, never the
          // sweep (the store already rehydrates past one).
          let uiScale: number | undefined;
          try {
            uiScale = sanitizeUIState(
              JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? 'null')?.state
            ).uiScale;
          } catch {
            uiScale = undefined;
          }
          // Blocked site data throws on the first read. Nothing was saved then,
          // so the reload alone is the reset; it must still happen.
          try {
            Object.keys(localStorage)
              .filter((key) => key.startsWith('millos-') && !keptKeys.has(key))
              .forEach((key) => localStorage.removeItem(key));
            if (uiScale !== undefined && uiScale !== 1) {
              localStorage.setItem(
                UI_STORAGE_KEY,
                JSON.stringify({ state: { uiScale }, version: UI_STORAGE_VERSION })
              );
            }
          } catch {
            // Nothing to sweep: storage is unavailable.
          }
          // No graphics write here: the reload boots the default medium preset,
          // and any store write would persist millos-graphics straight back.
          void clearScadaHistoryBounded().then(() => window.location.reload());
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
}> = ({ label, icon, value, onChange }) => {
  const t = useT(settingsPanelMessages);
  return (
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
        <span className={value ? 'text-green-300' : 'text-slate-400'}>
          {value ? t('toggleOn') : t('toggleOff')}
        </span>
        <span
          className={`w-2 h-2 rounded-full ${value ? 'bg-green-400' : 'bg-slate-500'}`}
          aria-hidden="true"
        />
      </span>
    </button>
  );
};
