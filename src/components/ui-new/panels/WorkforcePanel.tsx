/**
 * WorkforcePanel Component
 *
 * Displays all workers with their current stats including
 * task, energy level, satisfaction, and productivity.
 * Clicking a worker shows their detail view inline with a back button.
 */

import React, { useState, Suspense, lazy } from 'react';
import { Zap, Heart, Briefcase, ArrowLeft } from 'lucide-react';
import { WORKER_ROSTER, WorkerData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { useShallow } from 'zustand/react/shallow';
import { getWorkerPortrait } from '../../../utils/workerPortraits';

// Lazy load the heavy worker detail panel
const WorkerDetailPanel = lazy(() =>
  import('../../WorkerDetailPanel').then((m) => ({ default: m.WorkerDetailPanel }))
);

export const WorkforcePanel: React.FC = () => {
  // Internal state for selected worker (shown inline)
  const [selectedWorker, setSelectedWorker] = useState<WorkerData | null>(null);

  // Get dynamic worker data from store (positions, tasks, etc.)
  const storeWorkers = useProductionStore(useShallow((state) => state.workers));

  // Get worker moods (energy, satisfaction) from mood store
  const workerMoods = useWorkerMoodStore(useShallow((state) => state.workerMoods));

  // Use store workers if available, otherwise fall back to static roster
  const workers =
    storeWorkers.length > 0
      ? storeWorkers
      : WORKER_ROSTER.map((w) => ({
        ...w,
        position: [0, 0, 0] as [number, number, number],
        direction: 1 as const,
      }));

  // Calculate workforce stats using mood data
  const activeCount = workers.filter((w) => w.currentTask !== 'idle').length;
  const avgEnergy =
    workers.length > 0
      ? workers.reduce((sum, w) => {
        const mood = workerMoods[w.id];
        return sum + (mood?.energy ?? 100);
      }, 0) / workers.length
      : 100;
  const avgSatisfaction =
    workers.length > 0
      ? workers.reduce((sum, w) => {
        const mood = workerMoods[w.id];
        return sum + (mood?.satisfaction ?? 80);
      }, 0) / workers.length
      : 80;

  // If a worker is selected, show their detail view with back button
  if (selectedWorker) {
    return (
      <div className="h-full flex flex-col">
        {/* Back button header */}
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <button
            onClick={() => setSelectedWorker(null)}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Workforce</span>
          </button>
        </div>

        {/* Worker detail content */}
        <div className="flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-32 text-cyan-500 animate-pulse">
                Loading...
              </div>
            }
          >
            <WorkerDetailPanel
              worker={selectedWorker}
              onClose={() => setSelectedWorker(null)}
              embedded={true}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // Default: show worker list
  return (
    <div className="p-3 h-full overflow-y-auto space-y-3">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-cyan-400">{workers.length}</div>
          <div className="text-[10px] text-slate-400 uppercase">Total</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-amber-400">{avgEnergy.toFixed(0)}%</div>
          <div className="text-[10px] text-slate-400 uppercase">Avg Energy</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-pink-400">{avgSatisfaction.toFixed(0)}%</div>
          <div className="text-[10px] text-slate-400 uppercase">Satisfaction</div>
        </div>
      </div>

      {/* Worker List */}
      <div className="space-y-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
          All Workers ({activeCount} active)
        </div>
        {workers.map((worker) => {
          const portrait = getWorkerPortrait(worker.id);
          const mood = workerMoods[worker.id];
          const energy = mood?.energy ?? 100;
          const satisfaction = mood?.satisfaction ?? 80;

          return (
            <button
              key={worker.id}
              onClick={() => setSelectedWorker(worker as WorkerData)}
              className="w-full bg-slate-800/50 rounded-lg p-2 flex items-center gap-2 hover:bg-slate-700/50 transition-colors cursor-pointer text-left"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {portrait ? (
                  <img
                    src={portrait}
                    alt={worker.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-white text-sm font-bold">
                    {worker.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white truncate">{worker.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{worker.role}</div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Briefcase className="w-3 h-3" />
                  <span className="truncate">{worker.currentTask || 'Idle'}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                {/* Energy */}
                <div className="flex items-center gap-1">
                  <Zap
                    className={`w-3 h-3 ${energy > 70
                        ? 'text-green-400'
                        : energy > 40
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                  />
                  <span className="text-[10px] text-slate-300 w-7">{Math.round(energy)}%</span>
                </div>

                {/* Satisfaction */}
                <div className="flex items-center gap-1">
                  <Heart
                    className={`w-3 h-3 ${satisfaction > 70
                        ? 'text-pink-400'
                        : satisfaction > 40
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                  />
                  <span className="text-[10px] text-slate-300 w-7">
                    {Math.round(satisfaction)}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
