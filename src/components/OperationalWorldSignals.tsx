import React, { useCallback, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { SITE_LAYOUT, type Vec3Tuple } from '../constants/siteLayout';
import { POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';
import {
  useOperationsCampaignStore,
  type IncidentKind,
  type IncidentPhase,
  type OperationalIncident,
} from '../stores/operationsCampaignStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SceneText } from './shared/SceneText';

type SignalPlacement = {
  readonly position: Vec3Tuple;
  readonly shortLabel: string;
};

/**
 * Authored operational markers use the canonical site layout rather than a
 * second coordinate system. Each marker sits beside the affected asset, not
 * through it, so live incidents enrich the same world without creating the
 * central-factory pile-up that earlier scene variants caused.
 */
export const OPERATIONAL_INCIDENT_PLACEMENTS: Readonly<Record<IncidentKind, SignalPlacement>> = {
  bearing_overheat: {
    position: [
      SITE_LAYOUT.machines.rollerMills[0].position[0] -
        SITE_LAYOUT.machineDimensions.rollerMill[0] / 2 -
        1.4,
      0.08,
      SITE_LAYOUT.machines.rollerMills[0].position[2],
    ],
    shortLabel: 'R.M. 101 HEAT',
  },
  dust_filter_pressure: {
    position: [5.25, SITE_LAYOUT.datum.mezzanine + 0.08, SITE_LAYOUT.factory.zones.sifting + 2.75],
    shortLabel: 'FILTER DP',
  },
  power_sag: {
    // Off the south end of the silo bank. The old point sat 5 m from Silo
    // Epsilon's centre, inside its 6 m discharge enclosure.
    position: [
      SITE_LAYOUT.machines.silos[4].position[0],
      0.04,
      SITE_LAYOUT.machines.silos[4].position[2] - SITE_LAYOUT.machineDimensions.silo[2] / 2 - 2.5,
    ],
    shortLabel: 'POWER SAG',
  },
  delayed_truck: {
    position: [24, 0.04, SITE_LAYOUT.docks.shipping.bayCentre[2] + 14],
    shortLabel: 'DISPATCH DELAY',
  },
  supplier_contamination: {
    position: [-22, 0.04, SITE_LAYOUT.docks.receiving.bayCentre[2] - 14],
    shortLabel: 'LOT HOLD',
  },
  packaging_shortage: {
    position: [
      SITE_LAYOUT.machines.packers[0].position[0] - 5,
      0.08,
      SITE_LAYOUT.machines.packers[0].position[2],
    ],
    shortLabel: 'PACKAGING LOW',
  },
  severe_rain: {
    position: [118, SITE_LAYOUT.datum.water + 0.04, 116],
    shortLabel: 'HIGH WATER',
  },
  control_network_degraded: {
    position: [SITE_LAYOUT.portals.eastService.centre[0] - 7, 0.08, -20],
    shortLabel: 'LINK DEGRADED',
  },
};

const POST_GEOMETRY = new THREE.CylinderGeometry(0.1, 0.14, 1.35, 10);
const BEACON_GEOMETRY = new THREE.SphereGeometry(0.24, 12, 8);
const RING_GEOMETRY = new THREE.RingGeometry(1.05, 1.25, 32);
const BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const SPHERE_GEOMETRY = new THREE.SphereGeometry(0.25, 10, 8);
const CYLINDER_GEOMETRY = new THREE.CylinderGeometry(0.22, 0.22, 1, 10);
const TORUS_GEOMETRY = new THREE.TorusGeometry(0.42, 0.08, 8, 20);

const HOUSING_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#1f2937',
  metalness: 0.68,
  roughness: 0.32,
});
const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#38bdf8',
  emissive: '#0284c7',
  emissiveIntensity: 0.85,
  roughness: 0.28,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});

const PHASE_COLOURS: Record<Exclude<IncidentPhase, 'resolved'>, string> = {
  raised: '#fb4934',
  acknowledged: '#f59e0b',
  mitigated: '#22d3ee',
};

const createSignalMaterial = (colour: string) =>
  new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: 1.25,
    roughness: 0.3,
    metalness: 0.15,
  });

const createRingMaterial = (colour: string) =>
  new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.moderate.factor,
    polygonOffsetUnits: POLYGON_OFFSET.moderate.units,
  });

const PHASE_MATERIALS = {
  raised: createSignalMaterial(PHASE_COLOURS.raised),
  acknowledged: createSignalMaterial(PHASE_COLOURS.acknowledged),
  mitigated: createSignalMaterial(PHASE_COLOURS.mitigated),
} satisfies Record<Exclude<IncidentPhase, 'resolved'>, THREE.MeshStandardMaterial>;

const RING_MATERIALS = {
  raised: createRingMaterial(PHASE_COLOURS.raised),
  acknowledged: createRingMaterial(PHASE_COLOURS.acknowledged),
  mitigated: createRingMaterial(PHASE_COLOURS.mitigated),
} satisfies Record<Exclude<IncidentPhase, 'resolved'>, THREE.MeshBasicMaterial>;

const SignalSymbol: React.FC<{
  kind: IncidentKind;
  material: THREE.MeshStandardMaterial;
}> = ({ kind, material }) => {
  switch (kind) {
    case 'bearing_overheat':
      return (
        <group>
          <mesh geometry={TORUS_GEOMETRY} material={material} rotation={[Math.PI / 2, 0, 0]} />
          <mesh
            geometry={CYLINDER_GEOMETRY}
            material={HOUSING_MATERIAL}
            rotation={[0, 0, Math.PI / 2]}
            scale={[0.6, 1, 0.6]}
          />
        </group>
      );
    case 'dust_filter_pressure':
      return (
        <group>
          {[-0.32, 0, 0.32].map((x, index) => (
            <mesh
              key={x}
              geometry={SPHERE_GEOMETRY}
              material={material}
              position={[x, index * 0.24, 0]}
              scale={0.75 + index * 0.28}
            />
          ))}
        </group>
      );
    case 'power_sag':
      return (
        <group rotation={[0, 0, -0.2]}>
          <mesh
            geometry={BOX_GEOMETRY}
            material={material}
            position={[-0.18, 0.25, 0]}
            scale={[0.28, 0.58, 0.18]}
          />
          <mesh
            geometry={BOX_GEOMETRY}
            material={material}
            position={[0.08, -0.05, 0]}
            scale={[0.5, 0.22, 0.18]}
            rotation={[0, 0, -0.65]}
          />
          <mesh
            geometry={BOX_GEOMETRY}
            material={material}
            position={[0.2, -0.35, 0]}
            scale={[0.25, 0.55, 0.18]}
          />
        </group>
      );
    case 'delayed_truck':
      return (
        <group>
          <mesh
            geometry={BOX_GEOMETRY}
            material={material}
            position={[-0.18, 0, 0]}
            scale={[0.95, 0.42, 0.42]}
          />
          <mesh
            geometry={BOX_GEOMETRY}
            material={HOUSING_MATERIAL}
            position={[0.46, -0.06, 0]}
            scale={[0.34, 0.3, 0.4]}
          />
        </group>
      );
    case 'supplier_contamination':
      return (
        <group>
          <mesh geometry={BOX_GEOMETRY} material={HOUSING_MATERIAL} scale={[0.72, 0.72, 0.72]} />
          <mesh
            geometry={BOX_GEOMETRY}
            material={material}
            scale={[0.9, 0.12, 0.12]}
            rotation={[0, 0, Math.PI / 4]}
          />
          <mesh
            geometry={BOX_GEOMETRY}
            material={material}
            scale={[0.9, 0.12, 0.12]}
            rotation={[0, 0, -Math.PI / 4]}
          />
        </group>
      );
    case 'packaging_shortage':
      return (
        <group>
          <mesh
            geometry={BOX_GEOMETRY}
            material={HOUSING_MATERIAL}
            position={[-0.42, 0, 0]}
            scale={[0.12, 0.9, 0.6]}
          />
          <mesh
            geometry={BOX_GEOMETRY}
            material={HOUSING_MATERIAL}
            position={[0.42, 0, 0]}
            scale={[0.12, 0.9, 0.6]}
          />
          <mesh
            geometry={CYLINDER_GEOMETRY}
            material={material}
            rotation={[0, 0, Math.PI / 2]}
            scale={[0.35, 0.65, 0.35]}
          />
        </group>
      );
    case 'severe_rain':
      return (
        <group>
          {[-0.35, 0, 0.35].map((x, index) => (
            <mesh
              key={x}
              geometry={SPHERE_GEOMETRY}
              material={WATER_MATERIAL}
              position={[x, index === 1 ? 0.2 : -0.08, 0]}
              scale={[0.7, 1.45, 0.7]}
            />
          ))}
        </group>
      );
    case 'control_network_degraded':
      // Two network nodes joined by a link with a visible break at the centre.
      return (
        <group>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh
                geometry={BOX_GEOMETRY}
                material={HOUSING_MATERIAL}
                position={[side * 0.42, 0, 0]}
                scale={[0.26, 0.26, 0.26]}
              />
              <mesh
                geometry={BOX_GEOMETRY}
                material={material}
                position={[side * 0.2, 0, 0]}
                scale={[0.22, 0.12, 0.12]}
              />
            </group>
          ))}
        </group>
      );
  }
};

const OperationalSignalMarker: React.FC<{
  incident: OperationalIncident;
  detailed: boolean;
  labelled: boolean;
  registerAnimated: (id: string, group: THREE.Group | null) => void;
}> = ({ incident, detailed, labelled, registerAnimated }) => {
  if (incident.phase === 'resolved') return null;

  const placement = OPERATIONAL_INCIDENT_PLACEMENTS[incident.kind];
  const material = PHASE_MATERIALS[incident.phase];
  const ringMaterial = RING_MATERIALS[incident.phase];

  return (
    <group
      name={`operations-signal-${incident.kind}`}
      position={placement.position}
      userData={{ operationalIncidentId: incident.id, incidentKind: incident.kind }}
      dispose={null}
    >
      <mesh
        geometry={RING_GEOMETRY}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.dynamicOverlay}
      />
      <mesh geometry={POST_GEOMETRY} material={HOUSING_MATERIAL} position={[0, 0.68, 0]} />
      <group ref={(group) => registerAnimated(incident.id, group)} position={[0, 1.55, 0]}>
        <mesh geometry={BEACON_GEOMETRY} material={material} />
        {detailed && (
          <group position={[0, 0.85, 0]} scale={0.8}>
            <SignalSymbol kind={incident.kind} material={material} />
          </group>
        )}
      </group>
      {labelled && (
        <Billboard position={[0, 3.25, 0]}>
          <SceneText
            fontSize={0.42}
            color={PHASE_COLOURS[incident.phase]}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.025}
            outlineColor="#020617"
            maxWidth={6}
          >
            {placement.shortLabel}
          </SceneText>
        </Billboard>
      )}
    </group>
  );
};

/**
 * One cheap animation loop drives every active marker. There are no point
 * lights, shadow casters, runtime geometries, or per-frame allocations.
 */
export const OperationalWorldSignals: React.FC = () => {
  const activeIncidents = useOperationsCampaignStore(
    useShallow((state) => state.incidents.filter((incident) => incident.phase !== 'resolved'))
  );
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const reducedMotion = useReducedMotion();
  const animatedGroups = useRef(new Map<string, THREE.Group>());

  const registerAnimated = useCallback((id: string, group: THREE.Group | null) => {
    if (group) {
      group.userData.phaseOffset = id.length * 0.47;
      animatedGroups.current.set(id, group);
    } else {
      animatedGroups.current.delete(id);
    }
  }, []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    animatedGroups.current.forEach((group) => {
      const phaseOffset = Number(group.userData.phaseOffset) || 0;
      // Reduced motion: beacons hold still; phase colour and label carry state.
      if (reducedMotion) {
        group.scale.setScalar(1);
        group.rotation.y = phaseOffset;
        return;
      }
      const pulse = 1 + Math.sin(time * 3.2 + phaseOffset) * 0.1;
      group.scale.setScalar(pulse);
      group.rotation.y = time * 0.35 + phaseOffset;
    });
  });

  if (activeIncidents.length === 0) return null;

  const detailed = quality !== 'low';
  const labelled = quality === 'high' || quality === 'ultra';

  return (
    <group name="operational-world-signals">
      {activeIncidents.map((incident) => (
        <OperationalSignalMarker
          key={incident.id}
          incident={incident}
          detailed={detailed}
          labelled={labelled}
          registerAnimated={registerAnimated}
        />
      ))}
    </group>
  );
};

export default OperationalWorldSignals;
