import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  EXTERIOR_LAMP_LENS_MATERIAL,
  EXTERIOR_LAMP_LEVEL,
  ExteriorLampPool,
} from './ExteriorLighting';

/**
 * Ground floods on the silo battery.
 *
 * At 22:00 the bins' brightest 1% sat at ~40/255: five 32 m drums lit only by
 * the night fill, read as murk. A silo battery is floodlit from its apron. This
 * adds no light to the scene - a punctual light is a loop iteration on every lit
 * fragment of every material in frame, which is why the yard poles are real
 * lights only on High - and no shadow caster. Instead:
 *
 *   - each bin gets two ground floods on its open east and west sides (the bins
 *     stand 1 m apart in Z, so those are the only faces a flood can reach);
 *   - the flood heads use the shared exterior lamp lens, so they ARE the light
 *     sources, unlit-by-design and on the shared lamp clock;
 *   - the shell carries an additive wash shaped by what a flood throws: strong
 *     at the foot, fading up the drum, and only on the faces looking at a flood.
 *
 * One draw for the heads, one for the lenses, one for the wash; all three
 * follow `EXTERIOR_LAMP_LEVEL` and the wash is skipped outright by day.
 */
export const SILO_FLOOD = {
  /** Ground offset of a flood head beyond the shell, metres. */
  standoff: 1.2,
  /** Shell span the wash covers, world metres (the drum runs y 5 to 30). */
  washBase: 5,
  washTop: 25,
  /** Wash radius as a multiple of the 6 m drum, just proud of the 1.03 rings. */
  washRadiusScale: 1.045,
  /** Peak additive strength at full night, linear. */
  peak: 0.3,
  color: '#ffd59a',
  /**
   * The lane pool behind each head: the lit drum's foot throws light back
   * onto the paving the head stands beside. Centred this far behind the head,
   * off the pad, so it lies on the lane rather than under the 16 cm slab.
   */
  poolSetback: 3,
  poolRadius: 5.5,
} as const;

const SILO_RADIUS = SITE_LAYOUT.machineDimensions.silo[0] / 2;

export interface SiloFloodFixture {
  readonly position: readonly [number, number, number];
  /** Unit direction from the flood toward the bin's axis, horizontal. */
  readonly aim: readonly [number, number, number];
}

export function siloFloodFixtures(): SiloFloodFixture[] {
  return SITE_LAYOUT.machines.silos.flatMap(({ position: [x, , z] }) =>
    [-1, 1].map((side) => ({
      position: [x + side * (SILO_RADIUS + SILO_FLOOD.standoff), 0, z] as const,
      aim: [-side, 0, 0] as const,
    }))
  );
}

/**
 * One ground pool per flood, on the lane behind it. Without these the yard
 * camera's lane beside the battery was flat navy at 22:00: the floods lit the
 * drums and nothing returned to the paving.
 */
export function siloFloodPools(): { position: [number, number, number]; radius: number }[] {
  return siloFloodFixtures().map((fixture) => ({
    position: [
      fixture.position[0] - fixture.aim[0] * SILO_FLOOD.poolSetback,
      0,
      fixture.position[2],
    ],
    radius: SILO_FLOOD.poolRadius,
  }));
}

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Wash strength on the shell. `facing` is the cosine between the shell normal
 * and the direction back toward the nearest flood. Mirrors the GLSL below.
 */
export function siloWashStrength(level: number, worldY: number, facing: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  const lobe = Math.pow(Math.max(facing, 0), 1.5);
  const height =
    smoothstep(SILO_FLOOD.washBase, SILO_FLOOD.washBase + 1.2, worldY) *
    (1 - smoothstep(SILO_FLOOD.washBase + 3, SILO_FLOOD.washTop, worldY));
  return Math.min(1, level) * SILO_FLOOD.peak * lobe * height;
}

const washVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  mat4 world = modelMatrix;
  #ifdef USE_INSTANCING
    world = world * instanceMatrix;
  #endif
  vec4 position4 = world * vec4( position, 1.0 );
  vWorld = position4.xyz;
  vNormalW = normalize( mat3( world ) * normal );
  gl_Position = projectionMatrix * viewMatrix * position4;
}
`;

const washFragment = /* glsl */ `
uniform float uLevel;
uniform vec3 uColor;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  // Floods stand on the +-X sides, so the facing term is the normal's X.
  float lobe = pow( abs( normalize( vNormalW.xz ).x ), 1.5 );
  float height = smoothstep( ${SILO_FLOOD.washBase.toFixed(2)}, ${(SILO_FLOOD.washBase + 1.2).toFixed(2)}, vWorld.y )
    * ( 1.0 - smoothstep( ${(SILO_FLOOD.washBase + 3).toFixed(2)}, ${SILO_FLOOD.washTop.toFixed(2)}, vWorld.y ) );
  float strength = uLevel * ${SILO_FLOOD.peak.toFixed(3)} * lobe * height;
  gl_FragColor = vec4( uColor * strength, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const HEAD_GEOMETRY = new THREE.BoxGeometry(0.7, 0.42, 0.5);
const LENS_GEOMETRY = new THREE.PlaneGeometry(0.58, 0.32);
const HEAD_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'silo-flood-housing',
  color: '#3a4044',
  roughness: 0.5,
  metalness: 0.3,
});

const _matrix = new THREE.Matrix4();
const _quaternion = new THREE.Quaternion();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);
const _axisY = new THREE.Vector3(0, 1, 0);
const _tilt = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);

export function SiloFloodlights() {
  const fixtures = useMemo(() => siloFloodFixtures(), []);
  const pools = useMemo(() => siloFloodPools(), []);
  const headsRef = useRef<THREE.InstancedMesh>(null);
  const lensesRef = useRef<THREE.InstancedMesh>(null);
  const washRef = useRef<THREE.InstancedMesh>(null);
  const washGeometry = useMemo(
    // Open-ended, unit height centred on 0, radius 1: placed per bin below.
    () => new THREE.CylinderGeometry(1, 1, 1, 48, 1, true),
    []
  );
  const washMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'silo-flood-wash',
        vertexShader: washVertex,
        fragmentShader: washFragment,
        uniforms: {
          uLevel: { value: 0 },
          uColor: { value: new THREE.Color(SILO_FLOOD.color) },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
        fog: false,
        toneMapped: true,
      }),
    []
  );

  useEffect(
    () => () => {
      washGeometry.dispose();
      washMaterial.dispose();
    },
    [washGeometry, washMaterial]
  );

  useLayoutEffect(() => {
    const heads = headsRef.current;
    const lenses = lensesRef.current;
    fixtures.forEach((fixture, index) => {
      const yaw = Math.atan2(fixture.aim[0], fixture.aim[2]);
      _quaternion.setFromAxisAngle(_axisY, yaw);
      // Tipped back 35 degrees so the head throws up the drum.
      _tilt.setFromAxisAngle(_axisX, -0.6);
      _quaternion.multiply(_tilt);
      _position.set(fixture.position[0], 0.32, fixture.position[2]);
      _matrix.compose(_position, _quaternion, _scale);
      heads?.setMatrixAt(index, _matrix);
      // The lens faces the bin, just proud of the housing's front.
      _position.set(
        fixture.position[0] + fixture.aim[0] * 0.26,
        0.36,
        fixture.position[2] + fixture.aim[2] * 0.26
      );
      _matrix.compose(_position, _quaternion, _scale);
      lenses?.setMatrixAt(index, _matrix);
    });
    if (heads) heads.instanceMatrix.needsUpdate = true;
    if (lenses) lenses.instanceMatrix.needsUpdate = true;
    heads?.computeBoundingSphere();
    lenses?.computeBoundingSphere();

    const wash = washRef.current;
    if (!wash) return;
    const height = SILO_FLOOD.washTop - SILO_FLOOD.washBase;
    const radius = SILO_RADIUS * SILO_FLOOD.washRadiusScale;
    SITE_LAYOUT.machines.silos.forEach(({ position: [x, , z] }, index) => {
      _position.set(x, SILO_FLOOD.washBase + height / 2, z);
      _matrix.compose(_position, _quaternion.identity(), _scale.set(radius, height, radius));
      wash.setMatrixAt(index, _matrix);
    });
    _scale.set(1, 1, 1);
    wash.instanceMatrix.needsUpdate = true;
    wash.computeBoundingSphere();
  }, [fixtures]);

  useFrame(() => {
    const level = EXTERIOR_LAMP_LEVEL.value;
    washMaterial.uniforms.uLevel.value = level;
    // Additive and inert by day: skip the draw rather than add zero.
    const wash = washRef.current;
    if (wash) wash.visible = level > 0.002;
  });

  return (
    <group name="silo-floodlights">
      <instancedMesh
        ref={headsRef}
        args={[HEAD_GEOMETRY, HEAD_MATERIAL, fixtures.length]}
        castShadow={false}
        receiveShadow
      />
      <instancedMesh
        ref={lensesRef}
        args={[LENS_GEOMETRY, EXTERIOR_LAMP_LENS_MATERIAL, fixtures.length]}
      />
      <instancedMesh
        ref={washRef}
        args={[washGeometry, washMaterial, SITE_LAYOUT.machines.silos.length]}
        renderOrder={2}
      />
      {pools.map((pool) => (
        <group key={pool.position.join(':')} position={pool.position}>
          <ExteriorLampPool radius={pool.radius} />
        </group>
      ))}
    </group>
  );
}
