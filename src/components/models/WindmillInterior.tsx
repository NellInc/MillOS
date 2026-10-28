import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WindmillLearningStage } from '../../stores/windmillLearningStore';
import { applyWorldSurface } from '../../utils/worldSurface';
import { angularRatios, gearContacts, sampleGrainPath, grainPhase } from './windmillMechanism';

type Parts = THREE.BufferGeometry[];
type Point = THREE.Vector3Tuple;
const CX = -0.03;
const CZ = 0.006;

/** Each geometry is built in real component metres before surface treatment. */
export function createWindmillInteriorGeometry(scale: number) {
  const wood: Parts = [],
    stone: Parts = [],
    iron: Parts = [],
    cream: Parts = [],
    cloth: Parts = [];
  const crown: Parts = [],
    upright: Parts = [],
    nut: Parts = [],
    runner: Parts = [];
  const transform = (
    parts: Parts,
    geometry: THREE.BufferGeometry,
    p: Point,
    rotation: Point = [0, 0, 0]
  ) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
    geometry.translate(...p);
    geometry.scale(scale, scale, scale);
    // All primitive types merge through the same non-indexed attribute contract.
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    parts.push(plain);
  };
  const box = (parts: Parts, p: Point, size: Point, rotation?: Point) =>
    transform(parts, new THREE.BoxGeometry(...size), p, rotation);
  const cylinder = (
    parts: Parts,
    p: Point,
    r: number,
    h: number,
    rotation?: Point,
    top = r,
    segments = 24
  ) => transform(parts, new THREE.CylinderGeometry(top, r, h, segments), p, rotation);
  const ring = (
    parts: Parts,
    p: Point,
    inner: number,
    outer: number,
    h: number,
    arc = Math.PI * 2
  ) =>
    transform(
      parts,
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(inner, -h / 2),
          new THREE.Vector2(outer, -h / 2),
          new THREE.Vector2(outer, h / 2),
          new THREE.Vector2(inner, h / 2),
          new THREE.Vector2(inner, -h / 2),
        ],
        32,
        arc === Math.PI ? Math.PI / 2 : 0,
        arc
      ),
      p
    );
  const beam = (parts: Parts, a: Point, b: Point, width: number) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const geometry = new THREE.BoxGeometry(width, start.distanceTo(end), width);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.clone().sub(start).normalize()
      )
    );
    transform(parts, geometry, start.add(end).multiplyScalar(0.5).toArray());
  };
  // A closed cross-section creates an actual thick lining, including both cut returns.
  transform(
    cream,
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.219, -0.428),
        new THREE.Vector2(0.164, 0.069),
        new THREE.Vector2(0.154, 0.069),
        new THREE.Vector2(0.209, -0.428),
        new THREE.Vector2(0.219, -0.428),
      ],
      32,
      Math.PI / 2,
      Math.PI
    ),
    [CX, 0, CZ]
  );
  for (const side of [-1, 1]) {
    beam(cream, [CX + side * 0.214, -0.428, CZ], [CX + side * 0.159, 0.069, CZ], 0.011);
  }
  for (const y of [-0.428, -0.22]) {
    // Full circular galleries surround the machinery opening, supported below.
    ring(wood, [CX, y, CZ], 0.115, y < -0.3 ? 0.211 : 0.187, 0.009);
    for (const z of [-0.13, 0.115]) box(wood, [CX, y - 0.014, z], [0.3, 0.02, 0.018]);
  }
  for (const x of [-0.16, 0.12]) {
    for (const z of [-0.1, 0.09]) {
      box(wood, [x, -0.19, z], [0.019, 0.47, 0.019]);
      beam(wood, [x, -0.21, z], [x * 0.55, -0.12, z], 0.012);
    }
  }
  // Bearing trestles transmit the shaft loads into the timber frame.
  for (const y of [0.0948, -0.24]) {
    box(wood, [-0.045, y - 0.035, 0.031], [0.24, 0.019, 0.028]);
    for (const x of [-0.13, 0.07]) beam(wood, [x, y - 0.095, -0.03], [x, y - 0.025, 0.031], 0.014);
  }

  for (const y of [-0.12, -0.29]) ring(iron, [-0.06, y, 0.031], 0.008, 0.015, 0.012);
  // Crown wheel lies in YZ, with face pegs pointing west along -X.
  // The windshaft is part of this same rigid +1 assembly, reaching the retained bearing.
  cylinder(crown, [0, -0.13, 0], 0.009, 0.31, undefined, 0.009, 12);
  ring(crown, [0, 0, 0], 0.047, 0.063, 0.012);
  for (const a of [0, Math.PI / 2]) box(crown, [0, 0, 0], [0.118, 0.012, 0.013], [0, a, 0]);
  for (let i = 0; i < gearContacts.crown.teeth; i++) {
    const a = (i * Math.PI * 2) / 48 + gearContacts.crown.phase;
    cylinder(
      crown,
      [Math.cos(a) * 0.066, 0.008, Math.sin(a) * 0.066],
      0.0022,
      0.017,
      undefined,
      0.0022,
      6
    );
  }
  // Crown is authored about Y then reoriented to X, including its face pegs.
  for (const geometry of crown) geometry.rotateZ(Math.PI / 2);
  // Wallower, upright shaft and great spur are one rigid -3 assembly.
  cylinder(upright, [0, -0.21, 0], 0.007, 0.46, undefined, 0.007, 12);
  for (const y of [-0.011, 0.011]) cylinder(upright, [0, y, 0], 0.024, 0.005);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    cylinder(
      upright,
      [Math.cos(a) * 0.022, 0, Math.sin(a) * 0.022],
      0.0028,
      0.025,
      undefined,
      0.0028,
      6
    );
  }
  const spurY = -0.4208;
  ring(upright, [0, spurY, 0], 0.043, 0.062, 0.014);
  for (const a of [0, Math.PI / 2]) box(upright, [0, spurY, 0], [0.12, 0.014, 0.012], [0, a, 0]);
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI * 2) / 64 + gearContacts.spur.phase;
    box(
      upright,
      [Math.cos(a) * 0.064, spurY, Math.sin(a) * 0.064],
      [0.005, 0.012, 0.003],
      [0, -a, 0]
    );
  }
  cylinder(nut, [0, 0.04, 0], 0.0045, 0.085, undefined, 0.0045, 12);
  cylinder(nut, [0, 0, 0], 0.0135, 0.018, undefined, 0.0135, 16);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    box(nut, [Math.cos(a) * 0.016, 0, Math.sin(a) * 0.016], [0.005, 0.016, 0.003], [0, -a, 0]);
  }
  // Two separate annular stones, an open eye, a visible inter-stone gap.
  ring(stone, [0.02, -0.207, 0.031], 0.009, 0.072, 0.018);
  ring(runner, [0, 0, 0], 0.009, 0.071, 0.012);
  // Separated face sectors leave real radial furrows down to the basal stone.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 + 0.018;
    const span = Math.PI / 6 - 0.036;
    const face = new THREE.Shape();
    face.moveTo(Math.cos(a) * 0.012, Math.sin(a) * 0.012);
    face.absarc(0, 0, 0.012, a, a + span, false);
    face.lineTo(Math.cos(a + span) * 0.07, Math.sin(a + span) * 0.07);
    face.absarc(0, 0, 0.07, a + span, a, true);
    face.closePath();
    transform(
      runner,
      new THREE.ExtrudeGeometry(face, {
        depth: 0.003,
        bevelEnabled: true,
        bevelSize: 0.0004,
        bevelThickness: 0.0004,
        bevelSegments: 1,
        curveSegments: 2,
      }),
      [0, 0.0058, 0],
      [-Math.PI / 2, 0, 0]
    );
  }
  ring(wood, [0.02, -0.195, 0.031], 0.074, 0.079, 0.032, Math.PI);
  // Four tapered hopper panels, rather than a solid cone hiding its contents.
  for (const side of [-1, 1]) {
    box(wood, [0.02 + side * 0.025, -0.102, 0.031], [0.004, 0.052, 0.056], [0, 0, side * -0.45]);
    box(wood, [0.02, -0.102, 0.031 + side * 0.025], [0.056, 0.052, 0.004], [side * 0.45, 0, 0]);
  }
  box(wood, [0.025, -0.145, 0.031], [0.035, 0.004, 0.018], [0, 0, -0.22]);
  for (const z of [0.02, 0.042]) box(wood, [0.025, -0.14, z], [0.035, 0.01, 0.003], [0, 0, -0.22]);
  // Meal chute has a rear panel and two sides; its front is genuinely open.
  box(wood, [0.087, -0.285, 0.088], [0.022, 0.14, 0.004]);
  for (const x of [0.075, 0.099]) box(wood, [x, -0.285, 0.096], [0.004, 0.14, 0.02]);
  cylinder(cloth, [0.087, -0.386, 0.098], 0.029, 0.064, undefined, 0.021, 16);
  ring(cloth, [0.087, -0.353, 0.098], 0.014, 0.022, 0.005);
  const lists = { wood, stone, iron, cream, cloth, crown, upright, nut, runner };
  return Object.fromEntries(
    Object.entries(lists).map(([name, parts]) => {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach((part) => part.dispose());
      geometry.computeBoundingSphere();
      return [name, geometry];
    })
  ) as Record<keyof typeof lists, THREE.BufferGeometry>;
}

export interface WindmillInteriorProps {
  angle: THREE.IUniform<number>;
  stage: WindmillLearningStage;
  modelScale: number;
  modelOrigin: THREE.Vector3Tuple;
}

export function WindmillInterior({ angle, stage, modelScale, modelOrigin }: WindmillInteriorProps) {
  const crown = useRef<THREE.Mesh>(null),
    upright = useRef<THREE.Mesh>(null);
  const nut = useRef<THREE.Mesh>(null),
    runner = useRef<THREE.Mesh>(null);
  const grain = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createWindmillInteriorGeometry(modelScale), [modelScale]);
  const materials = useMemo(() => {
    const make = (
      color: string,
      profile: 'painted' | 'masonry' | 'metal' | 'fabric',
      metalness = 0
    ) =>
      applyWorldSurface(
        new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness }),
        profile,
        { objectSpace: 1 }
      );
    return {
      wood: make('#8b613b', 'painted'),
      stone: make('#8b8980', 'masonry'),
      iron: make('#45484a', 'metal', 0.65),
      cream: make('#c1b7a1', 'masonry'),
      cloth: make('#c7b889', 'fabric'),
      grain: make('#d6ae5e', 'painted'),
    };
  }, []);
  const kernelGeometry = useMemo(
    () => new THREE.SphereGeometry(0.0017 * modelScale, 5, 3).scale(1, 0.65, 0.65),
    [modelScale]
  );
  const scratch = useMemo(
    () => ({ position: new THREE.Vector3(), matrix: new THREE.Matrix4() }),
    []
  );
  useEffect(
    () => () => {
      Object.values(geometry).forEach((item) => item.dispose());
      kernelGeometry.dispose();
    },
    [geometry, kernelGeometry]
  );
  useEffect(() => () => Object.values(materials).forEach((item) => item.dispose()), [materials]);
  useFrame(() => {
    if (crown.current) crown.current.rotation.x = angle.value * angularRatios.crown;
    if (upright.current) upright.current.rotation.y = angle.value * angularRatios.upright;
    if (nut.current) nut.current.rotation.y = angle.value * angularRatios.stoneNut;
    if (runner.current) runner.current.rotation.y = angle.value * angularRatios.runner;
    if (!grain.current) return;
    grain.current.visible = stage !== 'power';
    for (let i = 0; i < 24; i++) {
      const phase = grainPhase(angle.value, i);
      sampleGrainPath(stage, phase, scratch.position).multiplyScalar(modelScale);
      scratch.matrix.makeTranslation(scratch.position);
      grain.current.setMatrixAt(i, scratch.matrix);
    }
    grain.current.instanceMatrix.needsUpdate = true;
  });
  const p = (x: number, y: number, z: number): Point => [
    x * modelScale,
    y * modelScale,
    z * modelScale,
  ];
  return (
    <group
      name="windmill-interior"
      position={modelOrigin}
      userData={{ noStaticBatch: true }}
      dispose={null}
    >
      {(['wood', 'stone', 'iron', 'cream', 'cloth'] as const).map((name) => (
        <mesh key={name} geometry={geometry[name]} material={materials[name]} receiveShadow />
      ))}
      <mesh
        name="windmill-crown"
        ref={crown}
        position={p(-0.03, 0.0948, 0.031)}
        geometry={geometry.crown}
        material={materials.wood}
      />
      <mesh
        name="windmill-upright"
        ref={upright}
        position={p(-0.06, 0.1608, 0.031)}
        geometry={geometry.upright}
        material={materials.wood}
      />
      <mesh
        name="windmill-stone-nut"
        ref={nut}
        position={p(0.02, -0.26, 0.031)}
        geometry={geometry.nut}
        material={materials.iron}
      />
      <mesh
        name="windmill-runner"
        ref={runner}
        position={p(0.02, -0.185, 0.031)}
        geometry={geometry.runner}
        material={materials.stone}
      />
      <instancedMesh
        name="windmill-grain"
        ref={grain}
        args={[kernelGeometry, materials.grain, 24]}
        frustumCulled={false}
      />
    </group>
  );
}
