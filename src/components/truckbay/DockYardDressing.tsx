import React from 'react';
import * as THREE from 'three';
import {
  DockBoard,
  EmptyPalletStack,
  FlourLoad,
  PalletJack,
  SpillKit,
  WheelChocks,
} from '../props/LoadingProps';
import { applyWorldSurface } from '../../utils/worldSurface';
import { EXTERIOR_LAYERS } from '../../constants/renderLayers';
import {
  DOCK_APRON_ITEMS,
  DOCK_ISLAND_BOLLARDS,
  DOCK_ISLAND_ITEMS,
  DOCK_PALLET_ISLAND,
  type DockDressingItem,
} from './dockYardDressing';

const KERB = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#c9a43a', roughness: 0.8, metalness: 0 }),
  'masonry'
);
const SLAB = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#9c968b', roughness: 0.92, metalness: 0 }),
  'masonry'
);
const BOLLARD = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#d6a51f', roughness: 0.55, metalness: 0.2 }),
  'painted'
);
const BOLLARD_CAP = new THREE.MeshStandardMaterial({ color: '#25292c', roughness: 0.6 });
const BOLLARD_POST = new THREE.CylinderGeometry(0.11, 0.11, 1.1, 14);
const BOLLARD_TOP = new THREE.CylinderGeometry(0.115, 0.115, 0.08, 14);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const DressingItem: React.FC<{ item: DockDressingItem; y: number }> = ({ item, y }) => {
  const position: [number, number, number] = [item.at[0], y, item.at[1]];
  switch (item.kind) {
    case 'load':
      return <FlourLoad position={position} rotation={item.rotation} />;
    case 'palletStack':
      return (
        <EmptyPalletStack
          position={position}
          rotation={item.rotation}
          count={item.count ?? 6}
          weathered
        />
      );
    case 'palletJack':
      return <PalletJack position={position} rotation={item.rotation} />;
    case 'wheelChocks':
      return <WheelChocks position={position} rotation={item.rotation} />;
    case 'dockBoard':
      return <DockBoard position={position} rotation={item.rotation} />;
    case 'spillKit':
      return <SpillKit position={position} rotation={item.rotation} />;
  }
};

/**
 * The shipping yard's working dressing (`dockYardDressing.ts`): a kerbed pallet
 * island in the middle of the trucks' turning loop, and loads waiting east of
 * the inbound lane. World coordinates; mount at the TruckBay root.
 */
export const DockYardDressing: React.FC = () => {
  const island = DOCK_PALLET_ISLAND;
  const width = island.maxX - island.minX;
  const depth = island.maxZ - island.minZ;
  const cx = (island.minX + island.maxX) / 2;
  const cz = (island.minZ + island.maxZ) / 2;
  // The slab and kerb are solids standing on the apron with their bases a
  // little below it, so nothing of them is coplanar with the ground.
  const base = -0.05;
  const kerbs: [number, number, number, number][] = [
    [cx, island.minZ + island.kerbWidth / 2, width, island.kerbWidth],
    [cx, island.maxZ - island.kerbWidth / 2, width, island.kerbWidth],
    [island.minX + island.kerbWidth / 2, cz, island.kerbWidth, depth - 2 * island.kerbWidth],
    [island.maxX - island.kerbWidth / 2, cz, island.kerbWidth, depth - 2 * island.kerbWidth],
  ];
  return (
    <group name="dock-yard-dressing">
      <mesh
        geometry={UNIT_BOX}
        material={SLAB}
        position={[cx, (base + island.slabTop) / 2, cz]}
        scale={[
          width - 2 * island.kerbWidth + 0.02,
          island.slabTop - base,
          depth - 2 * island.kerbWidth + 0.02,
        ]}
        receiveShadow
      />
      {kerbs.map(([x, z, w, d], index) => (
        <mesh
          key={`kerb-${index}`}
          geometry={UNIT_BOX}
          material={KERB}
          position={[x, (base + island.kerbHeight) / 2, z]}
          scale={[w, island.kerbHeight - base, d]}
          castShadow
          receiveShadow
        />
      ))}
      {DOCK_ISLAND_BOLLARDS.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, island.kerbHeight, z]}>
          <mesh geometry={BOLLARD_POST} material={BOLLARD} position={[0, 0.55, 0]} castShadow />
          <mesh geometry={BOLLARD_TOP} material={BOLLARD_CAP} position={[0, 1.12, 0]} />
        </group>
      ))}
      {DOCK_ISLAND_ITEMS.map((item) => (
        <DressingItem key={item.id} item={item} y={island.slabTop} />
      ))}
      {DOCK_APRON_ITEMS.map((item) => (
        <DressingItem key={item.id} item={item} y={EXTERIOR_LAYERS.ground} />
      ))}
    </group>
  );
};
