import React from 'react';
import * as THREE from 'three';
import { GeneratedBody } from '../models/GeneratedModel';
import { CastleSteps } from './CastleSteps';
import { CASTLE_ROCK_SINK } from '../../constants/castleAccess';
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
      <CastleSteps />
    </group>
  )
);
FairytaleCastle.displayName = 'FairytaleCastle';
