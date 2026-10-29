import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { WATER_VISUAL_TIME } from '../../utils/waterAppearance';
import { LAKE_BASIN } from '../terrain/lakeBasin';
import { LAKE_REED_REACHES } from './lakeShoreDetails';

export const LAKE_DRAGONFLY_COUNT = 4;
export const LAKE_DRAGONFLY_BOUNDS = 24;
export const DRAGONFLY_REST_HEIGHT = 0.021;
const UP = new THREE.Vector3(0, 1, 0);

/** Land on actual seed-head vertices, rather than duplicating reed dimensions.
 * Working if each returned anchor exists in the rendered vegetation surface.
 */
export function createLakeDragonflyPerches(vegetation: THREE.BufferGeometry) {
  const p = vegetation.getAttribute('position');
  return LAKE_REED_REACHES.map((angle) => {
    let best = -1;
    for (let i = 0; i < p.count; i++) {
      const direction = Math.atan2(-p.getZ(i), p.getX(i));
      if (Math.cos(direction - angle) < 0.96) continue;
      if (best < 0 || p.getY(i) > p.getY(best)) best = i;
    }
    if (best < 0) throw new Error('Missing dragonfly reed perch');
    return new THREE.Vector3().fromBufferAttribute(p, best);
  });
}

function tint(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function assemble(parts: THREE.BufferGeometry[], name: string) {
  const normalized = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const result = mergeGeometries(normalized, false);
  new Set([...parts, ...normalized]).forEach((g) => g.dispose());
  if (!result) throw new Error('Cannot assemble lake dragonfly');
  result.name = name;
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Segmented abdomen, compound eyes, six bent legs and four articulated,
 * lightly translucent veined wings. Three instanced draws include fitted legs.
 */
export function createLakeDragonflyGeometry() {
  const segment = (a: THREE.Vector3, b: THREE.Vector3, radius: number, color: string) => {
    const delta = b.clone().sub(a);
    return tint(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 4)
        .applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
        )
        .translate(...a.clone().add(b).multiplyScalar(0.5).toArray()),
      color
    );
  };
  const body: THREE.BufferGeometry[] = [
    tint(new THREE.SphereGeometry(1, 10, 6).scale(0.018, 0.011, 0.011), '#488d84'),
    tint(new THREE.SphereGeometry(0.009, 8, 5).translate(0.023, 0.001, 0), '#466c55'),
  ];
  for (let i = 0; i < 7; i++) {
    body.push(
      tint(
        new THREE.CylinderGeometry(0.004 - i * 0.0003, 0.0037 - i * 0.0003, 0.012, 7)
          .rotateZ(Math.PI / 2)
          .translate(-0.02 - i * 0.011, 0, 0),
        i % 2 ? '#284c4b' : '#5eaaa4'
      )
    );
  }
  for (const sign of [-1, 1]) {
    body.push(
      tint(new THREE.SphereGeometry(0.007, 8, 5).translate(0.026, 0.004, sign * 0.006), '#83a16b')
    );
    body.push(
      tint(new THREE.SphereGeometry(0.0018, 6, 4).translate(0.03, 0.007, sign * 0.009), '#d4dcba')
    );
  }
  const outline = [
    [0, 0],
    [0.009, 0.024],
    [0.006, 0.064],
    [-0.002, 0.092],
    [-0.008, 0.088],
    [-0.016, 0.043],
    [-0.01, 0.009],
  ];
  const membrane = tint(
    new THREE.ShapeGeometry(
      new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)))
    ).rotateX(Math.PI / 2),
    '#d8dfcc'
  );
  const veins = [membrane];
  for (const [x, z] of [
    [0.005, 0.064],
    [-0.002, 0.09],
    [-0.014, 0.043],
  ]) {
    veins.push(
      segment(new THREE.Vector3(0, 0.0003, 0), new THREE.Vector3(x, 0.0003, z), 0.00025, '#7d967e')
    );
  }
  for (let i = 1; i < 4; i++) {
    veins.push(
      segment(
        new THREE.Vector3(-0.008, 0.0003, i * 0.02),
        new THREE.Vector3(0.006 - i * 0.001, 0.0003, i * 0.02 + 0.005),
        0.00018,
        '#91a287'
      )
    );
  }
  return {
    body: assemble(body, 'lake-dragonfly-body'),
    wing: assemble(veins, 'lake-dragonfly-veined-wing'),
    leg: tint(new THREE.CylinderGeometry(1, 1, 1, 5), '#34463b'),
  };
}

/** Smooth takeoff/landing and a quiet rest each cycle, all on the admitted
 * water phase. Working if held phases preserve every body and wing matrix.
 */
export function writeLakeDragonflyPose(
  index: number,
  time: number,
  perch: THREE.Vector3,
  target: THREE.Object3D
) {
  const cycle = (((time + index * 8.7) % 36) + 36) % 36;
  const lift =
    THREE.MathUtils.smoothstep(cycle, 4, 8) * (1 - THREE.MathUtils.smoothstep(cycle, 27, 32));
  const a = time * 0.73 + index * 1.7;
  target.position.set(
    perch.x + Math.sin(a) * 0.65 * lift,
    perch.y + DRAGONFLY_REST_HEIGHT + (0.22 + 0.12 * Math.sin(a * 1.3)) * lift,
    perch.z + Math.sin(a * 0.7 + index) * 0.48 * lift
  );
  target.rotation.set(
    0.035 * Math.sin(a) * lift,
    index * 1.3 + Math.sin(a * 0.6) * lift,
    0.07 * Math.cos(a) * lift
  );
  target.scale.setScalar(0.94 + index * 0.05);
  // Leg contacts are fitted to this scaled resting body transform once.
  target.position.y += DRAGONFLY_REST_HEIGHT * (target.scale.x - 1);
  target.updateMatrix();
  return lift;
}

export function writeLakeDragonflyWingPose(
  wing: number,
  time: number,
  index: number,
  lift: number,
  target: THREE.Object3D
) {
  const sign = wing % 2 ? -1 : 1;
  target.position.set(wing < 2 ? 0.009 : -0.008, 0.006, sign * 0.006);
  target.rotation.set(
    (sign < 0 ? Math.PI : 0) +
      sign * (0.06 + Math.sin(time * 38 + index + wing * 0.6) * 0.5 * lift),
    wing < 2 ? 0.28 : -0.26,
    0
  );
  target.scale.set(wing < 2 ? 1 : 1.15, 1, wing < 2 ? 1 : 0.9);
  target.updateMatrix();
}

/** Fit all six actual feet to the same rendered seed head. Local contact
 * coordinates survive the body's size/yaw and blend into tucked flight legs.
 */
export function createLakeDragonflyContacts(
  vegetation: THREE.BufferGeometry,
  perches: readonly THREE.Vector3[]
) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const support = new THREE.Mesh(vegetation, material);
  support.updateMatrixWorld(true);
  const pose = new THREE.Object3D();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  try {
    return perches.map((perch, index) => {
      writeLakeDragonflyPose(index, 36 - index * 8.7, perch, pose);
      const inverse = pose.matrix.clone().invert();
      return Array.from({ length: 6 }, (_, leg) => {
        const sign = leg < 3 ? -1 : 1;
        const foot = new THREE.Vector3(
          -0.018 + (leg % 3) * 0.01,
          -DRAGONFLY_REST_HEIGHT,
          sign * 0.021
        ).applyMatrix4(pose.matrix);
        ray.ray.origin.set(foot.x, perch.y + 0.1, foot.z);
        const hit = ray.intersectObject(support)[0];
        if (!hit || perch.y - hit.point.y > 0.1) throw new Error('Missing dragonfly foot support');
        return hit.point.applyMatrix4(inverse);
      });
    });
  } finally {
    material.dispose();
  }
}

export function writeLakeDragonflyLegPose(
  leg: number,
  segment: number,
  lift: number,
  contact: THREE.Vector3,
  target: THREE.Object3D
) {
  const sign = leg < 3 ? -1 : 1,
    x = -0.009 + (leg % 3) * 0.01;
  const kneeX = x + 0.006,
    kneeY = -0.011 + lift * 0.004,
    kneeZ = sign * (0.017 - lift * 0.007);
  const ax = segment === 0 ? x : kneeX,
    ay = segment === 0 ? -0.005 : kneeY,
    az = segment === 0 ? sign * 0.006 : kneeZ;
  const bx = segment === 0 ? kneeX : THREE.MathUtils.lerp(contact.x, x - 0.006, lift);
  const by = segment === 0 ? kneeY : THREE.MathUtils.lerp(contact.y, -0.013, lift);
  const bz = segment === 0 ? kneeZ : THREE.MathUtils.lerp(contact.z, sign * 0.012, lift);
  const length = Math.hypot(bx - ax, by - ay, bz - az),
    radius = segment === 0 ? 0.0008 : 0.0006;
  target.position.set((bx - ax) / length, (by - ay) / length, (bz - az) / length);
  target.quaternion.setFromUnitVectors(UP, target.position);
  target.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  target.scale.set(radius, length, radius);
  target.updateMatrix();
}

export function disposeLakeDragonflies(
  geometry: ReturnType<typeof createLakeDragonflyGeometry>,
  materials: THREE.Material[],
  bodies: THREE.InstancedMesh | null,
  wings: THREE.InstancedMesh | null,
  legs: THREE.InstancedMesh | null
) {
  bodies?.dispose();
  wings?.dispose();
  legs?.dispose();
  geometry.body.dispose();
  geometry.wing.dispose();
  geometry.leg.dispose();
  materials.forEach((m) => m.dispose());
}

export const LakeDragonflies = memo(function LakeDragonflies({
  vegetation,
}: {
  vegetation: THREE.BufferGeometry;
}) {
  const bodies = useRef<THREE.InstancedMesh>(null),
    wings = useRef<THREE.InstancedMesh>(null),
    legs = useRef<THREE.InstancedMesh>(null);
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const perches = useMemo(() => createLakeDragonflyPerches(vegetation), [vegetation]);
  const contacts = useMemo(
    () => createLakeDragonflyContacts(vegetation, perches),
    [vegetation, perches]
  );
  const geometry = useMemo(createLakeDragonflyGeometry, []);
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({
        name: 'MillOS dragonfly body',
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.08,
      }),
      new THREE.MeshStandardMaterial({
        name: 'MillOS dragonfly wings',
        vertexColors: true,
        roughness: 0.48,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true,
      }),
    ],
    []
  );
  const scratch = useMemo(
    () => ({ object: new THREE.Object3D(), body: new THREE.Matrix4(), wing: new THREE.Matrix4() }),
    []
  );
  useLayoutEffect(() => {
    const palette = ['#ffffff', '#c9cf9b', '#b7d7de', '#e2d4ab'].map((hex) => new THREE.Color(hex));
    for (let i = 0; i < LAKE_DRAGONFLY_COUNT; i++) bodies.current?.setColorAt(i, palette[i]);
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
    const bounds = new THREE.Sphere(new THREE.Vector3(), LAKE_DRAGONFLY_BOUNDS);
    if (bodies.current) bodies.current.boundingSphere = bounds;
    if (wings.current) wings.current.boundingSphere = bounds;
    if (legs.current) legs.current.boundingSphere = bounds;
  }, []);
  useEffect(() => {
    const body = bodies.current,
      wing = wings.current,
      leg = legs.current;
    return () => disposeLakeDragonflies(geometry, materials, body, wing, leg);
  }, [geometry, materials]);
  useFrame((state) => {
    if (!bodies.current || !wings.current || !legs.current) return;
    const hour = useGameSimulationStore.getState().gameTime;
    const dx = state.camera.position.x - LAKE_BASIN.x,
      dz = state.camera.position.z - LAKE_BASIN.z;
    const visible =
      quality !== 'low' &&
      hour >= 7 &&
      hour < 19.5 &&
      dx * dx + dz * dz + state.camera.position.y ** 2 < 5625;
    bodies.current.visible = wings.current.visible = legs.current.visible = visible;
    if (!visible) return;
    const time = WATER_VISUAL_TIME.value;
    for (let i = 0; i < LAKE_DRAGONFLY_COUNT; i++) {
      const lift = writeLakeDragonflyPose(i, time, perches[i], scratch.object);
      scratch.body.copy(scratch.object.matrix);
      bodies.current.setMatrixAt(i, scratch.body);
      for (let wing = 0; wing < 4; wing++) {
        writeLakeDragonflyWingPose(wing, time, i, lift, scratch.object);
        scratch.wing.multiplyMatrices(scratch.body, scratch.object.matrix);
        wings.current.setMatrixAt(i * 4 + wing, scratch.wing);
      }
      for (let leg = 0; leg < 6; leg++)
        for (let segment = 0; segment < 2; segment++) {
          writeLakeDragonflyLegPose(leg, segment, lift, contacts[i][leg], scratch.object);
          scratch.wing.multiplyMatrices(scratch.body, scratch.object.matrix);
          legs.current.setMatrixAt(i * 12 + leg * 2 + segment, scratch.wing);
        }
    }
    bodies.current.instanceMatrix.needsUpdate =
      wings.current.instanceMatrix.needsUpdate =
      legs.current.instanceMatrix.needsUpdate =
        true;
  });
  return (
    <group name="lake-dragonflies" userData={{ dynamic: true, noStaticBatch: true }}>
      <instancedMesh
        name="lake-dragonfly-bodies"
        ref={bodies}
        args={[geometry.body, materials[0], LAKE_DRAGONFLY_COUNT]}
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        name="lake-dragonfly-wings"
        ref={wings}
        args={[geometry.wing, materials[1], LAKE_DRAGONFLY_COUNT * 4]}
        receiveShadow
        dispose={null}
      />
      <instancedMesh
        name="lake-dragonfly-legs"
        ref={legs}
        args={[geometry.leg, materials[0], LAKE_DRAGONFLY_COUNT * 12]}
        receiveShadow
        dispose={null}
      />
    </group>
  );
});
