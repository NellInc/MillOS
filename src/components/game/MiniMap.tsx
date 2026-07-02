import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Map, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { positionRegistry, type EntityPosition } from '../../utils/positionRegistry';

export const MiniMap: React.FC = () => {
  const { showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const [positions, setPositions] = useState<{
    workers: EntityPosition[];
    forklifts: EntityPosition[];
  }>({ workers: [], forklifts: [] });

  useEffect(() => {
    if (!showMiniMap) return;

    // PERFORMANCE FIX: Reduced from 100ms (10Hz) to 500ms (2Hz)
    // 10Hz was excessive for a mini map - 2Hz is sufficient
    const interval = setInterval(() => {
      setPositions({
        workers: positionRegistry.getAllWorkers(),
        forklifts: positionRegistry.getAllForklifts(),
      });
    }, 500);

    return () => clearInterval(interval);
  }, [showMiniMap]);

  if (!showMiniMap) return null;

  const mapScale = 3; // Pixels per meter
  const mapWidth = 180;
  const mapHeight = 140;
  const offsetX = mapWidth / 2;
  const offsetZ = mapHeight / 2;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed bottom-4 right-4 z-[100] pointer-events-auto cursor-move"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-white">GPS Tracking</span>
          </div>
          <button
            onClick={() => setShowMiniMap(false)}
            aria-label="Close mini map"
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-700 transition-colors"
          >
            <X className="w-3 h-3 text-slate-400" />
          </button>
        </div>

        {/* Map area */}
        <div className="relative bg-slate-950" style={{ width: mapWidth, height: mapHeight }}>
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-20">
            {[0, 1, 2, 3].map((i) => (
              <React.Fragment key={i}>
                <div
                  className="absolute w-px bg-slate-600"
                  style={{ left: `${(i + 1) * 25}%`, top: 0, bottom: 0 }}
                />
                <div
                  className="absolute h-px bg-slate-600"
                  style={{ top: `${(i + 1) * 25}%`, left: 0, right: 0 }}
                />
              </React.Fragment>
            ))}
          </div>

          {/* Zone indicators */}
          <div className="absolute left-2 top-2 text-[8px] text-slate-400">Silos</div>
          <div className="absolute left-2 top-1/4 text-[8px] text-slate-400">Mills</div>
          <div className="absolute left-2 bottom-1/4 text-[8px] text-slate-400">Sifters</div>
          <div className="absolute left-2 bottom-2 text-[8px] text-slate-400">Packers</div>

          {/* Workers */}
          {positions.workers.map((worker) => (
            <div
              key={worker.id}
              className="absolute w-2 h-2 rounded-full bg-green-500 border border-green-300"
              style={{
                left: offsetX + (worker.x * mapScale) / 2,
                top: offsetZ - (worker.z * mapScale) / 2,
                transform: 'translate(-50%, -50%)',
              }}
              title={worker.id}
            />
          ))}

          {/* Forklifts */}
          {positions.forklifts.map((forklift) => (
            <div
              key={forklift.id}
              className="absolute"
              style={{
                left: offsetX + (forklift.x * mapScale) / 2,
                top: offsetZ - (forklift.z * mapScale) / 2,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-3 h-3 bg-amber-500 rounded-sm border border-amber-300" />
              {/* Direction indicator */}
              {forklift.dirX !== undefined && forklift.dirZ !== undefined && (
                <div
                  className="absolute w-0.5 h-2 bg-amber-300"
                  style={{
                    left: '50%',
                    top: '50%',
                    transformOrigin: 'center top',
                    transform: `translateX(-50%) rotate(${Math.atan2(forklift.dirX, -forklift.dirZ) * (180 / Math.PI)}deg)`,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[9px] text-slate-400">Workers</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-amber-500 rounded-sm" />
            <span className="text-[9px] text-slate-400">Forklifts</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
