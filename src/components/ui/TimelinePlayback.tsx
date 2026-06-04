/**
 * TimelinePlayback Component for MillOS
 *
 * Provides timeline scrubber for historical playback mode.
 * Features:
 * - Time range slider (last 24h)
 * - Current time indicator
 * - Decision markers on timeline
 * - Replay controls (play/pause, speed)
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, PauseCircle, SkipBack, X, Clock, Activity, Brain } from 'lucide-react';
import { useHistoricalMode } from '../../hooks/useHistoricalMode';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';

interface TimelinePlaybackProps {
  className?: string;
}

export const TimelinePlayback: React.FC<TimelinePlaybackProps> = ({ className = '' }) => {
  const {
    isReplaying,
    playbackTime,
    availableRange,
    enterReplay,
    exitReplay,
    scrubTo,
    getDecisionsAt,
  } = useHistoricalMode();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const decisionHistory = useHistoricalPlaybackStore((s) => s.decisionHistory);

  // Format timestamp for display
  const formatTime = (ts: number): string => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m ago`;
    return `${mins}m ago`;
  };

  // Auto-play logic
  useEffect(() => {
    if (isPlaying && isReplaying && playbackTime && availableRange) {
      playIntervalRef.current = setInterval(() => {
        const newTime = playbackTime + 1000 * playbackSpeed;
        if (newTime >= availableRange.end) {
          setIsPlaying(false);
        } else {
          scrubTo(newTime);
        }
      }, 100); // Update every 100ms for smooth playback
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, isReplaying, playbackTime, availableRange, playbackSpeed, scrubTo]);

  // Handle slider change
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      scrubTo(value);
      setIsPlaying(false); // Pause when manually scrubbing
    },
    [scrubTo]
  );

  // Jump to start
  const jumpToStart = useCallback(() => {
    if (availableRange) {
      scrubTo(availableRange.start);
      setIsPlaying(false);
    }
  }, [availableRange, scrubTo]);

  // Decisions near current playback time
  const nearbyDecisions = isReplaying && playbackTime ? getDecisionsAt(playbackTime) : [];

  // If not replaying and no available range, show minimal enter button
  if (!isReplaying) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => enterReplay()}
        className={`flex items-center gap-2 px-3 py-2 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700/50 hover:border-cyan-500/50 transition-colors ${className}`}
      >
        <Clock className="w-4 h-4 text-cyan-400" />
        <span className="text-xs text-slate-300">History</span>
      </motion.button>
    );
  }

  // Full playback UI
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={`bg-slate-900/95 backdrop-blur-sm rounded-xl border border-cyan-500/30 shadow-lg shadow-cyan-500/10 p-4 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-cyan-300">REPLAY MODE</span>
          </div>
          <button
            onClick={exitReplay}
            aria-label="Exit replay mode"
            className="p-1 hover:bg-slate-700/50 rounded transition-colors"
          >
            <X className="w-4 h-4 text-slate-400 hover:text-white" aria-hidden="true" />
          </button>
        </div>

        {/* Empty state: replay entered but no telemetry recorded yet */}
        {!availableRange ? (
          <div className="text-center py-6 px-2 text-sm text-slate-400">
            No history recorded yet &mdash; run the simulation to capture timeline data.
          </div>
        ) : (
          <>
            {/* Current Time Display */}
            <div className="text-center mb-3">
              <div className="text-2xl font-mono text-white">
                {playbackTime ? formatTime(playbackTime) : '--:--:--'}
              </div>
              {playbackTime && availableRange && (
                <div className="text-xs text-slate-400">
                  {formatDuration(Date.now() - playbackTime)}
                </div>
              )}
            </div>

            {/* Timeline Slider */}
            {availableRange && (
              <div className="mb-3">
                <input
                  type="range"
                  aria-label="Playback timeline"
                  min={availableRange.start}
                  max={availableRange.end}
                  value={playbackTime ?? availableRange.end}
                  onChange={handleSliderChange}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-cyan-500
                [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{formatTime(availableRange.start)}</span>
                  <span>{formatTime(availableRange.end)}</span>
                </div>
              </div>
            )}

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 mb-3">
              <button
                onClick={jumpToStart}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                aria-label="Jump to start"
                title="Jump to start"
              >
                <SkipBack className="w-5 h-5 text-slate-300" aria-hidden="true" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
                aria-pressed={isPlaying}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                {isPlaying ? (
                  <PauseCircle className="w-8 h-8 text-cyan-400" aria-hidden="true" />
                ) : (
                  <PlayCircle className="w-8 h-8 text-cyan-400" aria-hidden="true" />
                )}
              </button>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                aria-label="Playback speed"
                className="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600"
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
                <option value={10}>10x</option>
              </select>
            </div>

            {/* Decision Markers */}
            {nearbyDecisions.length > 0 && (
              <div className="border-t border-slate-700/50 pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Brain className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] text-purple-300 uppercase tracking-wider">
                    AI Decisions ({nearbyDecisions.length})
                  </span>
                </div>
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {nearbyDecisions.slice(0, 3).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-start gap-2 text-xs bg-slate-800/50 rounded px-2 py-1.5"
                    >
                      <Activity className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-slate-200 truncate">{d.action}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatTime(d.timestamp)} · {d.type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
              <div className="text-center">
                <div className="text-lg font-mono text-cyan-400">{decisionHistory.length}</div>
                <div className="text-[9px] text-slate-400 uppercase">Decisions</div>
              </div>
              {availableRange && (
                <div className="text-center">
                  <div className="text-lg font-mono text-cyan-400">
                    {Math.round((availableRange.end - availableRange.start) / 3600000)}h
                  </div>
                  <div className="text-[9px] text-slate-400 uppercase">History</div>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default TimelinePlayback;
