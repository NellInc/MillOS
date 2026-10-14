import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  COMMUNITY_ANCHORS as A,
  getCommunityHours,
  getBakeryBoardDetail,
  getCommunityReopeningDetail,
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
/** Small eased timber edges inside the original board envelope. Colour varies
 * by board and face, without a texture, extra draw or per-frame work. Working if
 * seat tops remain at .46m and all supports/approaches keep their original bounds.
 */
export function addCommunityTimber(
  b: PlotGeometry,
  size: Vec3Tuple,
  position: Vec3Tuple,
  eased = false
) {
  const geometry = eased
    ? new RoundedBoxGeometry(...size, 1, Math.min(...size) * 0.075)
    : new THREE.BoxGeometry(...size);
  b.add(geometry, OAK);
  const colors = geometry.getAttribute('color'),
    normals = geometry.getAttribute('normal');
  const base = new THREE.Color(OAK),
    shade = base.clone();
  const boardTone =
    0.96 + 0.04 * Math.sin(position[0] * 2.1 + position[1] * 4.3 + position[2] * 7.7);
  for (let i = 0; i < colors.count; i++) {
    shade.copy(base).multiplyScalar(boardTone + normals.getY(i) * 0.025 + normals.getZ(i) * 0.012);
    colors.setXYZ(i, shade.r, shade.g, shade.b);
  }
  geometry.translate(...position);
}

function seat(b: PlotGeometry, width: number) {
  // Seat top exactly .46; a seated root at ground needs no compensating lift.
  for (const z of [-0.18, 0, 0.18]) addCommunityTimber(b, [width, 0.08, 0.15], [0, 0.42, z], true);
  for (const y of [0.66, 0.86]) addCommunityTimber(b, [width, 0.14, 0.07], [0, y, -0.24], true);
  for (const x of [-width * 0.36, width * 0.36]) {
    b.box([0.065, 0.9, 0.07], [x, 0.45, -0.25], IRON);
    b.box([0.065, 0.39, 0.07], [x, 0.195, 0.2], IRON);
  }
}
function table(b: PlotGeometry, width: number, depth: number) {
  addCommunityTimber(b, [width, 0.09, depth], [0, 0.78, 0]);
  for (const x of [-width * 0.4, width * 0.4])
    for (const z of [-depth * 0.35, depth * 0.35])
      b.box([0.055, 0.735, 0.055], [x, 0.368, z], IRON);
}
function crate(b: PlotGeometry, x: number, y: number, z: number) {
  addCommunityTimber(b, [0.64, 0.04, 0.46], [x, y + 0.02, z]);
  for (const side of [-1, 1]) {
    for (const h of [0.13, 0.29]) {
      addCommunityTimber(b, [0.64, 0.09, 0.04], [x, y + h, z + side * 0.22]);
      addCommunityTimber(b, [0.04, 0.09, 0.46], [x + side * 0.3, y + h, z]);
    }
    for (const end of [-1, 1])
      addCommunityTimber(b, [0.045, 0.36, 0.045], [x + side * 0.29, y + 0.18, z + end * 0.21]);
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

function buildBread() {
  const b = new PlotGeometry();
  at(b, A.bakeryCounter, (g) => {
    // Soft baked contours with a closed flat base, seated on the existing .825m
    // table. A single merged stock mesh keeps the delivery visibility contract.
    // Working if all five pieces touch the counter and stay inside its rails.
    const base = Math.cos(Math.PI * 0.7);
    for (const [x, z, rx, height, rz, baguette, colour] of [
      [-0.27, -0.12, 0.24, 0.1, 0.075, true, '#bb874e'],
      [0.27, -0.12, 0.24, 0.1, 0.075, true, '#ad733d'],
      [-0.36, 0.13, 0.14, 0.15, 0.095, false, '#b87e43'],
      [0, 0.13, 0.13, 0.14, 0.1, false, '#a96c3c'],
      [0.36, 0.13, 0.14, 0.15, 0.095, false, '#c29258'],
    ] as const) {
      g.add(
        new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.7)
          .translate(0, -base, 0)
          .scale(rx, height / (1 - base), rz)
          .translate(x, 0.825, z),
        colour
      );
      g.add(
        new THREE.CircleGeometry(Math.sqrt(1 - base * base), 12)
          .rotateX(Math.PI / 2)
          .scale(rx, 1, rz)
          .translate(x, 0.825, z),
        colour
      );
      // Shallow scored arcs follow the actual ellipsoid rather than floating
      // boxes. Their pale cut faces and crust retain ordinary scene lighting.
      for (const cut of baguette ? [-0.12, 0, 0.12] : [-0.035, 0.035]) {
        const points = Array.from({ length: 5 }, (_, i) => {
          const dz = (i / 4 - 0.5) * rz * 1.15;
          const dx = cut + dz * 0.45;
          const dy =
            ((Math.sqrt(1 - (dx / rx) ** 2 - (dz / rz) ** 2) - base) * height) / (1 - base);
          return new THREE.Vector3(x + dx, 0.825 + dy + 0.0006, z + dz);
        });
        g.add(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 5, 0.003, 3, false),
          '#e1bd80'
        );
      }
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
  bread: buildBread(),
  delivery: buildDelivery(),
});

function OpeningBoard({
  position,
  rotation,
  open,
  label,
  detail,
}: {
  position: Vec3Tuple;
  rotation: number;
  open: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]} userData={{ noStaticBatch: true }}>
      <SceneText
        position={[0, 0.8, 0.035]}
        fontSize={detail ? 0.075 : 0.1}
        maxWidth={0.54}
        lineHeight={1.18}
        color={open ? '#e5dfbe' : '#b9c0b3'}
        surface="painted"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
      >
        {`${label}\n${open ? 'OPEN' : 'CLOSED'}${detail ? `\n${detail}` : ''}`}
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

/** Wet soil reflects actual weather, never a fictitious clock-only watering event.
 * Working if rain/storm wet the bed at any hour while clear/cloudy stay dry.
 */
export function communityDetailsFlags(
  hour: number,
  weather: 'clear' | 'cloudy' | 'rain' | 'storm'
) {
  const hours = getCommunityHours(hour);
  return (
    Number(hours.shopsOpen) |
    (Number(hours.pubOpen) << 1) |
    (Number(weather === 'rain' || weather === 'storm') << 2)
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
    const state = useGameSimulationStore((s) => communityDetailsFlags(s.gameTime, s.weather));
    const shopsOpen = Boolean(state & 1);
    const pubOpen = Boolean(state & 2);
    return (
      <group name="community-daily-life-details" dispose={null}>
        <StaticMeshBatch name="community-authored-static" surface={applyBatchWorldSurface}>
          {(['mill', 'village'] as const).map((name) => (
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
            name="allotment-weather-moist-bed"
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
            detail={getBakeryBoardDetail(shopsOpen, bakeryStocked)}
          />
          <OpeningBoard
            position={villagePosition([-16.2, 0, 28.2])}
            rotation={Math.PI / 2}
            open={shopsOpen}
            label="GROCER"
            detail={getCommunityReopeningDetail('shops', shopsOpen)}
          />
          <OpeningBoard
            position={villagePosition([-18.8, 0, -12])}
            rotation={Math.PI / 2}
            open={pubOpen}
            label="PUB"
            detail={getCommunityReopeningDetail('pub', pubOpen)}
          />
        </group>
      </group>
    );
  }
);
CommunityDetails.displayName = 'CommunityDetails';
