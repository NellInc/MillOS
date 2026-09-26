/**
 * InstancedVillageComponents - GPU-efficient village rendering
 *
 * ARCHITECTURE:
 * 1. ONE draw call per geometry type (not per instance)
 * 2. Module-level shared geometries (never recreated)
 * 3. Instance attributes for color/transform variations
 * 4. No React state for static geometry - pure instancing
 *
 * PERFORMANCE GAINS:
 * - 8 lamps: 8 draw calls → 1 draw call
 * - 4 benches: 4 draw calls → 1 draw call
 * - etc.
 */

import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { ExteriorLampPool, getExteriorLampLevel } from '../exterior/ExteriorLighting';

// ============================================================
// SHARED GEOMETRIES - Created once at module level
// ============================================================

// Lamp geometries
//
// The lamp is a STACK - post, lantern frame, glazed drum - assembled from three
// instance matrices that are 0.3 m apart, so each profile below is designed
// against its neighbours and not just against itself. All three keep the exact
// envelope of the primitive they replace, because those matrices are hand-tuned
// world offsets (post at y 2, head at y 4.3) and any drift would move the
// lantern off the post.

/**
 * Cast-iron street standard.
 *
 * Rendered 4 m tall and 0.24 m across the foot, eight of them along the village
 * street, and walkable up to in first person. `CylinderGeometry(0.08, 0.12, 4, 8)`
 * was a bare tapered tube: nothing about it said street lamp rather than pipe.
 *
 * A turned standard is a sequence of events up its length, and the profile has
 * the five that carry: a 105 mm plinth skirt at the ground, a swelled base vase,
 * an astragal ring where the vase meets the shaft, entasis on the taper (a
 * convex swell, radius following t^1.6 rather than a straight line, so the
 * silhouette reads as a curve), and a projecting capital collar under a flared
 * seat that receives the lantern. The plinth and the capital are what read at
 * street distance; the astragal and the entasis are what hold up close.
 *
 * Envelope is unchanged: max radius 0.12 at y -2, top face at y +2. Sixteen
 * segments on a 0.24 m tube is round to the eye at arm's length, and this is one
 * shared geometry behind an InstancedMesh, so its ~480 vertices are a one-off
 * for the whole street rather than a per-lamp cost.
 */
function createLampPostGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0, -2), // base cap centre
    new THREE.Vector2(0.12, -2), // plinth foot - envelope max radius
    new THREE.Vector2(0.12, -1.895), // plinth face, vertical
    new THREE.Vector2(0.104, -1.868), // plinth chamfer
    new THREE.Vector2(0.098, -1.842),
    new THREE.Vector2(0.112, -1.792), // base vase swells back out
    new THREE.Vector2(0.113, -1.73),
    new THREE.Vector2(0.1, -1.652),
    new THREE.Vector2(0.082, -1.576),
    new THREE.Vector2(0.074, -1.516), // vase tucks into the shaft
    new THREE.Vector2(0.086, -1.48), // astragal ring
    new THREE.Vector2(0.089, -1.452),
    new THREE.Vector2(0.089, -1.42),
    new THREE.Vector2(0.08, -1.394),
    new THREE.Vector2(0.07, -1.36), // shaft begins
    new THREE.Vector2(0.0691, -1), // entasis: the taper is convex, not straight
    new THREE.Vector2(0.0658, -0.4),
    new THREE.Vector2(0.0609, 0.2),
    new THREE.Vector2(0.0546, 0.8),
    new THREE.Vector2(0.0486, 1.3),
    new THREE.Vector2(0.047, 1.56),
    new THREE.Vector2(0.044, 1.64), // necking under the capital
    new THREE.Vector2(0.062, 1.69), // capital collar, projecting
    new THREE.Vector2(0.063, 1.74),
    new THREE.Vector2(0.055, 1.775),
    new THREE.Vector2(0.048, 1.81),
    new THREE.Vector2(0.053, 1.88), // flared seat for the lantern base
    new THREE.Vector2(0.075, 1.96),
    new THREE.Vector2(0.075, 2), // top face - envelope max y
    new THREE.Vector2(0, 2),
  ];
  return new THREE.LatheGeometry(profile, 16);
}

/**
 * Lantern frame - the ironwork the glazing sits in.
 *
 * Rendered 0.5 m across and 0.6 m tall on top of the post. This was
 * `BoxGeometry(0.5, 0.6, 0.5)`, a solid cube, and being solid it also sealed the
 * emissive glazing inside it: `lampGlassGeometry` is strictly smaller on all
 * three axes, both are drawn at the same y 4.3 with no scale, and this material
 * is an opaque front-side standard material. The night cue the glazing exists to
 * provide could not reach the camera.
 *
 * Designing the frame as a frame fixes that as a consequence rather than as a
 * hack: a real lantern is a cast base plate, a thin burner stem, and a cap
 * carried above the glass, so the profile pinches to a 0.052 m stem through the
 * middle - narrower than the glazing that surrounds it - and the glazing is
 * simply visible between the plate and the cap. The gap left under the eave is
 * the ventilation gap a burning lantern needs.
 *
 * Features: base plate with a 26 mm vertical drip rim; the stem; a bell-cast cap
 * overhanging at the eave with a 22 mm fascia band; a vent cowl instead of a ball
 * finial, because this is a gas lamp and a cowl is what a gas lamp crowns with.
 * The doubled points either side of the two horizontal bands are crease points -
 * LatheGeometry averages the normals at a corner, and confining that blend to
 * 1.5 mm is what keeps the rim and the eave reading as machined edges instead of
 * rolled ones.
 *
 * Envelope is unchanged: an eight-sided lathe at circumradius 0.25 has the same
 * axis-aligned half-extents as the 0.5 m box (0.25, 0.3, 0.25). It is narrower
 * across the flats - 0.462 m against 0.5 - and nothing abuts the lantern head, so
 * that reduction is free. Eight sides because a fabricated glazed lantern IS
 * octagonal; the smooth round post below is the deliberate contrast.
 */
function createLampFrameGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0, -0.3), // underside centre
    new THREE.Vector2(0.09, -0.3), // mounting collar over the post seat
    new THREE.Vector2(0.096, -0.286),
    new THREE.Vector2(0.14, -0.278), // base plate underside flares
    new THREE.Vector2(0.212, -0.266),
    new THREE.Vector2(0.2335, -0.2566), // crease
    new THREE.Vector2(0.235, -0.256), // plate rim
    new THREE.Vector2(0.235, -0.2545),
    new THREE.Vector2(0.235, -0.2315),
    new THREE.Vector2(0.235, -0.23), // rim fascia, vertical
    new THREE.Vector2(0.2335, -0.2294), // crease
    new THREE.Vector2(0.21, -0.22), // plate top chamfer
    new THREE.Vector2(0.14, -0.211),
    new THREE.Vector2(0.062, -0.203), // glazing seat
    new THREE.Vector2(0.03, -0.18), // burner stem - thinner than the glazing
    new THREE.Vector2(0.026, 0.07),
    new THREE.Vector2(0.034, 0.104),
    new THREE.Vector2(0.08, 0.118), // cap underside begins
    new THREE.Vector2(0.172, 0.13),
    new THREE.Vector2(0.236, 0.142),
    new THREE.Vector2(0.2487, 0.1512), // crease
    new THREE.Vector2(0.25, 0.152), // eave - envelope max radius
    new THREE.Vector2(0.25, 0.1535),
    new THREE.Vector2(0.25, 0.1725),
    new THREE.Vector2(0.25, 0.174), // fascia band, vertical
    new THREE.Vector2(0.2487, 0.1748), // crease
    new THREE.Vector2(0.234, 0.186), // bell-cast kick
    new THREE.Vector2(0.192, 0.206),
    new THREE.Vector2(0.144, 0.228),
    new THREE.Vector2(0.096, 0.248),
    new THREE.Vector2(0.064, 0.262), // roof meets the vent cowl
    new THREE.Vector2(0.05, 0.27), // cowl shoulder
    new THREE.Vector2(0.048, 0.286), // cowl drum
    new THREE.Vector2(0.062, 0.29), // cowl cap flares
    new THREE.Vector2(0.052, 0.296),
    new THREE.Vector2(0.022, 0.3), // crown - envelope max y
    new THREE.Vector2(0, 0.3),
  ];
  return new THREE.LatheGeometry(profile, 8);
}

/**
 * Lantern glazing - the part that lights.
 *
 * Rendered 0.35 m across and 0.45 m tall, and at night this is the only lit
 * silhouette in the village, so its outline is what the night read is made of. A
 * cube glows like a cube; an octagonal drum with panes leaning inward, a base
 * rim and a top rail glows like a lantern.
 *
 * The upper shoulder above y 0.108 is deliberately tucked in: the frame's cap
 * skirt comes down over it, so that part of the profile only exists to close the
 * mesh and to hold the y envelope. What the eye gets is the drum below it.
 *
 * Envelope is unchanged: max radius 0.175 at the base, y in [-0.225, 0.225] -
 * the same half-extents as the 0.35 x 0.45 x 0.35 box, at the same eight sides
 * as the frame so the two share their corner angles.
 */
function createLampGlazingGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0, -0.225),
    new THREE.Vector2(0.175, -0.225), // glazing base - envelope max radius
    new THREE.Vector2(0.175, -0.202), // base rim, vertical
    new THREE.Vector2(0.163, -0.186), // chamfer up to the pane line
    new THREE.Vector2(0.16, -0.15),
    new THREE.Vector2(0.15, 0.02), // panes lean inward
    new THREE.Vector2(0.145, 0.058),
    new THREE.Vector2(0.157, 0.072), // top rail flares back out
    new THREE.Vector2(0.157, 0.094), // rail fascia, vertical
    new THREE.Vector2(0.133, 0.108),
    new THREE.Vector2(0.082, 0.135), // shoulder, tucks up under the cap
    new THREE.Vector2(0.046, 0.18),
    new THREE.Vector2(0.034, 0.225), // envelope max y, hidden inside the cap
    new THREE.Vector2(0, 0.225),
  ];
  return new THREE.LatheGeometry(profile, 8);
}

const lampPostGeometry = createLampPostGeometry();
const lampHousingGeometry = createLampFrameGeometry();
const lampGlassGeometry = createLampGlazingGeometry();

// Bench geometries
const benchSeatGeometry = new THREE.BoxGeometry(1.5, 0.08, 0.5);
const benchBackGeometry = new THREE.BoxGeometry(1.5, 0.5, 0.08);
const benchLegGeometry = new THREE.BoxGeometry(0.08, 0.4, 0.5);

// Market stall geometries
const stallTableGeometry = new THREE.BoxGeometry(2.8, 0.1, 1.8);
const stallPostGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
const stallAwningGeometry = new THREE.BoxGeometry(0.4, 0.05, 2.2);

// ============================================================
// SHARED MATERIALS - Created once at module level
// ============================================================

const blackMetalMaterial = new THREE.MeshStandardMaterial({
  color: '#1a1a1a',
  roughness: 0.5,
  normalMap: PROCEDURAL_TEXTURES.brushedMetal,
  normalScale: new THREE.Vector2(0.1, 0.1),
});

const timberMaterial = new THREE.MeshStandardMaterial({
  color: '#3d2d1d',
  roughness: 0.8,
  normalMap: PROCEDURAL_TEXTURES.panelNormal,
  normalScale: new THREE.Vector2(0.15, 0.15),
});

const whiteMaterial = new THREE.MeshStandardMaterial({
  color: '#e8e8e8',
  roughness: 0.75,
});

const smokeMaterial = new THREE.MeshBasicMaterial({
  color: '#9ca3af',
  transparent: true,
  opacity: 0.4,
});
const lampGlassMaterial = new THREE.MeshStandardMaterial({
  color: '#333333',
  emissive: '#000000',
  emissiveIntensity: 0,
  roughness: 0.6,
});

// ============================================================
// LAMP INSTANCE DATA
// ============================================================

const LAMP_POSITIONS: [number, number][] = [
  [-15, 20],
  [15, 20],
  [-15, -20],
  [15, -20],
  [-15, -45],
  [15, -45],
  [-15, 45],
  [15, 50],
];

/** Lamp head height is 4.3 m; the pool reaches roughly the next building line. */
const LAMP_POOL_RADIUS = 5.5;

/**
 * Instanced village lamps - 8 lamps in ~3 draw calls instead of 24, each with
 * a ground light pool. The pools share the site-wide ExteriorLampDriver level
 * (dusk ramp, night, storm/rain floor), and the glass switches on that same
 * level, so a pool never lies under an unlit lamp. No punctual lights: those
 * would change the scene's light count at dusk and recompile every material.
 */
export const InstancedLamps: React.FC = React.memo(() => {
  const isLit = useGameSimulationStore(
    (state) => getExteriorLampLevel(state.gameTime, state.weather) >= 0.5
  );
  const postsRef = useRef<THREE.InstancedMesh>(null);
  const housingsRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);

  const count = LAMP_POSITIONS.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Layout, not passive: a frame rendered before the matrices land would cache
  // an origin-sized bounding sphere and frustum-cull the whole row of lamps.
  useLayoutEffect(() => {
    LAMP_POSITIONS.forEach(([x, z], i) => {
      // Post
      dummy.position.set(x, 2, z);
      dummy.updateMatrix();
      postsRef.current?.setMatrixAt(i, dummy.matrix);

      // Housing
      dummy.position.set(x, 4.3, z);
      dummy.updateMatrix();
      housingsRef.current?.setMatrixAt(i, dummy.matrix);

      // Glass
      dummy.position.set(x, 4.3, z);
      dummy.updateMatrix();
      glassRef.current?.setMatrixAt(i, dummy.matrix);
    });

    if (postsRef.current) postsRef.current.instanceMatrix.needsUpdate = true;
    if (housingsRef.current) housingsRef.current.instanceMatrix.needsUpdate = true;
    if (glassRef.current) glassRef.current.instanceMatrix.needsUpdate = true;
    // setMatrixAt never invalidates InstancedMesh.boundingSphere.
    postsRef.current?.computeBoundingSphere();
    housingsRef.current?.computeBoundingSphere();
    glassRef.current?.computeBoundingSphere();
  }, [dummy]);

  // Keep one compiled material across the day/night boundary. Uniform changes
  // are cheap; swapping material objects here used to trigger shader setup in
  // the same frame as the wider atmosphere transition.
  useEffect(() => {
    lampGlassMaterial.color.set(isLit ? '#ffaa00' : '#333333');
    lampGlassMaterial.emissive.set(isLit ? '#ffaa00' : '#000000');
    lampGlassMaterial.emissiveIntensity = isLit ? 2 : 0;
    lampGlassMaterial.roughness = isLit ? 0.35 : 0.6;
  }, [isLit]);

  return (
    <group>
      <instancedMesh
        ref={postsRef}
        args={[lampPostGeometry, blackMetalMaterial, count]}
        castShadow
      />
      <instancedMesh ref={housingsRef} args={[lampHousingGeometry, blackMetalMaterial, count]} />
      {/* Material attached as a child primitive, NOT via args: a state-varying
          material in `args` changes the args array identity on every isNight
          flip, making R3F tear down and rebuild the InstancedMesh. The stable
          child material keeps populated instance matrices and shader programs. */}
      <instancedMesh ref={glassRef} args={[lampGlassGeometry, undefined, count]}>
        <primitive object={lampGlassMaterial} attach="material" />
      </instancedMesh>
      {LAMP_POSITIONS.map(([x, z]) => (
        <group key={`lamp-pool-${x}-${z}`} position={[x, 0, z]}>
          <ExteriorLampPool radius={LAMP_POOL_RADIUS} />
        </group>
      ))}
      {/* The emissive glass supplies the night cue without adding point lights.
          Changing the global light count at dusk recompiles every affected
          scene material, which caused a visible whole-site hitch.
          For that cue to reach the camera the glazing has to be OUTSIDE the
          frame's surface: see createLampFrameGeometry, whose profile pinches to
          a stem narrower than this drum for exactly that reason. The previous
          solid housing box enclosed this mesh completely. */}
    </group>
  );
});
InstancedLamps.displayName = 'InstancedLamps';

// ============================================================
// BENCH INSTANCE DATA
// ============================================================

const BENCH_DATA: Array<{ position: [number, number]; rotation: number }> = [
  { position: [-5, 18], rotation: 0 },
  { position: [5, 18], rotation: 0 },
  { position: [-12, -25], rotation: Math.PI / 2 },
  { position: [12, 35], rotation: Math.PI / 2 },
];

/**
 * Instanced village benches - 4 benches in ~3 draw calls instead of 16
 */
export const InstancedBenches: React.FC = React.memo(() => {
  const seatsRef = useRef<THREE.InstancedMesh>(null);
  const backsRef = useRef<THREE.InstancedMesh>(null);
  const legsRef = useRef<THREE.InstancedMesh>(null);

  const count = BENCH_DATA.length;
  const legCount = count * 2; // 2 legs per bench
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    BENCH_DATA.forEach(({ position: [x, z], rotation }, i) => {
      // Seat
      dummy.position.set(x, 0.4, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      seatsRef.current?.setMatrixAt(i, dummy.matrix);

      // Back
      // Stands on the seat's rear strip (0.44-0.94), not under it.
      dummy.position.set(x + Math.sin(rotation) * -0.2, 0.69, z + Math.cos(rotation) * -0.2);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      backsRef.current?.setMatrixAt(i, dummy.matrix);

      // Legs (2 per bench)
      [-0.6, 0.6].forEach((lx, li) => {
        dummy.position.set(x + Math.cos(rotation) * lx, 0.2, z - Math.sin(rotation) * lx);
        dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix();
        legsRef.current?.setMatrixAt(i * 2 + li, dummy.matrix);
      });
    });

    if (seatsRef.current) seatsRef.current.instanceMatrix.needsUpdate = true;
    if (backsRef.current) backsRef.current.instanceMatrix.needsUpdate = true;
    if (legsRef.current) legsRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <group>
      <instancedMesh ref={seatsRef} args={[benchSeatGeometry, timberMaterial, count]} castShadow />
      <instancedMesh ref={backsRef} args={[benchBackGeometry, timberMaterial, count]} castShadow />
      <instancedMesh
        ref={legsRef}
        args={[benchLegGeometry, blackMetalMaterial, legCount]}
        castShadow
      />
    </group>
  );
});
InstancedBenches.displayName = 'InstancedBenches';

// ============================================================
// MARKET STALL INSTANCE DATA
// ============================================================

interface StallData {
  position: [number, number, number];
  rotation: number;
  color1: string;
  color2: string;
}

const STALL_DATA: StallData[] = [
  { position: [-8, 0, 10], rotation: 0, color1: '#dc2626', color2: '#fef3c7' },
  { position: [8, 0, 10], rotation: 0, color1: '#3b82f6', color2: '#fef3c7' },
  { position: [-8, 0, 2], rotation: 0, color1: '#22c55e', color2: '#fef3c7' },
  { position: [8, 0, 2], rotation: 0, color1: '#f59e0b', color2: '#fef3c7' },
];

/**
 * Instanced market stalls - 4 stalls with shared geometry
 * Tables, legs, and posts are instanced; awnings have color variation
 */
export const InstancedMarketStalls: React.FC = React.memo(() => {
  const tablesRef = useRef<THREE.InstancedMesh>(null);
  const postsRef = useRef<THREE.InstancedMesh>(null);

  const count = STALL_DATA.length;
  const postCount = count * 2; // 2 posts per stall
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    STALL_DATA.forEach(({ position: [x, y, z], rotation }, i) => {
      // Table
      dummy.position.set(x, y + 0.9, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      tablesRef.current?.setMatrixAt(i, dummy.matrix);

      // Posts
      [-1.3, 1.3].forEach((px, pi) => {
        dummy.position.set(x + px, y + 1.6, z + 0.8);
        dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix();
        postsRef.current?.setMatrixAt(i * 2 + pi, dummy.matrix);
      });
    });

    if (tablesRef.current) tablesRef.current.instanceMatrix.needsUpdate = true;
    if (postsRef.current) postsRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  // Awnings need individual colors - render separately but with shared geometry
  const awnings = useMemo(() => {
    return STALL_DATA.map(({ position: [x, y, z], rotation, color1, color2 }, stallIdx) => (
      <group key={stallIdx} position={[x, y + 2.4, z + 0.2]} rotation={[0.4, rotation, 0]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <mesh key={i} position={[-1.4 + i * 0.4, 0, 0]}>
            <primitive object={stallAwningGeometry} attach="geometry" />
            <meshStandardMaterial color={i % 2 === 0 ? color1 : color2} roughness={0.9} />
          </mesh>
        ))}
      </group>
    ));
  }, []);

  return (
    <group>
      <instancedMesh
        ref={tablesRef}
        args={[stallTableGeometry, timberMaterial, count]}
        castShadow
      />
      <instancedMesh
        ref={postsRef}
        args={[stallPostGeometry, timberMaterial, postCount]}
        castShadow
      />
      {awnings}
    </group>
  );
});
InstancedMarketStalls.displayName = 'InstancedMarketStalls';

// ============================================================
// EXPORTS
// ============================================================

// NOTE: the tree geometries/materials that used to live here are gone. They
// backed a third, unreferenced tree implementation (solid sphere canopies on a
// flat green) alongside scenery/Tree.tsx and exterior/ExteriorVegetation.tsx.
// Vegetation now has one owner: components/scenery/InstancedFoliage.tsx.
export {
  // Geometries for reuse
  lampPostGeometry,
  lampHousingGeometry,
  benchSeatGeometry,
  // Materials for reuse
  blackMetalMaterial,
  timberMaterial,
  whiteMaterial,
  smokeMaterial,
};
