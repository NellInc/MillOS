import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, TrendingUp, History, Map } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useProductionStore } from '../../stores/productionStore';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';
import { useShallow } from 'zustand/react/shallow';
import { AchievementsPanel } from './AchievementsPanel';
import { WorkerLeaderboard } from './WorkerLeaderboard';
import { ScreenshotButton } from './ScreenshotButton';

export const GamificationBar: React.FC = () => {
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const { showMiniMap, setShowMiniMap, showGamificationBar, setShowGamificationBar } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
      showGamificationBar: state.showGamificationBar,
      setShowGamificationBar: state.setShowGamificationBar,
    }))
  );
  const achievements = useProductionStore((state) => state.achievements);
  const isReplaying = useHistoricalPlaybackStore((s) => s.isReplaying);

  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;

  // Memoized handlers to prevent re-renders
  const handleHideBar = useCallback(() => setShowGamificationBar(false), [setShowGamificationBar]);
  const handleToggleAchievements = useCallback(() => setShowAchievements((prev) => !prev), []);
  const handleToggleLeaderboard = useCallback(() => setShowLeaderboard((prev) => !prev), []);
  const handleToggleMiniMap = useCallback(
    () => setShowMiniMap(!showMiniMap),
    [setShowMiniMap, showMiniMap]
  );

  // Return null when bar is hidden - the Zap button is now in CollapsibleLegend
  if (!showGamificationBar) {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        drag
        dragMomentum={false}
        dragElastic={0}
        className="fixed right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-auto cursor-move"
      >
        <div className="flex flex-col gap-2 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 p-2">
          {/* Close button */}
          <button
            onClick={handleHideBar}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
            title="Close Quick Actions"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="border-t border-slate-700 my-1" />
          {/* Achievements */}
          <button
            onClick={handleToggleAchievements}
            aria-expanded={showAchievements}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative ${
              showAchievements
                ? 'bg-yellow-600 text-white'
                : 'bg-slate-800 text-yellow-400 hover:bg-slate-700'
            }`}
            title="Achievements"
          >
            <Trophy className="w-5 h-5" />
            {unlockedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {unlockedCount}
              </span>
            )}
          </button>

          {/* Leaderboard */}
          <button
            onClick={handleToggleLeaderboard}
            aria-expanded={showLeaderboard}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              showLeaderboard
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'
            }`}
            title="Leaderboard"
          >
            <TrendingUp className="w-5 h-5" />
          </button>

          {/* Replay/History - Moved here from 'R' key */}
          <button
            onClick={() => {
              const playbackStore = useHistoricalPlaybackStore.getState();
              if (playbackStore.isReplaying) {
                playbackStore.exitReplayMode();
              } else {
                playbackStore.enterReplayMode();
              }
            }}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isReplaying ? 'bg-red-600 text-white' : 'bg-slate-800 text-red-400 hover:bg-slate-700'
            }`}
            title="Replay History"
          >
            <History className="w-5 h-5" />
          </button>

          {/* Mini-map toggle */}
          <button
            onClick={handleToggleMiniMap}
            aria-pressed={showMiniMap}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              showMiniMap
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-green-400 hover:bg-slate-700'
            }`}
            title="GPS Tracking"
          >
            <Map className="w-5 h-5" />
          </button>

          {/* Screenshot/Export */}
          <div className="pt-2 border-t border-slate-700">
            <ScreenshotButton />
          </div>
        </div>
      </motion.div>

      {/* Panels */}
      <AnimatePresence>
        {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
        {showLeaderboard && <WorkerLeaderboard onClose={() => setShowLeaderboard(false)} />}
      </AnimatePresence>
    </>
  );
};
