import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, X, Star, RotateCcw } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { getIconComponent, getCategoryColor } from './shared';

export const AchievementsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const achievements = useProductionStore((state) => state.achievements);
  const resetAchievements = useProductionStore((state) => state.resetAchievements);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'safety':
        return 'text-green-400 bg-green-500/20';
      case 'production':
        return 'text-blue-400 bg-blue-500/20';
      case 'quality':
        return 'text-purple-400 bg-purple-500/20';
      case 'teamwork':
        return 'text-amber-400 bg-amber-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Shield':
        return Shield;
      case 'Package':
        return Package;
      case 'Award':
        return Award;
      case 'Users':
        return Users;
      case 'TrendingUp':
        return TrendingUp;
      case 'Moon':
        return Moon;
      case 'Siren':
        return AlertTriangle; // Using AlertTriangle as Siren fallback
      case 'Boxes':
        return Package; // Using Package as Boxes fallback
      default:
        return Trophy;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed top-20 right-4 w-80 bg-slate-900/98 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-50 flex flex-col max-h-[70vh] pointer-events-auto overflow-hidden"
    >
      {/* Header - draggable area */}
      <div className="flex items-center justify-between p-3 border-b border-slate-800 cursor-move">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <h2 className="text-base font-bold text-white">Achievements</h2>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Achievement list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {achievements.map((achievement: any) => {
          const IconComponent = getIconComponent(achievement.icon);
          const isUnlocked = !!achievement.unlockedAt;
          const progress =
            achievement.progress ?? (achievement.currentValue / achievement.requirement) * 100;

          return (
            <div
              key={achievement.id}
              className={`p-3 rounded-xl border ${isUnlocked ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-slate-700 bg-slate-800/50'}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(achievement.category)}`}
                >
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium text-sm">{achievement.name}</h3>
                    {isUnlocked && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">{achievement.description}</p>

                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-500">Progress</span>
                      <span className="text-slate-400">
                        {achievement.currentValue} / {achievement.requirement}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnlocked ? 'bg-yellow-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with reset button */}
      <div className="p-2 border-t border-slate-800 flex justify-end">
        <button
          onClick={resetAchievements}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          title="Reset all achievements"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
    </motion.div>
  );
};
