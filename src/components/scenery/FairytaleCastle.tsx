import React, { useMemo } from 'react';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { GeneratedBody } from '../models/GeneratedModel';
import { CastleSteps } from './CastleSteps';
import { CASTLE_ROCK_SINK, CASTLE_COURT_HEIGHT } from '../../constants/castleAccess';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { applyWorldSurface } from '../../utils/worldSurface';
import { EXTERIOR_LAYERS } from '../../constants/renderLayers';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { useGraphicsStore } from '../../stores/graphicsStore';
export { CASTLE_ROCK_SINK } from '../../constants/castleAccess';

interface FairytaleCastleProps {
  position?: [number, number, number];
  scale?: number;
  rotation?: [number, number, number];
}

/**
 * The historical export name is retained for MillScene and terrain consumers.
 * Both delivery and loading/error fallback follow Neuschwanstein: an elongated
 * white palas, curved blue slate roofs, one dominant round tower and a lower court.
 * Detailed editable geometry: scripts/blender/build_neuschwanstein_castle.py.
 */
const PLASTER = '#f6f7f2';
const TILE = '#306496';
const STONE = '#e6eef2';
const ROOF_PROFILE = [
  [1, 0],
  [0.74, 0.15],
  [0.39, 0.5],
  [0, 1],
] as const;

// x, z, width, depth, eave, ridge. Same wing datums as the authored delivery.
const WINGS = [
  [-5, -4, 13, 26, 25, 34.8],
  [13, 0.7, 4.8, 22, 13, 17.3],
  [-9.5, 12.35, 10, 5.9, 11.4, 16],
  [12.65, -10.6, 4.4, 4.4, 27.15, 29.6],
] as const;

function hipRoof(width: number, depth: number, rise: number, gable = false): THREE.BufferGeometry {
  const alongX = width >= depth;
  const w = alongX ? width : depth;
  const d = alongX ? depth : width;
  const pyramid = w < 5.5;
  // Same flared eaves as the authored delivery, keeping its apex/eave datums.
  if (gable || pyramid) {
    const vertices: number[] = [];
    const roof: number[] = [];
    const ends: number[] = [];
    const add = (x: number, y: number, z: number) => {
      vertices.push(...(alongX ? [x, y, z] : [z, y, -x]));
    };
    if (gable) {
      const profile = [
        ...ROOF_PROFILE.map(([r, t]) => new THREE.Vector2((-d / 2) * r, rise * t)),
        ...ROOF_PROFILE.slice(0, -1)
          .reverse()
          .map(([r, t]) => new THREE.Vector2((d / 2) * r, rise * t)),
      ];
      for (const x of [-w / 2, w / 2]) for (const p of profile) add(x, p.y, p.x);
      const n = profile.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        roof.push(i, j, n + j, i, n + j, n + i);
      }
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(profile, []))
        ends.push(a, b, c, n + a, n + c, n + b);
    } else {
      for (const [r, t] of ROOF_PROFILE.slice(0, -1))
        for (const [x, z] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ])
          add((x * w * r) / 2, t * rise, (z * d * r) / 2);
      add(0, rise, 0);
      for (let level = 0; level < 2; level++)
        for (let i = 0; i < 4; i++) {
          const a = level * 4 + i,
            b = level * 4 + ((i + 1) % 4);
          roof.push(a, a + 4, b + 4, a, b + 4, b);
        }
      for (let i = 0; i < 4; i++) roof.push(8 + i, 12, 8 + ((i + 1) % 4));
      roof.push(0, 1, 2, 0, 2, 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([...roof, ...ends]);
    geometry.addGroup(0, roof.length, 0);
    if (ends.length) geometry.addGroup(roof.length, ends.length, 1);
    geometry.computeVertexNormals();
    return geometry;
  }

  const inset = gable ? 0 : Math.min(d * 0.7, w * 0.25);
  const points = [
    [-w / 2, 0, -d / 2],
    [w / 2, 0, -d / 2],
    [w / 2, 0, d / 2],
    [-w / 2, 0, d / 2],
    ...(pyramid
      ? [[0, rise, 0]]
      : [
          [-w / 2 + inset, rise, 0],
          [w / 2 - inset, rise, 0],
        ]),
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      points.flatMap(([x, y, z]) => (alongX ? [x, y, z] : [z, y, -x])),
      3
    )
  );
  geometry.setIndex(
    pyramid
      ? [0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3]
      : [0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2, 0, 1, 2, 0, 2, 3]
  );
  if (gable) {
    geometry.addGroup(0, 12, 0);
    geometry.addGroup(12, 6, 1);
    geometry.addGroup(18, 6, 0);
  } else {
    geometry.addGroup(0, geometry.getIndex()!.count, 0);
  }
  geometry.computeVertexNormals();
  return geometry;
}
const ROOFS = WINGS.map(([, , w, d, eave, ridge], i) =>
  hipRoof(w + 0.7, d + 0.7, ridge - eave, i < 3)
);
const GATE_ROOF = hipRoof(15.6, 4.2, 1.9);
const TOWERS = [
  [2.05, -14, 1.85, 3.2, 35.5, 41.9],
  [-11.5, 8, 1.03, 17, 29.3, 33.8],
  [1.5, 8, 0.88, 18, 28.9, 32.8],
  [-0.5, 14.1, 1.18, 3.2, 13.1, 17.2],
  [14.9, 14.1, 1.18, 3.2, 13.1, 17.2],
] as const;
const TOWER_ROOFS = TOWERS.map(
  ([, , r, , eave, peak]) =>
    new THREE.LatheGeometry(
      ROOF_PROFILE.map(
        ([radius, height]) => new THREE.Vector2((r + 0.29) * radius, (peak - eave) * height)
      ),
      20
    )
);

// The delivered palace already contains its gallery and terrace parapets.
// This single merged setting occupies only the sheltered palas-side court,
// leaving the gateway axis and the accessible stair assembly untouched.
export const CASTLE_COURT_SETTING = (() => {
  const b = new PlotGeometry(),
    floor = CASTLE_COURT_HEIGHT;
  for (const z of [-6.5, 6.5]) {
    b.box([1.15, 0.43, 1.65], [3.15, floor + 0.215, z], STONE);
    b.box([1.27, 0.1, 1.77], [3.15, floor + 0.48, z], PLASTER);
    b.box([0.96, 0.035, 1.45], [3.15, floor + 0.545, z], '#574538');
    // Low clipped evergreen reads as one architectural mass, with a soft crown.
    for (const dz of [-0.45, 0, 0.45]) {
      b.round([3.15, floor + 0.79, z + dz], [0.4, 0.3, 0.36], '#526c56');
      b.round([3.2, floor + 1.02, z + dz], [0.26, 0.16, 0.27], '#78866b');
    }
  }
  // A stone-supported oak seat faces across the court rather than into the wall.
  for (const z of [-0.78, 0.78]) {
    b.box([0.58, 0.45, 0.28], [3.05, floor + 0.225, z], STONE);
    b.box([0.12, 0.55, 0.1], [2.83, floor + 0.74, z], '#394a49');
  }
  // The front slat stops 5 mm behind the iron uprights' face; flush, oak and
  // iron shared that plane in this one draw.
  for (const x of [2.85, 3.05, 3.25]) b.box([0.15, 0.1, 2.25], [x, floor + 0.49, 0], '#70533a');
  for (const y of [0.7, 0.9]) b.box([0.1, 0.14, 2.25], [2.83, floor + y, 0], '#70533a');
  // Flush drainage follows the palas frontage, behind the seating/planting.
  b.box([0.16, 0.018, 15.2], [2.05, floor + 0.01, 0], '#394a49');
  for (let i = 0; i < 38; i++)
    b.box([0.13, 0.012, 0.045], [2.05, floor + 0.024, -7.4 + i * 0.4], '#697780');
  return b.finish();
})();
/** Palas eaves and downpipes, in the delivered castle's local metres.
 * The turret returns end the gutter run; clips sit between the actual windows.
 * Working if straps touch slate, wall plates overlap plaster and outlets meet
 * the court drain/grate without entering the gateway or stair corridor.
 */
export const CASTLE_DRAIN_RUNS = [-1, 1].map((side) => ({
  side,
  wallX: -5 + side * 6.5,
  gutterX: -5 + side * 6.9,
  pipeX: -5 + side * 6.77,
  drainX: -5 + side * 7.05,
  z: -6.5,
  startZ: side > 0 ? -12.05 : -17.35,
  endZ: 6.65,
}));
export const CASTLE_DRAINAGE_GEOMETRY = (() => {
  const b = new PlotGeometry(),
    colour = '#6c7b80';
  const profile = new THREE.Shape();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    const x = Math.cos(a) * 0.105,
      y = -Math.sin(a) * 0.105;
    if (i === 0) profile.moveTo(x, y);
    else profile.lineTo(x, y);
  }
  for (let i = 8; i >= 0; i--) {
    const a = (i / 8) * Math.PI;
    profile.lineTo(Math.cos(a) * 0.085, -Math.sin(a) * 0.085);
  }
  profile.closePath();
  const end = new THREE.Shape();
  end.moveTo(0.105, 0);
  for (let i = 1; i <= 8; i++)
    end.lineTo(Math.cos((i / 8) * Math.PI) * 0.105, -Math.sin((i / 8) * Math.PI) * 0.105);
  end.closePath();
  for (const run of CASTLE_DRAIN_RUNS) {
    const { side, wallX, gutterX, pipeX, drainX, z, startZ, endZ } = run;
    b.add(
      new THREE.ExtrudeGeometry(profile, {
        depth: endZ - startZ,
        steps: 1,
        bevelEnabled: false,
      }).translate(gutterX, 24.99, startZ),
      colour
    );
    for (const capZ of [startZ, endZ - 0.025])
      b.add(
        new THREE.ExtrudeGeometry(end, { depth: 0.025, steps: 1, bevelEnabled: false }).translate(
          gutterX,
          24.99,
          capZ
        ),
        colour
      );
    const straps = Math.ceil((endZ - startZ) / 4);
    for (let i = 0; i <= straps; i++)
      b.box(
        [0.05, 0.24, 0.08],
        [gutterX - side * 0.05, 24.99, startZ + 0.3 + (i / straps) * (endZ - startZ - 0.6)],
        colour
      );
    const cup = new THREE.LatheGeometry(
      [
        [0.075, 0],
        [0.075, 0.04],
        [0.13, 0.2],
        [0.115, 0.2],
        [0.06, 0.04],
        [0.06, 0],
        [0.075, 0],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      8
    );
    b.add(cup.translate(gutterX, 24.69, z), colour);
    const point = (x: number, y: number) => new THREE.Vector3(x, y, z);
    const top = new THREE.CubicBezierCurve3(
      point(gutterX, 24.72),
      point(gutterX, 24.3),
      point(pipeX, 24.3),
      point(pipeX, 24.0)
    );
    const straight = new THREE.LineCurve3(point(pipeX, 24.0), point(pipeX, 3.9));
    const bottom = new THREE.CubicBezierCurve3(
      point(pipeX, 3.9),
      point(pipeX, 3.5),
      point(drainX, 3.7),
      point(drainX, 3.26)
    );
    for (const [curve, segments] of [
      [top, 8],
      [straight, 1],
      [bottom, 8],
    ] as const)
      b.add(new THREE.TubeGeometry(curve, segments, 0.075, 8, false), colour);
    for (const y of [5.2, 10, 14.8, 19.6, 23.7]) {
      b.box([0.23, 0.13, 0.13], [wallX + side * 0.09, y, z], colour);
      b.add(
        new THREE.TorusGeometry(0.085, 0.012, 4, 12).rotateX(Math.PI / 2).translate(pipeX, y, z),
        colour
      );
    }
    if (side < 0) {
      // The sheltered side meets the existing long court channel; this outer
      // outlet receives a small grate on the same delivered paving datum.
      b.box([0.34, 0.018, 0.36], [drainX, 3.211, z], '#263330');
      for (let i = 0; i < 5; i++)
        b.box([0.028, 0.018, 0.34], [drainX - 0.12 + i * 0.06, 3.235, z], colour);
    }
  }
  return b.finish();
})();
export const CASTLE_DRAINAGE_MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.61, metalness: 0 }),
  'painted'
);

const COURT_MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  'masonry'
);

// Low clipped borders soften the rock apron, outside both the gate and stair
// corridor. Their bottoms follow the shipping terrain triangles at every tier.
export const CASTLE_APPROACH_BEDS = [
  { x: -12, z: 21.6, width: 4.4, depth: 1.6 },
  { x: -5, z: 21.6, width: 4, depth: 1.6 },
  { x: 0.6, z: 21.6, width: 3.1, depth: 1.6 },
  { x: 13.2, z: 21.6, width: 3.2, depth: 1.6 },
] as const;

/** Closed three-petal blooms replace the old isolated tetrahedral spikes.
 * Working if planting reads as flowers, uses32triangles per cluster and keeps
 * the existing merged draw, grounded bed and original5200-triangle cap.
 */
export function addCastleApproachBloom(
  b: PlotGeometry,
  x: number,
  y: number,
  z: number,
  colour: string
) {
  const phase = x * 0.73 + z * 0.41;
  b.add(
    new THREE.TetrahedronGeometry(1).scale(0.018, 0.13, 0.018).translate(x, y - 0.11, z),
    '#718367'
  );
  for (let petal = 0; petal < 3; petal++) {
    const geometry = new THREE.OctahedronGeometry(1);
    geometry.setAttribute('normal', geometry.getAttribute('position').clone());
    geometry
      .scale(0.105, 0.045, 0.14)
      .translate(0, 0, 0.115)
      .rotateY(phase + (petal * Math.PI * 2) / 3)
      .rotateX(0.24)
      .translate(x, y, z);
    b.add(geometry, colour);
  }
  b.add(
    new THREE.TetrahedronGeometry(1).scale(0.055, 0.04, 0.055).translate(x, y + 0.035, z),
    '#e4c580'
  );
}

export function createCastleSetting(
  position: [number, number, number],
  rotation: [number, number, number],
  scale: number,
  segments: number
) {
  const transform = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale, scale, scale)
  );
  const inverse = transform.clone().invert();
  const sample = new THREE.Vector3();
  const ground = (x: number, z: number) => {
    sample.set(x, -CASTLE_ROCK_SINK, z).applyMatrix4(transform);
    sample.y = EXTERIOR_LAYERS.ground + sampleTerrainGroundHeight(sample.x, sample.z, segments);
    return sample.applyMatrix4(inverse).y + CASTLE_ROCK_SINK;
  };
  const b = new PlotGeometry();
  const conform = (g: THREE.BufferGeometry, colour: string) => {
    const points = g.getAttribute('position');
    for (let i = 0; i < points.count; i++)
      points.setY(i, points.getY(i) + ground(points.getX(i), points.getZ(i)));
    g.computeVertexNormals();
    b.add(g, colour);
  };
  for (const { x, z, width, depth } of CASTLE_APPROACH_BEDS) {
    conform(
      new THREE.PlaneGeometry(width, depth, 8, 3).rotateX(-Math.PI / 2).translate(x, 0.025, z),
      '#594e40'
    );
    for (const side of [-1, 1]) {
      const count = Math.ceil(width / 0.55);
      for (let i = 0; i < count; i++)
        conform(
          new THREE.BoxGeometry(width / count - 0.014, 0.18, 0.14).translate(
            x - width / 2 + ((i + 0.5) * width) / count,
            0.085,
            z + (side * depth) / 2
          ),
          STONE
        );
      conform(
        new THREE.BoxGeometry(0.14, 0.18, depth - 0.14).translate(x + (side * width) / 2, 0.085, z),
        STONE
      );
    }
    const count = Math.ceil(width / 0.9);
    for (let i = 0; i < count; i++) {
      const px = x - width / 2 + ((i + 0.5) * width) / count;
      const pz = z + (i % 2 ? 0.11 : -0.11);
      b.add(
        new THREE.IcosahedronGeometry(1, 1)
          .scale(0.51, 0.34 + (i % 3) * 0.025, 0.49)
          .rotateY(i * 0.73)
          .translate(px, ground(px, pz) + 0.37, pz),
        i % 2 ? '#587353' : '#45654d'
      );
      // Small lavender and ivory clusters stay below the clipped crown.
      for (const side of [-1, 1]) {
        const flowerZ = z + side * 0.58;
        b.round([px, ground(px, flowerZ) + 0.19, flowerZ], [0.23, 0.17, 0.2], '#77826c');
        const flowerX = px + Math.sin(px * 1.7) * 0.055;
        addCastleApproachBloom(
          b,
          flowerX,
          ground(flowerX, flowerZ) + 0.38,
          flowerZ,
          side < 0 ? '#b5accb' : '#e1ddbd'
        );
      }
    }
  }
  const approach = b.finish();
  const merged = mergeGeometries([CASTLE_COURT_SETTING, approach]);
  approach.dispose();
  if (!merged) throw new Error('Castle setting must retain matching vertex-colour attributes');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function CastleSetting({ position, rotation, scale }: Required<FairytaleCastleProps>) {
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const segments = getTerrainGridSegments(quality);
  const geometry = useMemo(
    () => createCastleSetting(position, rotation, scale, segments),
    [position, rotation, scale, segments]
  );
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      name="castle-sheltered-court-setting"
      position={[0, -CASTLE_ROCK_SINK, 0]}
      geometry={geometry}
      material={COURT_MATERIAL}
      receiveShadow
      castShadow
      dispose={null}
    />
  );
}

const PalaceFallback: React.FC = React.memo(() => (
  <group name="neuschwanstein-palace-fallback" position={[0, -CASTLE_ROCK_SINK, 0]}>
    <mesh position={[0, 1.6, 0]} receiveShadow>
      <boxGeometry args={[31.7, 3.2, 31.7]} />
      <meshStandardMaterial color={STONE} roughness={0.95} />
    </mesh>
    {WINGS.map(([x, z, w, d, eave], i) => (
      <group key={i}>
        <mesh position={[x, (3.2 + eave) / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[w, eave - 3.2, d]} />
          <meshStandardMaterial color={PLASTER} roughness={0.88} />
        </mesh>
        <mesh position={[x, eave, z]} geometry={ROOFS[i]} castShadow receiveShadow>
          <meshStandardMaterial attach="material-0" color={TILE} roughness={0.88} flatShading />
          <meshStandardMaterial attach="material-1" color={PLASTER} roughness={0.88} />
        </mesh>
      </group>
    ))}
    {TOWERS.map(([x, z, r, base, eave], i) => (
      <group key={`${x},${z}`}>
        <mesh position={[x, (base + eave) / 2, z]} castShadow receiveShadow>
          <cylinderGeometry args={[r, r, eave - base, 20]} />
          <meshStandardMaterial color={PLASTER} roughness={0.88} />
        </mesh>
        <mesh position={[x, eave, z]} geometry={TOWER_ROOFS[i]} castShadow receiveShadow>
          <meshStandardMaterial color={TILE} roughness={0.88} />
        </mesh>
      </group>
    ))}
    {/* An open passage is retained even while the detailed delivery is unavailable. */}
    {[-1, 1].map((side) => (
      <mesh key={side} position={[7.2 + side * 4.675, 7.3, 13.65]} castShadow receiveShadow>
        <boxGeometry args={[5.65, 8.2, 3.6]} />
        <meshStandardMaterial color="#eff5f6" roughness={0.88} />
      </mesh>
    ))}
    <mesh position={[7.2, 9.75, 13.65]} castShadow receiveShadow>
      <boxGeometry args={[3.7, 3.3, 3.6]} />
      <meshStandardMaterial color="#eff5f6" roughness={0.88} />
    </mesh>
    <mesh position={[7.2, 11.4, 13.65]} geometry={GATE_ROOF} castShadow receiveShadow>
      <meshStandardMaterial color={TILE} roughness={0.88} flatShading />
    </mesh>
  </group>
));
PalaceFallback.displayName = 'PalaceFallback';

export const FairytaleCastle: React.FC<FairytaleCastleProps> = React.memo(
  ({ position = [0, 0, 0], scale = 1, rotation = [0, 0, 0] }: FairytaleCastleProps) => (
    <group name="heritage-castle" position={position} scale={scale} rotation={rotation}>
      <GeneratedBody asset="castle" sink={CASTLE_ROCK_SINK} fallback={<PalaceFallback />} />
      <CastleSetting position={position} rotation={rotation} scale={scale} />
      <mesh
        name="castle-rainwater-hardware"
        position={[0, -CASTLE_ROCK_SINK, 0]}
        geometry={CASTLE_DRAINAGE_GEOMETRY}
        material={CASTLE_DRAINAGE_MATERIAL}
        castShadow
        receiveShadow
        dispose={null}
      />
      <CastleSteps />
    </group>
  )
);
FairytaleCastle.displayName = 'FairytaleCastle';
