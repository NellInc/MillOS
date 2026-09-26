import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Map, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { positionRegistry, type EntityPosition } from '../../utils/positionRegistry';
import { FACTORY_ZONE_Z } from '../../constants/siteLayout';

// True top-down view matching the overview camera: +x right, -z (the far side
// of the site) up. The tick is a bar hanging down from the dot, so rotate()
// must carry screen (0, 1) onto the heading (dirX, dirZ).
const ZONE_LABELS = [
  { label: 'Packing', z: FACTORY_ZONE_Z.packing },
  { label: 'Sifters', z: FACTORY_ZONE_Z.sifting },
  { label: 'Mills', z: FACTORY_ZONE_Z.milling },
] as const;

export const MiniMap: React.FC = () => {
  const { showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const [positions, setPositions] = useState<{ forklifts: EntityPosition[] }>({ forklifts: [] });

  useEffect(() => {
    if (!showMiniMap) return;

    // PERFORMANCE FIX: Reduced from 100ms (10Hz) to 500ms (2Hz)
    // 10Hz was excessive for a mini map - 2Hz is sufficient
    const interval = setInterval(() => {
      setPositions({
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

  // Bottom-left, above the production target widget (about 17rem tall when
  // expanded): the bottom-right corner is
  // the camera preset readout and the context sidebar's footer, which the map
  // used to cover at z-[100]. z-30 keeps it below the sidebar (z-40) and the
  // emergency and PA overlays (z-[60]). It stays draggable.
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed bottom-[17.5rem] left-4 z-30 pointer-events-auto cursor-move"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-white">Fleet Map</span>
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

          {/* Zone indicators, placed at each zone's real z. The silo pad sits at
              x=65, outside the mapped +/-60 m, so it has no label here. */}
          {ZONE_LABELS.map(({ label, z }) => (
            <div
              key={label}
              className="absolute left-2 -translate-y-1/2 text-[8px] text-slate-400"
              style={{ top: offsetZ + (z * mapScale) / 2 }}
            >
              {label}
            </div>
          ))}

          {/* Forklifts */}
          {positions.forklifts.map((forklift) => (
            <div
              key={forklift.id}
              className="absolute"
              style={{
                left: offsetX + (forklift.x * mapScale) / 2,
                top: offsetZ + (forklift.z * mapScale) / 2,
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
                    transform: `translateX(-50%) rotate(${Math.atan2(-forklift.dirX, forklift.dirZ) * (180 / Math.PI)}deg)`,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-amber-500 rounded-sm" />
            <span className="text-[9px] text-slate-400">Forklifts</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
