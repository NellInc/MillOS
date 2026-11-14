/**
 * EGRESS ROUTES ON THE FLOOR (6.4): before START, and through the drill, the
 * step-free route of each service egress zone and its refuge are drawn on the
 * floor (STEP_FREE_EGRESS, accessibleEgress.ts), so a player preparing a drill
 * can see which routes a stopped forklift would block. A route with a forklift
 * standing on it, and the forklift itself, show red: the drill will verify
 * that zone on its alternative, or hold it. Green means clear.
 *
 * Shown while a Safety panel's controls are open (egressPreview.ts) or a drill
 * runs; benchmarks and captures open no panel, so it is never drawn there.
 * Nobody moves (D-010): this marks routes, not an evacuation.
 *
 * The overlay is a guidance layer, not paint: it sits at
 * FLOOR_LAYERS.dynamicOverlay, writes no depth and takes the standard bias.
 * The per-frame check reads the forklifts' published positions into
 * preallocated footprints and allocates nothing.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { forkliftCrewLive } from '../../stores/forkliftCrewStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import {
  FORKLIFT_FOOTPRINT_RADIUS,
  STEP_FREE_EGRESS,
  blockingVehicle,
  type VehicleFootprint,
} from '../../systems/accessibleEgress';
import { useEgressPreviewStore } from '../../systems/egressPreview';

const CLEAR_COLOR = new THREE.Color('#22c55e');
const BLOCKED_COLOR = new THREE.Color('#ef4444');
const ROUTE_WIDTH = 0.6;
const ROUTE_OPACITY = 0.55;

type MutableFootprint = { -readonly [K in keyof VehicleFootprint]: VehicleFootprint[K] };

const overlayMaterial = (color: THREE.Color) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: ROUTE_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
    polygonOffsetUnits: POLYGON_OFFSET.standard.units,
  });

/** Each route as flat segments: centre, length and heading in the floor plane. */
const ROUTE_SEGMENTS = STEP_FREE_EGRESS.map((egress) =>
  egress.route.slice(1).map((end, i) => {
    const start = egress.route[i];
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    return {
      x: (start[0] + end[0]) / 2,
      z: (start[1] + end[1]) / 2,
      // Widened by the strip's width so consecutive segments meet at a corner.
      length: Math.hypot(dx, dz) + ROUTE_WIDTH,
      heading: -Math.atan2(dz, dx),
    };
  })
);

const EgressRouteOverlay: React.FC = () => {
  const zoneMaterials = useMemo(
    () => STEP_FREE_EGRESS.map(() => overlayMaterial(CLEAR_COLOR.clone())),
    []
  );
  const forkliftMaterial = useMemo(() => overlayMaterial(BLOCKED_COLOR.clone()), []);
  React.useEffect(
    () => () => {
      zoneMaterials.forEach((material) => material.dispose());
      forkliftMaterial.dispose();
    },
    [zoneMaterials, forkliftMaterial]
  );

  // One footprint per forklift, refreshed in place, plus a one-element view of
  // each for asking which routes that forklift stands on.
  const footprints = useMemo<MutableFootprint[]>(
    () =>
      FORKLIFT_CREW_SITES.map((site) => ({
        x: Number.NaN,
        z: Number.NaN,
        radius: FORKLIFT_FOOTPRINT_RADIUS,
        id: site.tag,
      })),
    []
  );
  const singles = useMemo(() => footprints.map((footprint) => [footprint]), [footprints]);
  const zoneBlocked = useRef<boolean[]>(STEP_FREE_EGRESS.map(() => false));
  const forkliftRings = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    for (let i = 0; i < FORKLIFT_CREW_SITES.length; i++) {
      const vehicle = forkliftCrewLive(FORKLIFT_CREW_SITES[i].forkliftId).vehicle;
      footprints[i].x = vehicle ? vehicle.x : Number.NaN;
      footprints[i].z = vehicle ? vehicle.z : Number.NaN;
    }
    for (let zone = 0; zone < STEP_FREE_EGRESS.length; zone++) {
      const blocked = blockingVehicle(STEP_FREE_EGRESS[zone], footprints) !== null;
      if (blocked === zoneBlocked.current[zone]) continue;
      zoneBlocked.current[zone] = blocked;
      const color = blocked ? BLOCKED_COLOR : CLEAR_COLOR;
      zoneMaterials[zone].color.copy(color);
      zoneMaterials[zone].emissive.copy(color);
    }
    for (let i = 0; i < footprints.length; i++) {
      const ring = forkliftRings.current[i];
      if (!ring) continue;
      let onRoute = false;
      for (let zone = 0; zone < STEP_FREE_EGRESS.length && !onRoute; zone++)
        onRoute = blockingVehicle(STEP_FREE_EGRESS[zone], singles[i]) !== null;
      ring.visible = onRoute;
      if (onRoute) ring.position.set(footprints[i].x, FLOOR_LAYERS.dynamicOverlay, footprints[i].z);
    }
  });

  return (
    <group renderOrder={RENDER_ORDER.dynamicOverlay}>
      {STEP_FREE_EGRESS.map((egress, zone) => (
        <group key={egress.zoneId}>
          {ROUTE_SEGMENTS[zone].map((segment, i) => (
            <group
              key={i}
              position={[segment.x, FLOOR_LAYERS.dynamicOverlay, segment.z]}
              rotation={[0, segment.heading, 0]}
            >
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                material={zoneMaterials[zone]}
                renderOrder={RENDER_ORDER.dynamicOverlay}
              >
                <planeGeometry args={[segment.length, ROUTE_WIDTH]} />
              </mesh>
            </group>
          ))}
          <mesh
            position={[egress.refuge[0], FLOOR_LAYERS.dynamicOverlay, egress.refuge[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={zoneMaterials[zone]}
            renderOrder={RENDER_ORDER.dynamicOverlay}
          >
            <ringGeometry args={[0.7, 1.0, 32]} />
          </mesh>
        </group>
      ))}
      {FORKLIFT_CREW_SITES.map((site, i) => (
        <mesh
          key={site.forkliftId}
          ref={(mesh) => {
            forkliftRings.current[i] = mesh;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          material={forkliftMaterial}
          renderOrder={RENDER_ORDER.dynamicOverlay}
        >
          <ringGeometry args={[FORKLIFT_FOOTPRINT_RADIUS, FORKLIFT_FOOTPRINT_RADIUS + 0.35, 40]} />
        </mesh>
      ))}
    </group>
  );
};

/** The egress routes, drawn while the Safety panel's controls are open or a drill runs. */
export const EgressRouteFloor: React.FC = () => {
  const panelOpen = useEgressPreviewStore((state) => state.openPanels > 0);
  const drill = useGameSimulationStore((state) => state.emergencyDrillMode);
  return panelOpen || drill ? <EgressRouteOverlay /> : null;
};
