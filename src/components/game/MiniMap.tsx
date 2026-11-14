import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Map, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { positionRegistry, type EntityPosition } from '../../utils/positionRegistry';
import { FACTORY_ZONE_Z, SITE_LAYOUT } from '../../constants/siteLayout';
import { SERVICE_EGRESS_POINTS } from '../../stores/gameSimulationStore';
import { firstPersonPose } from '../../utils/firstPersonPose';
import { useT } from '../../i18n';
import { miniMapMessages } from './MiniMap.messages';
import { focusDockItem } from '../ui-new/dock/focusDockItem';

// True top-down view matching the overview camera: +x right, -z (the far side
// of the site) up. The tick is a bar hanging down from the dot, so rotate()
// must carry screen (0, 1) onto the heading (dirX, dirZ).
// Labels are message keys, resolved at render so a language change reaches them.
const ZONE_LABELS = [
  { id: 'packing', labelKey: 'zonePacking', z: FACTORY_ZONE_Z.packing },
  { id: 'sifting', labelKey: 'zoneSifters', z: FACTORY_ZONE_Z.sifting },
  { id: 'milling', labelKey: 'zoneMills', z: FACTORY_ZONE_Z.milling },
] as const;

/**
 * The map's frame: 1 px a metre, centred on the hall, so the hall (80 by
 * 100 m), all four egress exits and the docked trucks (z about +/-61) fit
 * the 180 by 140 px box. -z is up, as in the overview.
 */
export const MINI_MAP = { width: 180, height: 140, pxPerMetre: 1 } as const;
export function toMap(x: number, z: number): { left: number; top: number } {
  return {
    left: MINI_MAP.width / 2 + x * MINI_MAP.pxPerMetre,
    top: MINI_MAP.height / 2 + z * MINI_MAP.pxPerMetre,
  };
}
const onMap = ({ left, top }: { left: number; top: number }) =>
  left >= 0 && left <= MINI_MAP.width && top >= 0 && top <= MINI_MAP.height;

interface MapPositions {
  forklifts: EntityPosition[];
  trucks: EntityPosition[];
  player: { x: number; z: number; yaw: number } | null;
}
const EMPTY: MapPositions = { forklifts: [], trucks: [], player: null };

function readPositions(): MapPositions {
  const forklifts: EntityPosition[] = [];
  const trucks: EntityPosition[] = [];
  for (const entity of positionRegistry.getAllEntities()) {
    if (entity.kind !== 'truck') forklifts.push({ ...entity });
    // One mark a truck: the tractor, not its trailer.
    else if (!entity.id.endsWith('-trailer')) trucks.push({ ...entity });
  }
  const player = firstPersonPose.active
    ? { x: firstPersonPose.x, z: firstPersonPose.z, yaw: firstPersonPose.yaw }
    : null;
  return { forklifts, trucks, player };
}

const {
  minX: HALL_MIN_X,
  maxX: HALL_MAX_X,
  minZ: HALL_MIN_Z,
  maxZ: HALL_MAX_Z,
} = SITE_LAYOUT.factory.bounds;

export const MiniMap: React.FC = () => {
  const t = useT(miniMapMessages);
  const { showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const [positions, setPositions] = useState<MapPositions>(EMPTY);

  // Close unmounts the map with focus on its button. Hand focus back to the
  // control that opened it (Overview's Mini-map toggle) rather than <body>,
  // where a keyboard user would lose their place. (The forklift stop is X,
  // not Space, since D-050.)
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!showMiniMap) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [showMiniMap]);
  // The toggle goes with the Overview panel when the sidebar closes, and the
  // M shortcut opens the map with none: focus on the close button then lands
  // on the dock instead.
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    const opener = openerRef.current;
    const focusOnClose = event.currentTarget === document.activeElement;
    openerRef.current = null;
    setShowMiniMap(false);
    if (opener?.isConnected) opener.focus();
    else if (focusOnClose) focusDockItem('overview');
  };

  useEffect(() => {
    if (!showMiniMap) return;

    // PERFORMANCE FIX: Reduced from 100ms (10Hz) to 500ms (2Hz)
    // 10Hz was excessive for a mini map - 2Hz is sufficient
    setPositions(readPositions());
    const interval = setInterval(() => setPositions(readPositions()), 500);

    return () => clearInterval(interval);
  }, [showMiniMap]);

  if (!showMiniMap) return null;

  const { width: mapWidth, height: mapHeight } = MINI_MAP;
  const hallTopLeft = toMap(HALL_MIN_X, HALL_MIN_Z);
  const hallBottomRight = toMap(HALL_MAX_X, HALL_MAX_Z);

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
      <div className="millos-glass rounded-xl border-cyan-500/30 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-white">{t('title')}</span>
          </div>
          <button
            onClick={handleClose}
            aria-label={t('close')}
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

          {/* The hall's walls */}
          <div
            data-testid="mini-map-hall"
            className="absolute border border-slate-500/70"
            style={{
              left: hallTopLeft.left,
              top: hallTopLeft.top,
              width: hallBottomRight.left - hallTopLeft.left,
              height: hallBottomRight.top - hallTopLeft.top,
            }}
          />

          {/* Zone indicators, placed at each zone's real z, inside the hall. */}
          {ZONE_LABELS.map(({ id, labelKey, z }) => (
            <div
              key={id}
              className="absolute -translate-y-1/2 text-[8px] text-slate-400"
              style={{ left: hallTopLeft.left + 2, top: toMap(0, z).top }}
            >
              {t(labelKey)}
            </div>
          ))}

          {/* Egress exits (the drill's zones) */}
          {SERVICE_EGRESS_POINTS.map((exit) => {
            const at = toMap(exit.position.x, exit.position.z);
            return (
              <div
                key={exit.id}
                data-testid="mini-map-exit"
                role="img"
                aria-label={exit.label}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-emerald-400"
                style={at}
              />
            );
          })}

          {/* Trucks */}
          {positions.trucks.map((truck) => {
            const at = toMap(truck.x, truck.z);
            if (!onMap(at)) return null;
            return (
              <div
                key={truck.id}
                data-testid="mini-map-truck"
                className="absolute h-2 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-sky-300 bg-sky-500"
                style={at}
              />
            );
          })}

          {/* Forklifts */}
          {positions.forklifts.map((forklift) => (
            <div
              key={forklift.id}
              data-testid="mini-map-forklift"
              className="absolute"
              style={{
                ...toMap(forklift.x, forklift.z),
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

          {/* The player, in first person: a dot with a tick toward where they face. */}
          {positions.player && onMap(toMap(positions.player.x, positions.player.z)) && (
            <div
              data-testid="mini-map-player"
              className="absolute"
              style={{
                ...toMap(positions.player.x, positions.player.z),
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="h-2.5 w-2.5 rounded-full border border-white bg-cyan-400" />
              <div
                className="absolute h-2 w-0.5 bg-white"
                style={{
                  left: '50%',
                  top: '50%',
                  transformOrigin: 'center top',
                  // Facing yaw 0 looks toward -z, up the map.
                  transform: `translateX(-50%) rotate(${180 - positions.player.yaw * (180 / Math.PI)}deg)`,
                }}
              />
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-1.5 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-amber-500 rounded-sm" />
            <span className="text-[9px] text-slate-400">{t('forklifts')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-sky-500 rounded-sm" />
            <span className="text-[9px] text-slate-400">{t('trucks')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-sm" />
            <span className="text-[9px] text-slate-400">{t('exits')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-cyan-400 rounded-full" />
            <span className="text-[9px] text-slate-400">{t('you')}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
