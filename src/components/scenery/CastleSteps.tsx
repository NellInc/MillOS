import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import { castleWorldPosition, castleApproachVertexHeight } from '../../utils/castleNavigation';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CASTLE_STEPS,
  CASTLE_APPROACH,
  CASTLE_ACCESS_LANTERNS,
  CASTLE_ACCESS_LIGHT,
  CASTLE_STAIR_X,
  CASTLE_STAIR_WIDTH,
  CASTLE_ROCK_SINK,
} from '../../constants/castleAccess';
import { useGraphicsStore } from '../../stores/graphicsStore';
import {
  ExteriorLampPool,
  ExteriorPointLight,
  EXTERIOR_LAMP_LENS_MATERIAL,
} from '../exterior/ExteriorLighting';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { applyWorldSurface } from '../../utils/worldSurface';

/** Closed stone support with a top triangulated identically to walking. */
export function createCastleApproachGeometry(segments: number): THREE.BufferGeometry {
  const a = CASTLE_APPROACH,
    vertices: number[] = [],
    faces: number[] = [];
  for (let row = 0; row <= a.rows; row++) {
    const z = a.minZ + (row * (a.maxZ - a.minZ)) / a.rows;
    for (let column = 0; column <= a.columns; column++) {
      const x = CASTLE_STAIR_X - CASTLE_STAIR_WIDTH / 2 + (column * CASTLE_STAIR_WIDTH) / a.columns;
      const top = castleApproachVertexHeight(x, z, segments);
      vertices.push(x, top, z);
    }
  }
  const topCount = vertices.length / 3;
  for (let i = 0; i < topCount; i++) {
    const x = vertices[i * 3],
      z = vertices[i * 3 + 2];
    const [wx, , wz] = castleWorldPosition(x, 0, z);
    const castle = SITE_LAYOUT.landmarks.castle;
    const ground =
      (SITE_LAYOUT.datum.terrain +
        sampleTerrainGroundHeight(wx, wz, segments) -
        castle.position[1]) /
        castle.scale +
      CASTLE_ROCK_SINK;
    vertices.push(x, Math.min(vertices[i * 3 + 1] - 0.15, ground - 0.25), z);
  }
  for (let row = 0; row < a.rows; row++)
    for (let column = 0; column < a.columns; column++) {
      const i = row * (a.columns + 1) + column,
        next = i + a.columns + 1;
      faces.push(i, next, i + 1, i + 1, next, next + 1);
      faces.push(
        i + topCount,
        i + 1 + topCount,
        next + topCount,
        i + 1 + topCount,
        next + 1 + topCount,
        next + topCount
      );
    }
  const side = (i: number, j: number) =>
    faces.push(i, j, i + topCount, j, j + topCount, i + topCount);
  for (let column = 0; column < a.columns; column++) {
    side(column + 1, column);
    const far = a.rows * (a.columns + 1) + column;
    side(far, far + 1);
  }
  for (let row = 0; row < a.rows; row++) {
    const i = row * (a.columns + 1),
      j = i + a.columns;
    side(i, i + a.columns + 1);
    side(j + a.columns + 1, j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  // Box/extruded stair parts carry UVs even though this shared finish does not
  // sample them. Keep the merge layout without allocating a texture.
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((vertices.length / 3) * 2), 2)
  );
  return geometry;
}

// One draw for the treads and the two stone cheek walls. Shared by the delivered
// palace and its fallback, so loading failure cannot remove the walking route.
export function createCastleStepsGeometry(segments = 128): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createCastleApproachGeometry(segments)];
  for (const { minZ, maxZ, height } of CASTLE_STEPS) {
    parts.push(
      new THREE.BoxGeometry(CASTLE_STAIR_WIDTH, height, maxZ - minZ).translate(
        CASTLE_STAIR_X,
        height / 2,
        (minZ + maxZ) / 2
      )
    );
  }
  // Smooth parapet caps follow each flight; the resting landing is horizontal.
  const profile = new THREE.Shape();
  profile.moveTo(15.7, 0);
  profile.lineTo(24.7, 0);
  profile.lineTo(24.7, 1.005);
  profile.lineTo(21.1, 2.38);
  profile.lineTo(20.2, 2.38);
  profile.lineTo(16.6, 3.88);
  profile.lineTo(15.7, 3.88);
  profile.closePath();
  for (const side of [-1, 1]) {
    const cheek = new THREE.ExtrudeGeometry(profile, { depth: 0.2, bevelEnabled: false, steps: 1 });
    // profile x becomes local z, extrusion becomes local x.
    cheek.rotateY(-Math.PI / 2);
    cheek.translate(CASTLE_STAIR_X + side * (CASTLE_STAIR_WIDTH / 2) + (side > 0 ? 0.2 : 0), 0, 0);
    parts.push(cheek);
  }
  const nonIndexed = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(nonIndexed);
  for (const part of new Set([...parts, ...nonIndexed])) part.dispose();
  return merged;
}
const MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#dce5e9', roughness: 0.94 }),
  'masonry'
);

const LANTERN_GEOMETRY = (() => {
  const g = new PlotGeometry();
  for (const [x, y, z] of CASTLE_ACCESS_LANTERNS) {
    g.box([0.1, 0.83, 0.1], [x, y - 0.59, z], '#394a49');
    for (const level of [-0.24, 0.24]) g.box([0.45, 0.07, 0.45], [x, y + level, z], '#394a49');
    for (const side of [-1, 1])
      for (const edge of [-1, 1])
        g.box([0.04, 0.48, 0.04], [x + side * 0.19, y, z + edge * 0.19], '#394a49');
  }
  return g.finish();
})();
const LANTERN_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
const LENS_GEOMETRY = new THREE.BoxGeometry(0.34, 0.42, 0.34);

export function CastleSteps() {
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const segments = getTerrainGridSegments(quality);
  const geometry = useMemo(() => createCastleStepsGeometry(segments), [segments]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const realLight = useGraphicsStore(
    (s) =>
      s.graphics.quality !== 'low' &&
      !s.graphics.perfDebug.disableLightingPolish &&
      !s.graphics.perfDebug.disablePunctualLights
  );
  return (
    <group position={[0, -CASTLE_ROCK_SINK, 0]}>
      <mesh
        name="castle-access-stairs"
        geometry={geometry}
        material={MATERIAL}
        castShadow
        receiveShadow
        dispose={null}
      />
      <group name="castle-access-lanterns">
        <mesh
          geometry={LANTERN_GEOMETRY}
          material={LANTERN_MATERIAL}
          castShadow
          receiveShadow
          dispose={null}
        />
        {CASTLE_ACCESS_LANTERNS.map((p, i) => (
          <mesh
            key={i}
            position={[...p]}
            geometry={LENS_GEOMETRY}
            material={EXTERIOR_LAMP_LENS_MATERIAL}
            dispose={null}
          />
        ))}
        <group position={[CASTLE_STAIR_X, 1.7, 20.65]} scale={[1, 1, 0.28]}>
          <ExteriorLampPool radius={1.4} />
        </group>
        <group position={[CASTLE_STAIR_X, 3.2, 16.15]} scale={[1, 1, 0.28]}>
          <ExteriorLampPool radius={1.4} />
        </group>
        {/* The same single source, mounted at the upper optic, reaches both flights
            and the gateway paving. Low keeps lens/pools; both isolation flags work. */}
        {realLight && (
          <ExteriorPointLight
            name="castle-access-light"
            position={[...CASTLE_ACCESS_LIGHT.position]}
            intensity={CASTLE_ACCESS_LIGHT.intensity}
            distance={CASTLE_ACCESS_LIGHT.distance}
          />
        )}
      </group>
    </group>
  );
}
