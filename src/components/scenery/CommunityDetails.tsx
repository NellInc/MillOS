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

/** Open stoneware, including an inside wall, lip and a real recessed drink.
 * Working if the base touches the .825m table and the mouth is visibly hollow,
 * all in the incumbent static batch with ordinary lit material.
 */
export function addCommunityCup(b: PlotGeometry, x: number, z: number, colour: string) {
  const y = 0.825;
  b.add(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.045, 0],
        [0.052, 0.015],
        [0.057, 0.1],
        [0.055, 0.112],
        [0.045, 0.112],
        [0.043, 0.018],
        [0, 0.018],
      ].map((p) => new THREE.Vector2(...p)),
      12
    ).translate(x, y, z),
    colour
  );
  b.add(
    new THREE.TorusGeometry(0.032, 0.009, 5, 10).scale(0.8, 1, 1).translate(x + 0.064, y + 0.06, z),
    colour
  );
  b.add(
    new THREE.CircleGeometry(0.045, 12).rotateX(-Math.PI / 2).translate(x, y + 0.078, z),
    '#453024'
  );
}

/** Toasting follows each loaf's actual height, plus sparse flour patches.
 * Working if crust has deterministic tonal separation without changing bounds,
 * UVs, normals, stock counts, ordinary lighting or delivery visibility.
 */
function toastBread(g: THREE.BufferGeometry, colour: string, bottom: number, height: number) {
  const p = g.getAttribute('position'),
    c = g.getAttribute('color');
  const base = new THREE.Color(colour),
    flour = new THREE.Color('#dfcca5'),
    shade = base.clone();
  for (let i = 0; i < p.count; i++) {
    const crown = THREE.MathUtils.clamp((p.getY(i) - bottom) / height, 0, 1);
    const patch = Math.sin(p.getX(i) * 23 + p.getZ(i) * 37) * Math.cos(p.getZ(i) * 21);
    shade.copy(base).multiplyScalar(1.07 - crown * 0.23 + patch * 0.035);
    shade.lerp(flour, Math.max(0, patch - 0.32) * 0.3 * crown);
    c.setXYZ(i, shade.r, shade.g, shade.b);
  }
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
    for (const [x, z, width, depth, paint] of [
      [-0.12, 0, 0.23, 0.16, '#66796a'],
      [0.13, 0.06, 0.19, 0.15, '#98735e'],
    ] as const) {
      g.add(new RoundedBoxGeometry(width, 0.1, depth, 2, 0.018).translate(x, 0.875, z), paint);
      g.add(
        new RoundedBoxGeometry(width + 0.006, 0.02, depth + 0.006, 2, 0.006).translate(x, 0.935, z),
        CREAM
      );
    }
    addCommunityCup(g, -0.09, -0.21, CREAM);
    addCommunityCup(g, 0.17, -0.19, '#6a847a');
  });
  return b.finish();
}
/** Hollow enamel vessel, curved spout and attached rose, all in the existing
 * static colour batch. Working if its mouth is open, fittings meet the body
 * and the original allotment footprint/ground contact remain intact.
 */
export function addCommunityWateringCan(b: PlotGeometry) {
  const enamel = '#6a847a';
  b.add(
    new THREE.LatheGeometry(
      [
        [0, 0.02],
        [0.15, 0.02],
        [0.18, 0.045],
        [0.185, 0.07],
        [0.16, 0.31],
        [0.145, 0.35],
        [0.125, 0.35],
        [0.135, 0.3],
        [0.155, 0.075],
        [0.13, 0.05],
        [0, 0.05],
      ].map((p) => new THREE.Vector2(...p)),
      12
    ),
    enamel
  );
  b.add(
    new THREE.TorusGeometry(0.136, 0.009, 4, 12).rotateX(Math.PI / 2).translate(0, 0.35, 0),
    enamel
  );
  b.add(
    new THREE.TorusGeometry(0.14, 0.021, 4, 12, Math.PI)
      .rotateZ(Math.PI / 2)
      .scale(1, 0.115 / 0.14, 1)
      .translate(-0.16, 0.225, 0),
    IRON
  );
  const points = [
    [0.13, 0.15, 0],
    [0.22, 0.19, 0],
    [0.32, 0.29, 0],
    [0.402, 0.385, 0],
  ].map((p) => new THREE.Vector3(...p));
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.026, 6, false), enamel);
  const centre = points[3],
    direction = new THREE.Vector3(0.65, 0.76, 0).normalize();
  const faceRotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction
  );
  const collarRotation = new THREE.Quaternion().setFromUnitVectors(
    THREE.Object3D.DEFAULT_UP,
    direction
  );
  b.add(
    new THREE.CylinderGeometry(0.047, 0.029, 0.016, 12)
      .applyQuaternion(collarRotation)
      .translate(...centre.toArray()),
    enamel
  );
  const face = centre.clone().addScaledVector(direction, 0.0085);
  b.add(
    new THREE.CircleGeometry(0.043, 12).applyQuaternion(faceRotation).translate(...face.toArray()),
    '#9eaa8b'
  );
  b.add(
    new THREE.TorusGeometry(0.044, 0.004, 3, 12)
      .applyQuaternion(faceRotation)
      .translate(...face.toArray()),
    IRON
  );
  // Small dark rose perforation details are printed matter, so remain lit.
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI) / 3;
    const point =
      i === 6
        ? new THREE.Vector3()
        : new THREE.Vector3(Math.cos(angle) * 0.024, Math.sin(angle) * 0.024, 0);
    point.applyQuaternion(faceRotation).add(face).addScaledVector(direction, 0.0005);
    b.add(
      new THREE.CircleGeometry(0.0035, 5)
        .applyQuaternion(faceRotation)
        .translate(...point.toArray()),
      IRON
    );
  }
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
      addCommunityCup(g, 0.12, 1.17, CREAM);
    });
  }
  at(b, A.bakeryBoard, board);
  at(b, A.shopBoard, board);
  at(b, { position: villagePosition([-18.8, 0, -12]), rotation: Math.PI / 2 }, board);
  // Watering can on the allotment's central aisle beside its existing beds.
  const can = villagePosition([-24.65, 0, 9.7]);
  at(b, { position: can, rotation: 0 }, addCommunityWateringCan);
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
      for (const part of g.parts.slice(-2)) toastBread(part, colour, 0.825, height);
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
      g.add(
        new THREE.LatheGeometry(
          [
            [0, 0],
            [0.048, 0],
            [0.055, 0.015],
            [0.055, 0.18],
            [0.05, 0.213],
            [0.028, 0.24],
            [0.028, 0.3],
            [0, 0.3],
          ].map((p) => new THREE.Vector2(...p)),
          10
        ).translate(x, 0.42, 0),
        '#ede5ce'
      );
      g.add(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 10).translate(x, 0.7225, 0), '#a1bcb3');
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
            position={A.bakeryBoard.position}
            rotation={A.bakeryBoard.rotation}
            open={shopsOpen}
            label="BAKER"
            detail={getBakeryBoardDetail(shopsOpen, bakeryStocked)}
          />
          <OpeningBoard
            position={A.shopBoard.position}
            rotation={A.shopBoard.rotation}
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
