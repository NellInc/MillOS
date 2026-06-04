import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, X, Medal } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';

export const WorkerLeaderboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const workerLeaderboard = useProductionStore((state) => state.workerLeaderboard);
  const workers = useProductionStore((state) => state.workers);
  const updateWorkerScore = useProductionStore((state) => state.updateWorkerScore);

  // Derive leaderboard from actual workers in the store
  useEffect(() => {
    if (workers.length > 0) {
      // Calculate scores based on worker data: experience, current task, and role
      workers.forEach((worker) => {
        // Base score from experience (years * 100)
        const experienceScore = (worker.experience || 1) * 100;

        // Bonus for currently working (not on break)
        const activityBonus =
          worker.status === 'working' ? 150 : worker.status === 'responding' ? 100 : 0;

        // Role-based multiplier
        const roleMultiplier: Record<string, number> = {
          Supervisor: 1.3,
          Engineer: 1.2,
          'Safety Officer': 1.15,
          'Quality Control': 1.1,
          Maintenance: 1.05,
          Operator: 1.0,
        };
        const multiplier = roleMultiplier[worker.role] || 1.0;

        // Calculate total score
        const totalScore = Math.round((experienceScore + activityBonus) * multiplier);

        // Estimate tasks completed based on experience and current activity
        const tasksCompleted = Math.round(
          (worker.experience || 1) * 8 + (worker.status === 'working' ? 5 : 0)
        );

        updateWorkerScore(worker.id, worker.name, totalScore, tasksCompleted);
      });
    } else if (workerLeaderboard.length === 0) {
      // Fallback only if no workers exist in store at all
      const fallbackWorkers = [
        { id: 'w1', name: 'Marcus Chen', score: 850, tasks: 32 },
        { id: 'w2', name: 'Sarah Mitchell', score: 780, tasks: 28 },
        { id: 'w3', name: 'James Rodriguez', score: 720, tasks: 25 },
      ];
      fallbackWorkers.forEach((w) => updateWorkerScore(w.id, w.name, w.score, w.tasks));
    }
  }, [workers, updateWorkerScore, workerLeaderboard.length]);

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 2:
        return 'bg-slate-400/20 text-slate-300 border-slate-400/50';
      case 3:
        return 'bg-amber-600/20 text-amber-500 border-amber-600/50';
      default:
        return 'bg-slate-800/50 text-slate-400 border-slate-700';
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank <= 3) {
      return (
        <Medal
          className={`w-4 h-4 ${rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : 'text-amber-500'}`}
        />
      );
    }
    return <span className="text-xs font-mono">{rank}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed top-24 right-4 w-80 bg-slate-900/98 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-50 flex flex-col max-h-[60vh] pointer-events-auto overflow-hidden"
    >
      {/* Header - draggable area */}
      <div className="flex items-center justify-between p-3 border-b border-slate-800 cursor-move">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Leaderboard</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close leaderboard"
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Leaderboard list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {workerLeaderboard.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">No leaderboard data yet</div>
        ) : (
          workerLeaderboard.map((worker, index) => (
            <div
              key={worker.workerId}
              className={`flex items-center gap-3 p-2 rounded-lg border ${getRankStyle(index + 1)}`}
            >
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                {getRankIcon(index + 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{worker.name}</div>
                <div className="text-[10px] text-slate-500">{worker.tasksCompleted} tasks</div>
              </div>
              <div className="text-right">
                <div className="text-cyan-400 font-mono font-bold text-sm">{worker.score}</div>
                <div className="text-[10px] text-slate-500">pts</div>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};
