import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';

type Point = [number, number, number];
export const SLEEPING_CAT_HEAD = new THREE.Matrix4().compose(
  new THREE.Vector3(0.095, 0.105, 0.105),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, 0.45, -0.12)),
  new THREE.Vector3(1, 1, 1)
);
const MATERIAL = new THREE.MeshStandardMaterial({
  name: 'sleeping-cat-coat',
  vertexColors: true,
  roughness: 0.87,
});
const CREAM = '#ebcf9e';
const INK = '#51372c';

/** Closed, variable-section curves in cat metres, rather than a torus handle.
 * Working if both ends are capped and the tail tapers into the original nook.
 */
function sweep(points: Point[], width: (t: number) => number, height: (t: number) => number) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const positions: number[] = [],
    indices: number[] = [],
    rows = 36,
    sides = 16;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows,
      p = curve.getPoint(t),
      tangent = curve.getTangent(t),
      side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    for (let col = 0; col <= sides; col++) {
      const a = (col / sides) * Math.PI * 2;
      positions.push(
        p.x + side.x * width(t) * Math.cos(a),
        p.y + height(t) * Math.sin(a),
        p.z + side.z * width(t) * Math.cos(a)
      );
      if (row < rows && col < sides) {
        const i = row * (sides + 1) + col,
          next = i + sides + 1;
        indices.push(i, i + 1, next, next, i + 1, next + 1);
      }
    }
  }
  for (const end of [0, 1]) {
    const p = curve.getPoint(end),
      centre = positions.length / 3,
      offset = end * rows * (sides + 1);
    positions.push(p.x, p.y, p.z);
    for (let col = 0; col < sides; col++)
      indices.push(centre, offset + col + (end ? 0 : 1), offset + col + (end ? 1 : 0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Restrained ginger stripes follow the authored surface, without a texture. */
function coat(g: THREE.BufferGeometry, colour: string, tail = false) {
  const base = new THREE.Color(colour).lerp(new THREE.Color('#d9aa70'), 0.26),
    shade = new THREE.Color(),
    p = g.attributes.position,
    values = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      phase = tail ? Math.atan2(z - 0.02, x + 0.04) * 8 : x * 77 + z * 17 + Math.sin(y * 32),
      band = THREE.MathUtils.smoothstep(Math.sin(phase), 0.35, 0.8);
    shade.copy(base).multiplyScalar(0.96 - band * 0.2 + Math.sin(z * 19 + y * 11) * 0.035);
    shade.toArray(values, i * 3);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}

export function createSleepingCatHeadGeometry() {
  return new THREE.SphereGeometry(1, 20, 12)
    .scale(0.09, 0.065, 0.08)
    .applyMatrix4(SLEEPING_CAT_HEAD);
}

export function createSleepingCatGeometry(colour: string) {
  const body = coat(
    sweep(
      [
        [0.11, 0.1, 0.025],
        [0.06, 0.12, -0.075],
        [-0.08, 0.115, -0.105],
        [-0.17, 0.09, -0.01],
        [-0.09, 0.065, 0.085],
      ],
      (t) => 0.045 + Math.sin(t * Math.PI) * 0.058,
      (t) => 0.042 + Math.sin(t * Math.PI) * 0.055
    ),
    colour
  );
  const b = new PlotGeometry();
  const add = (g: THREE.BufferGeometry, c: string, head = false) => {
    g.deleteAttribute('uv');
    if (head) g.applyMatrix4(SLEEPING_CAT_HEAD);
    b.add(g, c);
  };
  const sphere = (r: Point, p: Point) =>
    new THREE.SphereGeometry(1, 20, 12).scale(...r).translate(...p);
  b.parts.push(coat(createSleepingCatHeadGeometry(), colour));
  for (const x of [-0.016, 0.045]) {
    add(sphere([0.037, 0.022, 0.05], [x, 0.026, 0.14]), CREAM);
    for (const dx of [-0.011, 0.008])
      add(
        new THREE.TubeGeometry(
          new THREE.LineCurve3(
            new THREE.Vector3(x + dx, 0.04, 0.165),
            new THREE.Vector3(x + dx, 0.039, 0.18)
          ),
          3,
          0.0009,
          4
        ),
        '#bc956a'
      );
  }
  b.parts.push(
    coat(
      sweep(
        [
          [-0.19, 0.07, -0.04],
          [-0.245, 0.041, 0.045],
          [-0.17, 0.026, 0.18],
          [-0.015, 0.026, 0.213],
          [0.12, 0.032, 0.151],
        ],
        (t) => 0.027 * (1 - t) + 0.005,
        (t) => 0.025 * (1 - t) + 0.005
      ),
      colour,
      true
    )
  );
  for (const x of [-0.021, 0.021])
    add(sphere([0.029, 0.021, 0.019], [x, -0.026, 0.073]), CREAM, true);
  const skull = new THREE.Mesh(
    createSleepingCatHeadGeometry(),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  skull.updateMatrixWorld();
  const inverseHead = SLEEPING_CAT_HEAD.clone().invert();
  const surface = (x: number, y: number) => {
    const start = new THREE.Vector3(x, y, 0.3).applyMatrix4(SLEEPING_CAT_HEAD);
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(SLEEPING_CAT_HEAD);
    return new THREE.Raycaster(start, direction)
      .intersectObject(skull)[0]
      .point.applyMatrix4(inverseHead).z;
  };
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 9 }, (_, i) => {
      const x = side * (0.023 + (i / 8) * 0.033),
        y = 0.003 - Math.sin((i / 8) * Math.PI) * 0.005;
      return new THREE.Vector3(x, y, surface(x, y) + 0.0006);
    });
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.0015, 5), INK, true);
  }
  skull.geometry.dispose();
  skull.material.dispose();
  add(sphere([0.009, 0.005, 0.004], [0, -0.021, 0.091]), '#a46c61', true);
  add(
    new THREE.TubeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(0, -0.024, 0.091),
        new THREE.Vector3(0, -0.035, 0.087)
      ),
      3,
      0.0011,
      4
    ),
    INK,
    true
  );
  const ear = (side: number) => {
    const e = new PlotGeometry(),
      shape = new THREE.Shape();
    shape.moveTo(-0.024, 0);
    shape.lineTo(0.025, 0);
    shape.lineTo(side * 0.011, 0.056);
    shape.closePath();
    // The pink inset fills a hole cut through the shell, rather than lying
    // 0.1 mm over its face: overlapping, the two shared a depth in this one
    // draw. A coat-coloured plug closes the hole at the back cap.
    const insetAt = (mirror: number) => {
      const s = new THREE.Shape();
      s.moveTo(-0.014 * mirror, 0.007);
      s.lineTo(0.015 * mirror, 0.007);
      s.lineTo(side * 0.009 * mirror, 0.043);
      s.closePath();
      return s;
    };
    shape.holes.push(insetAt(1));
    const shell = new THREE.ExtrudeGeometry(shape, {
      depth: 0.011,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 1,
      steps: 1,
    });
    shell.deleteAttribute('uv');
    e.add(shell, colour);
    const inner = new THREE.ShapeGeometry(insetAt(1)).translate(0, 0, 0.0141);
    inner.deleteAttribute('uv');
    e.add(inner, '#c18c7c');
    const plug = new THREE.ShapeGeometry(insetAt(-1)).rotateY(Math.PI).translate(0, 0, -0.003);
    plug.deleteAttribute('uv');
    e.add(plug, colour);
    return e.finish();
  };
  const details = b.finish(),
    leftEar = ear(1),
    rightEar = ear(-1);
  for (const g of [body, details, leftEar, rightEar]) {
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
  return { body, details, leftEar, rightEar };
}

/** Only local transforms, sampled by the existing Cat owner. No timer/driver.
 * Working if the base, paws and head stay settled while the flank rises <4mm.
 */
export function sleepingCatRest(time: number) {
  const t = Number.isFinite(time) && time > 0 ? time : 0;
  const pulse = (period: number, delay: number, duration: number) => {
    const p = ((t % period) - delay) / duration;
    return p > 0 && p < 1 ? Math.sin(p * Math.PI) ** 2 : 0;
  };
  return {
    bodyY: 1 + Math.sin((t * Math.PI * 2) / 4.3) * 0.014,
    leftEar: pulse(14, 3, 0.9) * 0.065,
    rightEar: -pulse(19, 9, 1.1) * 0.055 || 0,
  };
}

export interface SleepingCatHandle {
  setResting(time: number): void;
}
export const SleepingCatCraft = forwardRef<SleepingCatHandle, { colour: string }>(
  ({ colour }, ref) => {
    const g = useMemo(() => createSleepingCatGeometry(colour), [colour]),
      body = useRef<THREE.Mesh>(null),
      left = useRef<THREE.Group>(null),
      right = useRef<THREE.Group>(null);
    useEffect(() => () => Object.values(g).forEach((part) => part.dispose()), [g]);
    useImperativeHandle(
      ref,
      () => ({
        setResting(time) {
          const pose = sleepingCatRest(time);
          if (body.current) body.current.scale.y = pose.bodyY;
          if (left.current) left.current.rotation.z = pose.leftEar;
          if (right.current) right.current.rotation.z = pose.rightEar;
        },
      }),
      []
    );
    return (
      <group name="sleeping-cat-craft" userData={{ dynamic: true }} dispose={null}>
        <mesh
          name="sleeping-cat-flank"
          ref={body}
          geometry={g.body}
          material={MATERIAL}
          castShadow
          receiveShadow
        />
        <mesh
          name="sleeping-cat-settled-details"
          geometry={g.details}
          material={MATERIAL}
          castShadow
          receiveShadow
        />
        <group matrix={SLEEPING_CAT_HEAD} matrixAutoUpdate={false}>
          <group name="sleeping-cat-left-ear" ref={left} position={[0.054, 0.042, -0.014]}>
            <mesh geometry={g.leftEar} material={MATERIAL} castShadow />
          </group>
          <group name="sleeping-cat-right-ear" ref={right} position={[-0.054, 0.042, -0.014]}>
            <mesh geometry={g.rightEar} material={MATERIAL} castShadow />
          </group>
        </group>
      </group>
    );
  }
);
SleepingCatCraft.displayName = 'SleepingCatCraft';
