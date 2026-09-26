import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, History, Map } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';
import { useShallow } from 'zustand/react/shallow';
import { AchievementsPanel } from './AchievementsPanel';
import { ScreenshotButton } from './ScreenshotButton';

export const GamificationBar: React.FC = () => {
  // Shared with OverviewPanel through uiStore so the two toggles drive one panel.
  const showAchievements = useUIStore((state) => state.showAchievements);
  const setShowAchievements = useUIStore((state) => state.setShowAchievements);
  const { showMiniMap, setShowMiniMap, showGamificationBar, setShowGamificationBar } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
      showGamificationBar: state.showGamificationBar,
      setShowGamificationBar: state.setShowGamificationBar,
    }))
  );
  const achievements = useAchievementsStore((state) => state.achievements);
  const isReplaying = useHistoricalPlaybackStore((s) => s.isReplaying);

  // Same visibility rule as AchievementsPanel: untracked goals are not counted.
  const unlockedCount = achievements.filter((a) => a.tracked !== false && a.unlockedAt).length;

  // Memoized handlers to prevent re-renders
  const handleHideBar = useCallback(() => setShowGamificationBar(false), [setShowGamificationBar]);
  const handleToggleAchievements = useCallback(
    () => setShowAchievements(!showAchievements),
    [setShowAchievements, showAchievements]
  );
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
            aria-label={
              unlockedCount > 0 ? `Achievements, ${unlockedCount} unlocked` : 'Achievements'
            }
          >
            <Trophy className="w-5 h-5" />
            {unlockedCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center"
              >
                {unlockedCount}
              </span>
            )}
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
            aria-pressed={isReplaying}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isReplaying ? 'bg-red-600 text-white' : 'bg-slate-800 text-red-400 hover:bg-slate-700'
            }`}
            title={isReplaying ? 'Exit replay' : 'Replay history'}
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
            title="Mini-map"
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
      </AnimatePresence>
    </>
  );
};
