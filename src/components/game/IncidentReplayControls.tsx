import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { useIncidentReplayStore, type ReplayFrame } from '../../stores/incidentReplayStore';
import { useProductionStore } from '../../stores/productionStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useShallow } from 'zustand/react/shallow';
import { formatFixed, useT } from '../../i18n';
import { formatTime } from '../../utils/timeFormatting';
import { alertText } from '../../i18n/alertCopy';
import { incidentReplayControlsMessages } from './IncidentReplayControls.messages';

const LISTED_ITEMS = 3;

/** HH:MM on the plant clock from fractional game hours. */
const plantClockTime = (hour: number): string => {
  const minuteOfDay = Math.floor((((hour % 24) + 24) % 24) * 60 + 1e-6);
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
};

const hasPlantClock = (
  clock: ReplayFrame['gameClock']
): clock is NonNullable<ReplayFrame['gameClock']> =>
  !!clock && Number.isFinite(clock.day) && Number.isFinite(clock.hour);

export const IncidentReplayControls: React.FC = () => {
  const t = useT(incidentReplayControlsMessages);
  // Select from the owning store. productionStore's replay getters are
  // flattened into plain values by its first set(), so they never update.
  const { replayMode, replayFrames, currentReplayIndex, setReplayMode, setReplayIndex } =
    useIncidentReplayStore(
      useShallow((state) => ({
        replayMode: state.replayMode,
        replayFrames: state.replayFrames,
        currentReplayIndex: state.currentReplayIndex,
        setReplayMode: state.setReplayMode,
        setReplayIndex: state.setReplayIndex,
      }))
    );

  const [isPlaying, setIsPlaying] = useState(false);
  // Names for the machine ids a frame recorded; ids are the fallback.
  const machines = useProductionStore((state) => state.machines);

  // Exit unmounts this bar with the focused button in it; hand focus back to
  // whatever opened the replay (the Settings button) rather than to <body>.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!replayMode) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    // On a phone, Enter replay is pressed in the Settings sheet, and while a
    // sheet is open this bar's root is inert and covered. Hand the screen to
    // the replay, as Replay getting started does for the tour.
    const mobile = useMobileControlStore.getState();
    if (mobile.mobilePanelVisible) mobile.closeMobilePanel();
  }, [replayMode]);
  const restoreOpenerFocus = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
  }, []);

  useEffect(() => {
    if (!isPlaying || !replayMode || replayFrames.length === 0) return;

    const interval = setInterval(() => {
      setReplayIndex((currentReplayIndex + 1) % replayFrames.length);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, replayMode, currentReplayIndex, replayFrames.length, setReplayIndex]);

  useEffect(() => {
    if (replayMode && replayFrames.length === 0) {
      setReplayMode(false);
      setIsPlaying(false);
    }
  }, [replayFrames.length, replayMode, setReplayMode]);

  // Memoized handlers to prevent re-renders
  const handleSkipBack = useCallback(() => {
    setReplayIndex(Math.max(0, currentReplayIndex - 10));
  }, [setReplayIndex, currentReplayIndex]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSkipForward = useCallback(() => {
    setReplayIndex(Math.min(replayFrames.length - 1, currentReplayIndex + 10));
  }, [setReplayIndex, replayFrames.length, currentReplayIndex]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setReplayIndex(parseInt(e.target.value));
    },
    [setReplayIndex]
  );

  const handleExitReplay = useCallback(() => {
    setReplayMode(false);
    setIsPlaying(false);
    restoreOpenerFocus();
  }, [setReplayMode, restoreOpenerFocus]);

  if (!replayMode) return null;

  const frame = replayFrames[currentReplayIndex];
  const frameTime = frame?.timestamp;
  // Player-facing event times read on the plant clock (as the maintenance log
  // does); a frame recorded without one falls back to its capture time.
  const frameLabel = hasPlantClock(frame?.gameClock)
    ? t('gameStamp', {
        day: formatFixed(Math.max(0, Math.floor(frame.gameClock.day)) + 1, 0),
        time: plantClockTime(frame.gameClock.hour),
      })
    : frameTime
      ? formatTime(frameTime, { seconds: true })
      : null;

  // What the plant looked like in this frame: the status tally, the machines
  // in a fault, and the alerts standing at the time.
  const nameOf = (id: string) => machines?.find((machine) => machine.id === id)?.name || id;
  const listed = (items: string[]) =>
    items.length > LISTED_ITEMS
      ? `${items.slice(0, LISTED_ITEMS).join(', ')} ${t('moreItems', {
          count: formatFixed(items.length - LISTED_ITEMS, 0),
        })}`
      : items.join(', ');
  const idsWith = (status: string) =>
    (frame?.machineStates ?? []).filter((state) => state.status === status).map((s) => s.id);
  const running = idsWith('running');
  const idle = idsWith('idle');
  const warning = idsWith('warning');
  const critical = idsWith('critical');
  const frameStatus = [
    running.length > 0 ? t('statusRunning', { count: formatFixed(running.length, 0) }) : null,
    idle.length > 0 ? t('statusIdle', { count: formatFixed(idle.length, 0) }) : null,
    warning.length > 0
      ? t('statusMachines', {
          status: t('statusWarning', { count: formatFixed(warning.length, 0) }),
          machines: listed(warning.map(nameOf)),
        })
      : null,
    critical.length > 0
      ? t('statusMachines', {
          status: t('statusCritical', { count: formatFixed(critical.length, 0) }),
          machines: listed(critical.map(nameOf)),
        })
      : null,
  ].filter((entry): entry is string => entry !== null);
  const frameAlerts = frame?.alerts ?? [];

  // Sits above the dock (bottom-6, z-50) and the always-present music player
  // (bottom-[6.75rem]). At bottom-4 the play and skip buttons were behind the dock.
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-[11.5rem] left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-red-500/30 px-4 py-3 shadow-2xl">
        <div className="flex items-center gap-4">
          {/* Label */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-medium text-sm">{t('replayMode')}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkipBack}
              aria-label={t('skipBack')}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handleTogglePlay}
              aria-label={isPlaying ? t('pauseReplay') : t('playReplay')}
              aria-pressed={isPlaying}
              className="w-10 h-10 rounded-lg bg-red-600 hover:bg-red-500 text-white flex items-center justify-center"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={handleSkipForward}
              aria-label={t('skipForward')}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Timeline */}
          <div className="flex-1 min-w-[150px]">
            <label htmlFor="replay-timeline" className="sr-only">
              {t('timeline')}
            </label>
            <input
              id="replay-timeline"
              type="range"
              min={0}
              max={replayFrames.length - 1}
              value={currentReplayIndex}
              onChange={handleSliderChange}
              aria-label={t('timelineAria')}
              aria-valuemin={0}
              aria-valuemax={replayFrames.length - 1}
              aria-valuenow={currentReplayIndex}
              aria-valuetext={`${t('frameOfCount', {
                frame: formatFixed(currentReplayIndex + 1, 0),
                count: formatFixed(replayFrames.length, 0),
              })}${frameLabel ? t('capturedAt', { time: frameLabel }) : ''}`}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>
                {t('frameNumber', { frame: formatFixed(currentReplayIndex + 1, 0) })}
                {frameLabel ? ` · ${frameLabel}` : ''}
              </span>
              <span>{t('totalFrames', { count: formatFixed(replayFrames.length, 0) })}</span>
            </div>
          </div>

          {/* Exit button */}
          <button
            onClick={handleExitReplay}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"
          >
            {t('exitReplay')}
          </button>
        </div>
        {frameStatus.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
            {frameStatus.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </div>
        )}
        {frameAlerts.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
            {frameAlerts.slice(0, LISTED_ITEMS).map((alert) => (
              <li key={alert.id}>
                {alertText({ title: '', message: alert.message, copy: alert.copy }).message}
              </li>
            ))}
            {frameAlerts.length > LISTED_ITEMS && (
              <li>
                {t('moreItems', { count: formatFixed(frameAlerts.length - LISTED_ITEMS, 0) })}
              </li>
            )}
          </ul>
        )}
      </div>
    </motion.div>
  );
};
