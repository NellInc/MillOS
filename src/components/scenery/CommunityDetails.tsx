import React from 'react';
import * as THREE from 'three';
import {
  COMMUNITY_ANCHORS as A,
  getCommunityHours,
  type CommunityAnchor,
} from '../../constants/communityLayout';
import { SITE_LAYOUT, landmarkLocalToWorld, type Vec3Tuple } from '../../constants/siteLayout';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { applyBatchWorldSurface } from '../../utils/worldSurface';
import { StaticMeshBatch } from '../performance/StaticMeshBatch';
import { SceneText } from '../shared/SceneText';

const OAK = '#92704c';
const IRON = '#344944';
const CREAM = '#e0d5b9';
const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 });
const WET_SOIL = new THREE.MeshStandardMaterial({ color: '#493a2d', roughness: 0.83 });
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Bake small authored assemblies once; all anchors are WORLD metres. */
function at(b: PlotGeometry, anchor: CommunityAnchor, build: (local: PlotGeometry) => void) {
  const local = new PlotGeometry();
  build(local);
  local.parts.forEach((g) => {
    g.rotateY(anchor.rotation).translate(...anchor.position);
    b.parts.push(g);
  });
}
function villagePosition(p: Vec3Tuple): Vec3Tuple {
  return landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, p);
}
function seat(b: PlotGeometry, width: number) {
  // Seat top exactly .46; a seated root at ground needs no compensating lift.
  for (const z of [-0.18, 0, 0.18]) b.box([width, 0.08, 0.15], [0, 0.42, z], OAK);
  for (const y of [0.66, 0.86]) b.box([width, 0.14, 0.07], [0, y, -0.24], OAK);
  for (const x of [-width * 0.36, width * 0.36]) {
    b.box([0.065, 0.9, 0.07], [x, 0.45, -0.25], IRON);
    b.box([0.065, 0.39, 0.07], [x, 0.195, 0.2], IRON);
  }
}
function table(b: PlotGeometry, width: number, depth: number) {
  b.box([width, 0.09, depth], [0, 0.78, 0], OAK);
  for (const x of [-width * 0.4, width * 0.4])
    for (const z of [-depth * 0.35, depth * 0.35])
      b.box([0.055, 0.735, 0.055], [x, 0.368, z], IRON);
}
function crate(b: PlotGeometry, x: number, y: number, z: number) {
  b.box([0.64, 0.04, 0.46], [x, y + 0.02, z], OAK);
  for (const side of [-1, 1]) {
    for (const h of [0.13, 0.29]) {
      b.box([0.64, 0.09, 0.04], [x, y + h, z + side * 0.22], OAK);
      b.box([0.04, 0.09, 0.46], [x + side * 0.3, y + h, z], OAK);
    }
    for (const end of [-1, 1])
      b.box([0.045, 0.36, 0.045], [x + side * 0.29, y + 0.18, z + end * 0.21], OAK);
  }
}
function board(b: PlotGeometry) {
  for (const x of [-0.28, 0.28]) b.box([0.055, 1.08, 0.055], [x, 0.54, 0], OAK);
  b.box([0.62, 0.47, 0.06], [0, 0.8, 0], IRON);
  b.box([0.71, 0.05, 0.075], [0, 1.05, 0], CREAM);
}

function buildMillDetails() {
  const b = new PlotGeometry();
  for (const anchor of [
    A.millRestNorth,
    A.millRestSouth,
    { position: [-34, 0, -4] as Vec3Tuple, rotation: Math.PI / 2 },
  ])
    at(b, anchor, (g) => seat(g, 1.8));
  // End table and two closed lunch tins, outside both occupied seat rectangles.
  at(b, { position: [-34, 0, -10], rotation: 0 }, (g) => {
    table(g, 0.62, 0.62);
    g.box([0.23, 0.12, 0.16], [-0.12, 0.885, 0], '#66796a');
    g.box([0.19, 0.12, 0.15], [0.13, 0.885, 0.06], '#98735e');
  });
  return b.finish();
}
function buildVillageDetails() {
  const b = new PlotGeometry();
  at(b, A.bakeryCounter, (g) => {
    table(g, 1.25, 0.58);
    for (const side of [-1, 1]) g.box([0.035, 0.12, 0.52], [side * 0.56, 0.89, 0], OAK);
    g.box([1.15, 0.12, 0.035], [0, 0.89, -0.25], OAK);
  });
  // Folded shop flour sacks and an empty return crate stay after deliveries.
  at(b, A.shopDelivery, (g) => {
    crate(g, 0, 0, 0);
    g.box([0.36, 0.09, 0.29], [0, 0.1, 0], CREAM);
  });
  for (const anchor of [A.pubSeatNorth, A.pubSeatSouth]) {
    at(b, anchor, (g) => {
      seat(g, 0.54);
      // Table beyond the sitter's knees, never across the pub's door approach.
      const start = g.parts.length;
      table(g, 0.55, 0.55);
      g.parts.slice(start).forEach((part) => part.translate(0, 0, 1.1));
    });
  }
  at(b, { position: villagePosition([15.1, 0, 3.2]), rotation: -Math.PI / 2 }, board);
  at(b, { position: villagePosition([-16.2, 0, 28.2]), rotation: Math.PI / 2 }, board);
  at(b, { position: villagePosition([-18.8, 0, -12]), rotation: Math.PI / 2 }, board);
  // Watering can on the allotment's central aisle beside its existing beds.
  const can = villagePosition([-24.65, 0, 9.7]);
  b.add(
    new THREE.CylinderGeometry(0.15, 0.19, 0.34, 10).translate(can[0], 0.19, can[2]),
    '#6a847a'
  );
  b.beam([can[0], 0.15, can[2]], [can[0] + 0.43, 0.42, can[2]], 0.055, '#6a847a');
  b.add(new THREE.TorusGeometry(0.14, 0.025, 5, 12).translate(can[0] - 0.16, 0.26, can[2]), IRON);
  return b.finish();
}

/** The existing vessel at (-145,.1,15) is static. Each line terminates at a
 * physical cleat and dedicated bollard; the road's moving vehicles never share it.
 */
function buildMooring() {
  const b = new PlotGeometry();
  // Delivered GLB gunwale raycasts at y .6525 here; cleat base is .655.
  for (const side of [-1, 1]) {
    const cleat: Vec3Tuple = [-146.05, 0.705, 15 + side * 4.5];
    const bollard: Vec3Tuple = [-151.65, 1.35, 15 + side * 7];
    b.box([0.1, 0.1, 0.3], cleat, IRON);
    b.add(
      new THREE.CylinderGeometry(0.13, 0.16, 1.5, 8).translate(bollard[0], 0.75, bollard[2]),
      OAK
    );
    b.box([0.42, 0.08, 0.1], bollard, IRON);
    for (let i = 0; i < 8; i++) {
      const point = (t: number): Vec3Tuple => [
        THREE.MathUtils.lerp(cleat[0], bollard[0], t),
        THREE.MathUtils.lerp(cleat[1], bollard[1], t) - Math.sin(t * Math.PI) * 0.09,
        THREE.MathUtils.lerp(cleat[2], bollard[2], t),
      ];
      b.beam(point(i / 8), point((i + 1) / 8), 0.035, '#b8a884');
    }
  }
  return b.finish();
}
function buildBread() {
  const b = new PlotGeometry();
  at(b, A.bakeryCounter, (g) => {
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        const x = -0.42 + col * 0.28;
        const z = -0.1 + row * 0.22;
        g.round([x, 0.9, z], [0.12, 0.075, 0.085], '#b87e43');
        for (const offset of [-0.035, 0.035])
          g.box([0.018, 0.01, 0.08], [x + offset, 0.968, z], '#dfb875', -0.3);
      }
  });
  return b.finish();
}
function buildDelivery() {
  const b = new PlotGeometry();
  at(b, A.shopDelivery, (g) => {
    crate(g, 0, 0.38, 0);
    for (const x of [-0.17, 0, 0.17]) {
      g.add(new THREE.CylinderGeometry(0.045, 0.055, 0.24, 8).translate(x, 0.55, 0), '#ede5ce');
      g.add(new THREE.CylinderGeometry(0.029, 0.029, 0.07, 8).translate(x, 0.705, 0), '#a1bcb3');
    }
    g.round([0, 0.22, 0.64], [0.25, 0.28, 0.2], CREAM);
  });
  return b.finish();
}

export const COMMUNITY_GEOMETRY = Object.freeze({
  mill: buildMillDetails(),
  village: buildVillageDetails(),
  mooring: buildMooring(),
  bread: buildBread(),
  delivery: buildDelivery(),
});

function OpeningBoard({
  position,
  rotation,
  open,
  label,
}: {
  position: Vec3Tuple;
  rotation: number;
  open: boolean;
  label: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]} userData={{ noStaticBatch: true }}>
      <SceneText
        position={[0, 0.8, 0.035]}
        fontSize={0.1}
        color={open ? '#e5dfbe' : '#b9c0b3'}
        surface="painted"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
      >
        {`${label}\n${open ? 'OPEN' : 'CLOSED'}`}
      </SceneText>
      {/* A modest fixture face, no new light/shadow source. */}
      <mesh position={[0, 1.08, 0]} geometry={UNIT_BOX} scale={[0.12, 0.035, 0.09]}>
        <meshStandardMaterial
          color="#d9c391"
          emissive="#ffc476"
          emissiveIntensity={open ? 0.45 : 0}
        />
      </mesh>
    </group>
  );
}

/** Goods are opt-in signals of verified customer fulfillment, never clock-only claims. */
export const CommunityDetails = React.memo(
  ({
    deliveryVisible = false,
    bakeryStocked = false,
  }: {
    deliveryVisible?: boolean;
    bakeryStocked?: boolean;
  }) => {
    const state = useGameSimulationStore((s) => {
      const h = getCommunityHours(s.gameTime);
      return Number(h.shopsOpen) | (Number(h.pubOpen) << 1) | (Number(h.gardeningActive) << 2);
    });
    const shopsOpen = Boolean(state & 1);
    const pubOpen = Boolean(state & 2);
    return (
      <group name="community-daily-life-details" dispose={null}>
        <StaticMeshBatch name="community-authored-static" surface={applyBatchWorldSurface}>
          {(['mill', 'village', 'mooring'] as const).map((name) => (
            <mesh
              key={name}
              name={`community-${name}`}
              geometry={COMMUNITY_GEOMETRY[name]}
              material={MATERIAL}
              castShadow
              receiveShadow
            />
          ))}
        </StaticMeshBatch>
        <group name="community-open-hours" userData={{ noStaticBatch: true }}>
          <mesh
            name="bakery-fresh-bread"
            visible={shopsOpen && bakeryStocked}
            geometry={COMMUNITY_GEOMETRY.bread}
            material={MATERIAL}
            castShadow
            receiveShadow
          />
          <mesh
            name="shop-arrived-delivery"
            visible={deliveryVisible}
            geometry={COMMUNITY_GEOMETRY.delivery}
            material={MATERIAL}
            castShadow
            receiveShadow
          />
          <mesh
            name="allotment-watered-bed"
            visible={Boolean(state & 4)}
            position={villagePosition([-25.35, 0.207, 11.9])}
            geometry={UNIT_BOX}
            scale={[1.6, 0.008, 1.7]}
            material={WET_SOIL}
            receiveShadow
          />
          <OpeningBoard
            position={villagePosition([15.1, 0, 3.2])}
            rotation={-Math.PI / 2}
            open={shopsOpen}
            label="BAKER"
          />
          <OpeningBoard
            position={villagePosition([-16.2, 0, 28.2])}
            rotation={Math.PI / 2}
            open={shopsOpen}
            label="GROCER"
          />
          <OpeningBoard
            position={villagePosition([-18.8, 0, -12])}
            rotation={Math.PI / 2}
            open={pubOpen}
            label="PUB"
          />
        </group>
      </group>
    );
  }
);
CommunityDetails.displayName = 'CommunityDetails';
