import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FLOUR_SACK_PRINT_GEOMETRY,
  FLOUR_STRIPE_MATERIAL,
  getFlourPalletGeometry,
  getFlourSackGeometry,
  getFlourSackMaterial,
  PALLET_PRINT_ALPHA_TEST,
  PALLET_SACK_LAYOUT,
} from '../utils/flourSacks';
import { applyWorldSurface } from '../utils/worldSurface';
import {
  cargoBagsShown,
  cargoStationTravel,
  CARGO_PALLET_BAGS,
  CARGO_STORE_EMPTY_STACK,
} from '../simulation/forkliftCargoStations';
import { forkliftCargoStation, type CargoStationLive } from '../stores/forkliftCargoStore';
import { BarePallet, SuppliesLoad } from './models/forkliftLoads';

/**
 * The loads standing at the forklifts' stations (forkliftCargoStations.ts):
 * the pallet being built at the shipping collection point, a pallet on a dock
 * deck going into or coming out of its trailer, and the supplies at the
 * packing-line store. A station's load is drawn exactly where the forks hold
 * it at engagement, so the handover to and from the forks is one pallet that
 * changes hands, not a fade. Transforms are written from the frame loop; the
 * only React render is the mount.
 */
const TIMBER_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'station-pallet-timber',
  color: '#90704b',
  roughness: 0.88,
});
applyWorldSurface(TIMBER_MATERIAL, 'vehicle');
const INK_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'station-flour-ink',
  color: '#39352d',
  map: FLOUR_STRIPE_MATERIAL.map,
  roughness: 0.95,
  alphaTest: PALLET_PRINT_ALPHA_TEST,
  transparent: true,
  polygonOffset: true,
  polygonOffsetFactor: FLOUR_STRIPE_MATERIAL.polygonOffsetFactor,
  polygonOffsetUnits: FLOUR_STRIPE_MATERIAL.polygonOffsetUnits,
});

const STATION_KEYS: readonly ['forklift-1' | 'forklift-2', 'pickup' | 'dropoff'][] = [
  ['forklift-1', 'pickup'],
  ['forklift-1', 'dropoff'],
  ['forklift-2', 'pickup'],
  ['forklift-2', 'dropoff'],
];

/** Place a station's group at its load's pose; hidden with no load or no pose. */
function placeStationGroup(group: THREE.Group, entry: CargoStationLive): boolean {
  const pose = entry.pose;
  const visible = !!pose && entry.station.present;
  group.visible = visible;
  if (!visible || !pose) return false;
  const travel = cargoStationTravel(entry.station);
  group.position.set(
    pose.x + Math.sin(pose.heading) * travel,
    pose.y,
    pose.z + Math.cos(pose.heading) * travel
  );
  group.rotation.set(0, pose.heading, 0);
  return true;
}

const FlourStationLoad: React.FC<{ entry: CargoStationLive }> = ({ entry }) => {
  const group = useRef<THREE.Group>(null);
  const sacks = useRef<THREE.InstancedMesh>(null);
  const ink = useRef<THREE.InstancedMesh>(null);
  const shown = useRef(-1);
  const geometry = getFlourPalletGeometry();
  const scratch = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    if (!sacks.current || !ink.current) return;
    PALLET_SACK_LAYOUT.forEach((bag, index) => {
      scratch.position.set(...bag.position);
      scratch.rotation.set(0, bag.rotationY, 0);
      scratch.scale.set(...bag.scale);
      scratch.updateMatrix();
      sacks.current!.setMatrixAt(index, scratch.matrix);
      ink.current!.setMatrixAt(index, scratch.matrix);
    });
    for (const mesh of [sacks.current, ink.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }, [scratch]);
  useFrame(() => {
    if (!group.current || !placeStationGroup(group.current, entry)) return;
    const bags = cargoBagsShown(entry.station);
    if (bags === shown.current || !sacks.current || !ink.current) return;
    shown.current = bags;
    sacks.current.count = bags;
    ink.current.count = bags;
  });
  return (
    <group ref={group} name={`cargo-station-${entry.key}`} visible={false}>
      <mesh geometry={geometry.pallet} material={TIMBER_MATERIAL} castShadow receiveShadow />
      <instancedMesh
        ref={sacks}
        args={[getFlourSackGeometry(), getFlourSackMaterial(), CARGO_PALLET_BAGS]}
        castShadow
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        ref={ink}
        args={[FLOUR_SACK_PRINT_GEOMETRY, INK_MATERIAL, CARGO_PALLET_BAGS]}
        receiveShadow
        dispose={null}
      />
    </group>
  );
};

/** Bare pallets beside the store sit this far past its slot along the forks' line, clear of the next drop. */
const STORE_EMPTY_STACK_AHEAD = 1.05;
/** One bare pallet's height (getFlourPalletGeometry: -0.06 to 0.06). */
const BARE_PALLET_HEIGHT = 0.12;

const SuppliesStationLoad: React.FC<{ entry: CargoStationLive }> = ({ entry }) => {
  const group = useRef<THREE.Group>(null);
  const contents = useRef<THREE.Group>(null);
  const stack = useRef<THREE.Group>(null);
  const store = entry.station.kind === 'store';
  useFrame(() => {
    if (group.current) placeStationGroup(group.current, entry);
    // The packing line draws the sacks down from the top; the bare pallet then
    // joins the stack beside the store.
    if (contents.current)
      contents.current.scale.y = store ? Math.max(0.02, 1 - entry.station.progress) : 1;
    const pose = entry.pose;
    if (!stack.current) return;
    stack.current.visible = store && !!pose && entry.station.empties > 0;
    if (!stack.current.visible || !pose) return;
    stack.current.position.set(
      pose.x + Math.sin(pose.heading) * STORE_EMPTY_STACK_AHEAD,
      pose.y,
      pose.z + Math.cos(pose.heading) * STORE_EMPTY_STACK_AHEAD
    );
    stack.current.rotation.set(0, pose.heading, 0);
    stack.current.children.forEach((child, index) => {
      child.visible = index < entry.station.empties;
    });
  });
  return (
    <>
      <group ref={group} name={`cargo-station-${entry.key}`} visible={false}>
        <SuppliesLoad contentsRef={contents} />
      </group>
      {store && (
        <group ref={stack} name={`cargo-station-${entry.key}-empties`} visible={false}>
          {Array.from({ length: CARGO_STORE_EMPTY_STACK }, (_, index) => (
            <group key={index} position={[0, index * BARE_PALLET_HEIGHT, 0]} visible={false}>
              <BarePallet />
            </group>
          ))}
        </group>
      )}
    </>
  );
};

export const ForkliftCargoLoads: React.FC = () => {
  const entries = useMemo(
    () =>
      STATION_KEYS.map(([id, action]) => forkliftCargoStation(id, action)).filter(
        (entry): entry is CargoStationLive => entry !== null
      ),
    []
  );
  return (
    <group name="forklift-cargo-stations" userData={{ noStaticBatch: true }}>
      {entries.map((entry) =>
        entry.station.load === 'supplies' ? (
          <SuppliesStationLoad key={entry.key} entry={entry} />
        ) : (
          <FlourStationLoad key={entry.key} entry={entry} />
        )
      )}
    </group>
  );
};
