import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';

export const IncidentReplayControls: React.FC = () => {
  const {
    replayMode,
    replayFrames,
    currentReplayIndex,
    setReplayMode,
    setReplayIndex,
    clearReplayFrames,
  } = useProductionStore(
    useShallow((state) => ({
      replayMode: state.replayMode,
      replayFrames: state.replayFrames,
      currentReplayIndex: state.currentReplayIndex,
      setReplayMode: state.setReplayMode,
      setReplayIndex: state.setReplayIndex,
      clearReplayFrames: state.clearReplayFrames,
    }))
  );

  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying || !replayMode) return;

    const interval = setInterval(() => {
      setReplayIndex((currentReplayIndex + 1) % replayFrames.length);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, replayMode, currentReplayIndex, replayFrames.length, setReplayIndex]);

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
    clearReplayFrames();
  }, [setReplayMode, clearReplayFrames]);

  if (!replayMode) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-red-500/30 px-4 py-3 shadow-2xl">
        <div className="flex items-center gap-4">
          {/* Label */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-medium text-sm">Replay Mode</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkipBack}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handleTogglePlay}
              className="w-10 h-10 rounded-lg bg-red-600 hover:bg-red-500 text-white flex items-center justify-center"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={handleSkipForward}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Timeline */}
          <div className="flex-1 min-w-[150px]">
            <label htmlFor="replay-timeline" className="sr-only">
              Replay timeline
            </label>
            <input
              id="replay-timeline"
              type="range"
              min={0}
              max={replayFrames.length - 1}
              value={currentReplayIndex}
              onChange={handleSliderChange}
              aria-label="Incident replay timeline"
              aria-valuemin={0}
              aria-valuemax={replayFrames.length - 1}
              aria-valuenow={currentReplayIndex}
              aria-valuetext={`Frame ${currentReplayIndex + 1} of ${replayFrames.length}`}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>Frame {currentReplayIndex + 1}</span>
              <span>{replayFrames.length} total</span>
            </div>
          </div>

          {/* Exit button */}
          <button
            onClick={handleExitReplay}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"
          >
            Exit Replay
          </button>
        </div>
      </div>
    </motion.div>
  );
};
