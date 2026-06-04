import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ChevronUp, ChevronDown } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { audioManager } from '../../utils/audioManager';

export const ProductionTargetsWidget: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const productionTarget = useProductionStore((state) => state.productionTarget);
  const totalBagsProduced = useProductionStore((state) => state.totalBagsProduced);

  const progress = productionTarget
    ? (productionTarget.producedBags / productionTarget.targetBags) * 100
    : 0;
  const isComplete = progress >= 100;
  const isOnTrack = progress >= 50; // Simplified check

  // Play victory fanfare when quota reaches 100%
  useEffect(() => {
    if (!productionTarget) return;
    if (isComplete) {
      audioManager.playVictoryFanfare();
    } else {
      // Reset the flag when quota drops below 100% (e.g., new day)
      audioManager.resetQuotaFlag();
    }
  }, [isComplete, productionTarget]);

  if (!productionTarget) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="production-target-details"
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target className={`w-5 h-5 ${isComplete ? 'text-green-400' : 'text-cyan-400'}`} />
          <span className="text-white font-medium text-sm">Daily Target</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${isComplete ? 'text-green-400' : 'text-cyan-400'}`}>
            {progress.toFixed(0)}%
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Progress bar always visible */}
      <div className="px-3 pb-2">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={{ duration: 0.5 }}
            className={`h-full rounded-full ${isComplete ? 'bg-green-500' : isOnTrack ? 'bg-cyan-500' : 'bg-amber-500'}`}
          />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="production-target-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-slate-800 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Bags Produced</span>
                <span className="text-white font-mono">
                  {productionTarget.producedBags.toLocaleString()} /{' '}
                  {productionTarget.targetBags.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">All-Time Total</span>
                <span className="text-cyan-400 font-mono">
                  {totalBagsProduced.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Status</span>
                <span
                  className={`font-medium ${isComplete ? 'text-green-400' : isOnTrack ? 'text-cyan-400' : 'text-amber-400'}`}
                >
                  {isComplete ? 'Completed!' : isOnTrack ? 'On Track' : 'Behind Schedule'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
