import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  SILO_FLOOD_HEAD_ANGLES,
  SILO_FLOOD_LIGHT,
  siloFloodHeadDirection,
} from '../machines/machineSurfaces';
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
 *   - each bin is ringed by ground floods on its pad (`SILO_FLOOD_HEAD_ANGLES`:
 *     east, west and the four diagonals; north and south face the neighbouring
 *     bin 1 m away); a lane pool lies behind the east and west heads;
 *   - the flood heads use the shared exterior lamp lens, so they ARE the light
 *     sources, unlit-by-design and on the shared lamp clock;
 *   - the drum, skirt and rings are lit by them through their own BRDF
 *     (`SILO_FLOOD_LIGHT` in machineSurfaces): a point source per head,
 *     inverse-square and cosine, from the foot of the skirt up to the eave.
 *
 * This replaced an additive wash shell (y 5-25 m), which stopped dead at the
 * skirt seam, left the skirt black over its own floods, and painted one flat
 * cream over the corrugation: it read as a lit material, not as light.
 */
export const SILO_FLOOD = {
  /** Ground offset of a flood head beyond the shell, metres. */
  standoff: 1.2,
  /** Height of the lens centre, metres: where the light leaves the head. */
  headY: 0.36,
  /** The lens sits this far in front of the head's centre, toward the bin. */
  lensInset: 0.26,
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
  const reach = SILO_RADIUS + SILO_FLOOD.standoff;
  return SITE_LAYOUT.machines.silos.flatMap(({ position: [x, , z] }) =>
    SILO_FLOOD_HEAD_ANGLES.map((degrees) => {
      const [dx, dz] = siloFloodHeadDirection(degrees);
      return {
        position: [x + dx * reach, 0, z + dz * reach] as const,
        aim: [-dx, 0, -dz] as const,
      };
    })
  );
}

/**
 * One ground pool per east or west flood, on the lane behind it. Without these
 * the yard camera's lane beside the battery was flat navy at 22:00: the floods
 * lit the drums and nothing returned to the paving. The diagonal heads stand on
 * the pad between the bins, where a pool behind them would fall under a drum.
 */
export function siloFloodPools(): { position: [number, number, number]; radius: number }[] {
  return siloFloodFixtures()
    .filter((fixture) => fixture.aim[2] === 0)
    .map((fixture) => ({
      position: [
        fixture.position[0] - fixture.aim[0] * SILO_FLOOD.poolSetback,
        0,
        fixture.position[2],
      ],
      radius: SILO_FLOOD.poolRadius,
    }));
}

/**
 * Publish the floods to the galvanised materials: lamp level, the lenses'
 * distance from each bin axis (the heads stand at SILO_FLOOD_HEAD_ANGLES), their
 * height and their standoff from the wall. Level 0 switches the term off. The
 * colour is the lamp lenses' warm white, `SILO_FLOOD_COLOR`.
 */
export function writeSiloFloodLight(level: number): THREE.Vector4 {
  const standoff = SILO_FLOOD.standoff - SILO_FLOOD.lensInset;
  return SILO_FLOOD_LIGHT.value.set(
    Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 1) : 0,
    SILO_RADIUS + standoff,
    SILO_FLOOD.headY,
    standoff
  );
}

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
        fixture.position[0] + fixture.aim[0] * SILO_FLOOD.lensInset,
        SILO_FLOOD.headY,
        fixture.position[2] + fixture.aim[2] * SILO_FLOOD.lensInset
      );
      _matrix.compose(_position, _quaternion, _scale);
      lenses?.setMatrixAt(index, _matrix);
    });
    if (heads) heads.instanceMatrix.needsUpdate = true;
    if (lenses) lenses.instanceMatrix.needsUpdate = true;
    heads?.computeBoundingSphere();
    lenses?.computeBoundingSphere();
  }, [fixtures]);

  // Unmounted, the battery has no floods: switch the drum term off with them.
  useLayoutEffect(
    () => () => {
      writeSiloFloodLight(0);
    },
    []
  );

  useFrame(() => {
    // Below a visible level the shader skips the floods outright.
    const level = EXTERIOR_LAMP_LEVEL.value;
    writeSiloFloodLight(level > 0.002 ? level : 0);
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
      {pools.map((pool) => (
        <group key={pool.position.join(':')} position={pool.position}>
          <ExteriorLampPool radius={pool.radius} />
        </group>
      ))}
    </group>
  );
}
