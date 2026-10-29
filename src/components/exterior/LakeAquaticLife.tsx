import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_VISUAL_TIME } from '../../utils/waterAppearance';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { LAKE_BASIN } from '../terrain/lakeBasin';

export const LAKE_FISH_COUNT = 8;
export const LAKE_FISH_CULL_RADIUS = 12;
const TAU = Math.PI * 2;

function tint(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex),
    data = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < data.length; i += 3) data.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

/** Small rudd/carp-like fish: shaped flank, gill collar, eyes, dorsal and
 * paired pectoral fins. Two shared instanced draws include articulated tails.
 */
export function createLakeFishGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const back = new THREE.Color('#6d7953'),
    side = new THREE.Color('#c8b575'),
    belly = new THREE.Color('#e0dcc0'),
    c = new THREE.Color();
  for (let ring = 0; ring <= 16; ring++) {
    const t = ring / 16,
      x = 0.31 - t * 0.545;
    const radius = 0.009 + Math.sin(Math.PI * t) ** 0.85 * 0.06;
    for (let radial = 0; radial <= 12; radial++) {
      const a = (radial / 12) * TAU,
        y = Math.cos(a) * radius,
        z = Math.sin(a) * radius * 0.72;
      positions.push(x, y, z);
      uvs.push(t, radial / 12);
      c.copy(side).lerp(y > 0 ? back : belly, Math.abs(Math.cos(a)) * 0.85);
      const scale = 0.95 + 0.05 * Math.sin(ring * 2.4 + radial * 0.9);
      colors.push(c.r * scale, c.g * scale, c.b * scale);
      if (ring < 16 && radial < 12) {
        const i = ring * 13 + radial;
        indices.push(i, i + 13, i + 1, i + 1, i + 13, i + 14);
      }
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  body.setIndex(indices);
  body.computeVertexNormals();
  const fin = (points: number[][], hex: string) => {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    return tint(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.006,
        bevelEnabled: false,
        curveSegments: 2,
      }).translate(0, 0, -0.003),
      hex
    );
  };
  const dorsal = fin(
    [
      [-0.13, 0.035],
      [-0.1, 0.105],
      [0.01, 0.1],
      [0.1, 0.05],
    ],
    '#9f9767'
  );
  const left = fin(
    [
      [0.09, 0],
      [0.025, 0.11],
      [-0.06, 0.095],
      [0.01, 0],
    ],
    '#bba46c'
  )
    .rotateX(Math.PI / 2)
    .translate(0, -0.015, 0.018);
  const right = left.clone().scale(1, 1, -1);
  const eyes = [-1, 1].map((sign) =>
    tint(new THREE.SphereGeometry(0.009, 8, 5).translate(0.25, 0.012, sign * 0.032), '#182a22')
  );
  const gill = tint(
    new THREE.TorusGeometry(0.039, 0.003, 3, 16, Math.PI * 1.4)
      .rotateY(Math.PI / 2)
      .translate(0.19, 0, 0),
    '#797c57'
  );
  const parts = [body, dorsal, left, right, ...eyes, gill];
  const normalized = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalized, false);
  new Set([...parts, ...normalized]).forEach((g) => g.dispose());
  if (!merged) throw new Error('Cannot assemble lake fish');
  merged.name = 'lake-fish-body';
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const tail = fin(
    [
      [0, 0.02],
      [-0.2, 0.105],
      [-0.15, 0],
      [-0.2, -0.105],
      [0, -0.02],
    ],
    '#b99a5d'
  );
  tail.name = 'lake-fish-forked-tail';
  tail.computeBoundingBox();
  tail.computeBoundingSphere();
  return { body: merged, tail };
}

/** Two loose shoals stay over the deep basin, clear of banks and the surface.
 * Only the existing admitted water phase drives position, heading and tail.
 * Working if pause/reduced-motion hold the same matrices and all fish remain
 * between the actual bed and water surface through a complete swim cycle.
 */
export function writeLakeFishPose(index: number, time: number, target: THREE.Object3D) {
  const school = index < 4 ? 0 : 1,
    phase = ((index % 4) * TAU) / 4 + school * 0.5;
  const speed = school ? 0.087 : 0.105,
    a = time * speed + phase;
  const rx = school ? 2.9 : 2.3,
    rz = school ? 1.9 : 1.5;
  const x = (school ? -3.4 : 4.8) + Math.cos(a) * rx + Math.sin(a * 2 + school) * 0.22;
  const z = (school ? -2.1 : 1.9) + Math.sin(a) * rz + Math.cos(a * 3 + school) * 0.13;
  const dx = -Math.sin(a) * rx + Math.cos(a * 2 + school) * 0.44;
  const dz = Math.cos(a) * rz - Math.sin(a * 3 + school) * 0.39;
  target.position.set(x, -0.115 + Math.sin(a * 1.3 + phase) * 0.012, z);
  target.rotation.set(0, Math.atan2(-dz, dx), Math.sin(a * 2 + phase) * 0.035);
  target.scale.setScalar(0.88 + (index % 4) * 0.09);
  target.updateMatrix();
}

/** Component owns both instance buffers as well as shared geometry/material. */
export function disposeLakeFishResources(
  geometry: ReturnType<typeof createLakeFishGeometry>,
  material: THREE.Material,
  bodies: THREE.InstancedMesh | null,
  tails: THREE.InstancedMesh | null
) {
  bodies?.dispose();
  tails?.dispose();
  geometry.body.dispose();
  geometry.tail.dispose();
  material.dispose();
}

export const LakeAquaticLife = memo(function LakeAquaticLife() {
  const body = useRef<THREE.InstancedMesh>(null),
    tail = useRef<THREE.InstancedMesh>(null);
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const geometry = useMemo(createLakeFishGeometry, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        name: 'MillOS lake fish',
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.03,
        side: THREE.DoubleSide,
      }),
    []
  );
  const scratch = useMemo(
    () => ({ object: new THREE.Object3D(), body: new THREE.Matrix4(), tail: new THREE.Matrix4() }),
    []
  );
  useLayoutEffect(() => {
    const palettes = ['#ffffff', '#d9e3ed', '#f1c891', '#b4c3b7'].map((c) => new THREE.Color(c));
    for (let i = 0; i < LAKE_FISH_COUNT; i++) {
      body.current?.setColorAt(i, palettes[i % palettes.length]);
      tail.current?.setColorAt(i, palettes[i % palettes.length]);
    }
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
    if (tail.current?.instanceColor) tail.current.instanceColor.needsUpdate = true;
    // Fixed local shoal envelope includes every pose/tail sweep. Normal
    // frustum culling stays enabled without recomputing bounds each frame.
    const bounds = new THREE.Sphere(new THREE.Vector3(0, -0.1, 0), LAKE_FISH_CULL_RADIUS);
    if (body.current) body.current.boundingSphere = bounds;
    if (tail.current) tail.current.boundingSphere = bounds;
  }, []);
  useEffect(() => {
    const bodies = body.current,
      tails = tail.current;
    return () => disposeLakeFishResources(geometry, material, bodies, tails);
  }, [geometry, material]);
  useFrame((state) => {
    if (!body.current || !tail.current) return;
    const dx = state.camera.position.x - LAKE_BASIN.x,
      dz = state.camera.position.z - LAKE_BASIN.z;
    const visible = quality !== 'low' && dx * dx + dz * dz + state.camera.position.y ** 2 < 10000;
    body.current.visible = tail.current.visible = visible;
    if (!visible) return;
    const time = WATER_VISUAL_TIME.value;
    for (let i = 0; i < LAKE_FISH_COUNT; i++) {
      writeLakeFishPose(i, time, scratch.object);
      scratch.body.copy(scratch.object.matrix);
      body.current.setMatrixAt(i, scratch.body);
      scratch.object.position.set(-0.235, 0, 0);
      scratch.object.rotation.set(0, Math.sin(time * 2.8 + i * 1.7) * 0.38, 0);
      scratch.object.scale.setScalar(1);
      scratch.object.updateMatrix();
      scratch.tail.multiplyMatrices(scratch.body, scratch.object.matrix);
      tail.current.setMatrixAt(i, scratch.tail);
    }
    body.current.instanceMatrix.needsUpdate = tail.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="lake-aquatic-life" userData={{ dynamic: true, noStaticBatch: true }}>
      <instancedMesh
        name="lake-fish-bodies"
        ref={body}
        args={[geometry.body, material, LAKE_FISH_COUNT]}
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        name="lake-fish-tails"
        ref={tail}
        args={[geometry.tail, material, LAKE_FISH_COUNT]}
        receiveShadow
        dispose={null}
      />
    </group>
  );
});
