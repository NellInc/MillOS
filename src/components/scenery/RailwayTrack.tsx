import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createAlignmentSample,
  RAILWAY,
  RAILWAY_FORMATION,
  RAILWAY_LENGTH,
  RAILWAY_LEVELS,
  railwaySweepStations,
  sampleOffset,
  trackOffset,
  type RailwayTrack as RailwayTrackId,
} from '../../constants/railwayLayout';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { metreTiled } from './railwayGeometry';

/**
 * The permanent way: one ballast bed for both tracks, timber sleepers and four
 * running rails, all swept along `constants/railwayLayout.ts` from void cap to
 * void cap. Straights need a cross-section only at each end, so the whole line
 * is three draws and about 7k triangles.
 * Working if the rails sit on the sleepers, the sleepers on the ballast, and
 * the ballast toe is buried in the ground along the whole line.
 */

/** Ballast cross-section, lateral metres from the line centre and world y. */
const BALLAST_PROFILE: readonly (readonly [number, number])[] = [
  [-RAILWAY_FORMATION.toe, RAILWAY_LEVELS.ground - 0.06],
  [-RAILWAY_FORMATION.shoulder, RAILWAY_LEVELS.ballastTop],
  [0, RAILWAY_LEVELS.ballastTop + 0.02],
  [RAILWAY_FORMATION.shoulder, RAILWAY_LEVELS.ballastTop],
  [RAILWAY_FORMATION.toe, RAILWAY_LEVELS.ground - 0.06],
];

/** Flat-bottom rail, lateral metres from the rail centre and world y. */
const RAIL_PROFILE: readonly (readonly [number, number])[] = [
  [-0.07, RAILWAY_LEVELS.sleeperTop],
  [-0.012, RAILWAY_LEVELS.sleeperTop + 0.035],
  [-0.012, RAILWAY_LEVELS.railTop - 0.05],
  [-0.036, RAILWAY_LEVELS.railTop - 0.042],
  [-0.036, RAILWAY_LEVELS.railTop],
  [0.036, RAILWAY_LEVELS.railTop],
  [0.036, RAILWAY_LEVELS.railTop - 0.042],
  [0.012, RAILWAY_LEVELS.railTop - 0.05],
  [0.012, RAILWAY_LEVELS.sleeperTop + 0.035],
  [0.07, RAILWAY_LEVELS.sleeperTop],
];
/** The rail head's running face is its own edge, so it can carry a polished tint. */
const RAIL_HEAD_EDGE = 4;
const RAIL_RUST = new THREE.Color('#6e5444');
const RAIL_HEAD = new THREE.Color('#c3c4c0');
/** Rail centres sit half the gauge plus half the 72 mm head off the track centre. */
const RAIL_CENTRE = RAILWAY.gauge / 2 + 0.036;
const SLEEPER_SPACING = 0.7;

/**
 * Sweep a 2D profile along the line at `offset`, one quad strip per profile
 * edge, each edge with its own vertices so the facets shade crisply.
 * `u` runs across the profile and `v` along the line, both in metres.
 */
function sweepProfile(
  profile: readonly (readonly [number, number])[],
  offsets: readonly number[],
  stations: readonly number[],
  edgeColour?: (edge: number) => THREE.Color
): THREE.BufferGeometry {
  const sample = createAlignmentSample();
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  for (const offset of offsets) {
    for (let edge = 0; edge < profile.length - 1; edge++) {
      const [ua, ya] = profile[edge];
      const [ub, yb] = profile[edge + 1];
      const across = Math.hypot(ub - ua, yb - ya);
      const colour = edgeColour?.(edge);
      const first = positions.length / 3;
      for (const s of stations) {
        sampleOffset(s, offset + ua, sample);
        positions.push(sample.x, ya, sample.z);
        sampleOffset(s, offset + ub, sample);
        positions.push(sample.x, yb, sample.z);
        uvs.push(0, s, across, s);
        if (colour) colours.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
      }
      for (let row = 0; row < stations.length - 1; row++) {
        const a = first + row * 2;
        // Winding chosen so each strip faces away from the profile's inside.
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colours.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createBallastGeometry(): THREE.BufferGeometry {
  return sweepProfile(BALLAST_PROFILE, [0], railwaySweepStations(1.5));
}

export function createRailGeometry(): THREE.BufferGeometry {
  const offsets = ([1, 2] as const).flatMap((track) => [
    trackOffset(track) - RAIL_CENTRE,
    trackOffset(track) + RAIL_CENTRE,
  ]);
  return sweepProfile(RAIL_PROFILE, offsets, railwaySweepStations(1), (edge) =>
    edge === RAIL_HEAD_EDGE ? RAIL_HEAD : RAIL_RUST
  );
}

/** Sleeper centres and yaws for both tracks, every 0.7 m from cap to cap. */
export function railwaySleeperPlacements(): { x: number; z: number; yaw: number }[] {
  const sample = createAlignmentSample();
  const placements: { x: number; z: number; yaw: number }[] = [];
  for (const track of [1, 2] as RailwayTrackId[]) {
    for (let s = SLEEPER_SPACING / 2; s < RAILWAY_LENGTH; s += SLEEPER_SPACING) {
      sampleOffset(s, trackOffset(track), sample);
      placements.push({ x: sample.x, z: sample.z, yaw: Math.atan2(sample.dirX, sample.dirZ) });
    }
  }
  return placements;
}

// Ballast: crushed grey stone. The cobble map is a field of rounded stones,
// which at a 3.2 m tile reads as 5 cm aggregate; the tint greys its warm hue.
const ballastMap = metreTiled(PROCEDURAL_TEXTURES.cobblestoneColor, 3.2);
const ballastNormal = metreTiled(PROCEDURAL_TEXTURES.cobblestoneNormal, 3.2);
const BALLAST_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d4d0ca',
  map: ballastMap,
  normalMap: ballastNormal,
  normalScale: new THREE.Vector2(1, 1),
  roughness: 0.96,
  metalness: 0,
});
// Creosoted timber.
const SLEEPER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#4a3a2c',
  roughness: 0.92,
  metalness: 0,
});
const SLEEPER_GEOMETRY = new THREE.BoxGeometry(2.6, 0.16, 0.25).translate(
  0,
  RAILWAY_LEVELS.sleeperTop - 0.08,
  0
);
// Rusty web and foot, polished running head, from vertex colour.
const RAIL_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.42,
  metalness: 0.55,
});

export const RailwayTrack: React.FC = React.memo(() => {
  const ballast = useMemo(createBallastGeometry, []);
  const rails = useMemo(createRailGeometry, []);
  const sleepers = useMemo(railwaySleeperPlacements, []);
  const sleeperRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = sleeperRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    sleepers.forEach(({ x, z, yaw }, index) => {
      rotation.setFromAxisAngle(axis, yaw);
      position.set(x, 0, z);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [sleepers]);

  useLayoutEffect(
    () => () => {
      ballast.dispose();
      rails.dispose();
    },
    [ballast, rails]
  );

  return (
    <group name="railway-track">
      <mesh name="railway-ballast" geometry={ballast} material={BALLAST_MATERIAL} receiveShadow />
      <instancedMesh
        name="railway-sleepers"
        ref={sleeperRef}
        args={[SLEEPER_GEOMETRY, SLEEPER_MATERIAL, sleepers.length]}
        castShadow
        receiveShadow
      />
      <mesh
        name="railway-rails"
        geometry={rails}
        material={RAIL_MATERIAL}
        castShadow
        receiveShadow
      />
    </group>
  );
});
RailwayTrack.displayName = 'RailwayTrack';
