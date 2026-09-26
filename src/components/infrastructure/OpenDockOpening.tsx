import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SceneText as Text } from '../shared/SceneText';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { generateMachineORM, generateMachinePanelNormal } from '../../textures';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { applyWorldSurface } from '../../utils/worldSurface';

interface OpenDockOpeningProps {
  position: [number, number, number];
  width?: number;
  height?: number;
  rotation?: number;
  label?: string;
  hasCanopy?: boolean;
  /**
   * Which dock schedule drives the leveler and the status lights.
   *
   * Optional because the geometry is meaningful on its own; when it is absent
   * the dock renders in its idle state and never animates, which is the old
   * behaviour rather than a broken one.
   */
  dock?: 'shipping' | 'receiving';
}

// ---------------------------------------------------------------------------
// SURFACES
// ---------------------------------------------------------------------------
//
// This whole subsystem was 233 meshes and 1,424 instances of untextured colour
// - the largest flat block anywhere in the scene - and it is the SUBJECT of the
// `shipping` and `receiving` review cameras. Everything below follows the
// conventions `machines/machineSurfaces.ts` sets out; read its header before
// changing any of it.
//
// TEXTURE KEYS ARE DELIBERATELY THE ONES THE MACHINES ALREADY GENERATE.
// `getTexture` memoises on (size, direction, seed), so these two calls resolve
// to the same objects `machineSurfaces.ts` and `OptimizedFactoryInfrastructure`
// build: no extra generation pass and no extra GPU upload. R = AO, G =
// roughness, B = metalness in glTF order, so this binds as a roughnessMap only
// - three reads roughness from GREEN, and the B channel here is a constant 1
// which would drive every surface to full metal if it were bound as a
// metalnessMap too.
const DOCK_ORM = generateMachineORM(512, 'vertical', 96);
const DOCK_PANEL_NORMAL = generateMachinePanelNormal(512, 4, 7);

/**
 * Clone a shared texture and give it its own tiling.
 *
 * `repeat` is not part of three's texture cache key, so a clone that differs
 * only in tiling shares the same `__webglTexture`: free in VRAM. Never mutate
 * the shared source - `getTexture` hands the same instance to every caller.
 */
function band(source: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * THE DIELECTRIC REBALANCE, from `machineSurfaces.ts`.
 *
 * Every steel member here was authored at metalness 0.6-0.8 over a dark
 * blue-grey. Painted and galvanised structural steel is a DIELECTRIC, and the
 * 0.05-0.5 band has neither a full diffuse albedo nor a real specular - it is
 * what makes a colour read chalky. Worse, metalness 1 makes the albedo hex the
 * specular F0, and #475569 is linear (0.062, 0.084, 0.113): far too dark and
 * far too blue to be any real conductor. So metalness goes to a hard 0.
 *
 * Dropping metalness m to 0 multiplies the diffuse term by 1/(1-m) - up to 5x
 * on the 0.8 members - so each hex is scaled in LINEAR space by (1-m)^0.75, the
 * same partial compensation the machines use: full compensation would cancel
 * the point of the fix, none of it would blow the palette out.
 *
 * Computed rather than hand-authored. `new THREE.Color(hex)` decodes sRGB into
 * the linear working space, so this multiply is exactly a linear-space scale
 * and there is no hand-converted hex in this file to get wrong.
 */
function repaint(hex: string, previousMetalness: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(Math.pow(1 - previousMetalness, 0.75));
}

// TEXEL DENSITY BANDS. Each states the member it is cut for, in metres, so the
// next reader can check the arithmetic instead of guessing. A box's UVs run 0-1
// per face, so `repeat` is literally "tiles across this face".
//
// The two docks are 30 m and 18 m wide and both 14 m high. One tiling therefore
// cannot be exact for both; every band below is cut for the 30 m shipping dock,
// which leaves the 18 m receiving dock reading 1.67x coarser. That is well
// inside the range where the eye reads "same material", and it is the price of
// one clone per surface class rather than one per call site - texture identity
// is part of the `StaticMeshBatch` merge key, so per-call-site clones would
// split this branch into twice as many draws.

/** Vertical I-beam webs: 0.8 x 14 m. ~1 m ORM tile, ~1.2 m panel pitch. */
const POST_ORM = band(DOCK_ORM, 1, 14);
const POST_NORMAL = band(DOCK_PANEL_NORMAL, 0.7, 12);
/** I-beam flanges: 1.1 x 14 m strips. No panel grid - a strip has no panels. */
const FLANGE_ORM = band(DOCK_ORM, 1, 14);
/** Header beam: 31 x 0.8 m. Tile ~1 m along its length. */
const HEADER_ORM = band(DOCK_ORM, 31, 1);
const HEADER_NORMAL = band(DOCK_PANEL_NORMAL, 26, 0.7);
/** Canopy deck: 34 x 8 m. ~1.4 m tile; panel pitch ~1.2 m. */
const CANOPY_ORM = band(DOCK_ORM, 24, 6);
const CANOPY_NORMAL = band(DOCK_PANEL_NORMAL, 28, 7);
/** Dock leveler plate: 29 x 2 m. ~1 m tile. */
const PLATE_ORM = band(DOCK_ORM, 29, 2);
const PLATE_NORMAL = band(DOCK_PANEL_NORMAL, 24, 1.7);

const NORMAL_SCALE = new THREE.Vector2(0.55, 0.55);

/**
 * Base roughness is 1 and the MAP is the authority, matching the machines and
 * the factory shell: `generateMachineORM`'s green channel spans 0.35-0.85 with
 * a mean of ~0.582, so a base of 1 lands the surface in the right band with
 * real variation instead of a flat constant.
 */
const steel = (
  hex: string,
  previousMetalness: number,
  maps: Partial<THREE.MeshStandardMaterialParameters>
) =>
  // `painted` rather than `metal`: every member here is `metalness: 0` after
  // `repaint`, i.e. a painted dielectric, and the metal profile deliberately
  // puts almost nothing into the diffuse because a conductor has none.
  //
  // The datum stays at 0 - a dock frame stands on the yard - but the grime
  // climb is shortened to the height of a truck bumper, which is what actually
  // marks a dock post.
  applyWorldSurface(
    new THREE.MeshStandardMaterial({
      color: repaint(hex, previousMetalness),
      roughness: 1,
      metalness: 0,
      normalScale: NORMAL_SCALE,
      ...maps,
    }),
    'painted',
    { grimeHeight: 1.2, grime: 0.34 }
  );

const MATERIALS = {
  post: steel('#475569', 0.8, { roughnessMap: POST_ORM, normalMap: POST_NORMAL }),
  flange: steel('#374151', 0.8, { roughnessMap: FLANGE_ORM }),
  header: steel('#475569', 0.8, { roughnessMap: HEADER_ORM, normalMap: HEADER_NORMAL }),
  headerFlange: steel('#374151', 0.8, { roughnessMap: HEADER_ORM }),
  canopy: steel('#374151', 0.6, { roughnessMap: CANOPY_ORM, normalMap: CANOPY_NORMAL }),
  strut: steel('#475569', 0.8, { roughnessMap: POST_ORM }),
  trim: steel('#64748b', 0.7, { roughnessMap: HEADER_ORM }),
  plate: steel('#475569', 0.7, { roughnessMap: PLATE_ORM, normalMap: PLATE_NORMAL }),
  plateRib: steel('#334155', 0.5, { roughnessMap: PLATE_ORM }),
  /** Lamp housing: painted pressed steel, small enough for no relief map. */
  housing: steel('#1e293b', 0.6, {}),
  sign: applyWorldSurface(
    new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.5, metalness: 0 }),
    'signage'
  ),
} as const;

/**
 * Floor hazard paint at the dock threshold: 26 m of it, and the largest flat
 * row this branch had.
 *
 * `signage` is the least-weathered profile on purpose. Hazard paint that has
 * been aged until it stops reading as a warning has been broken, not finished -
 * so the family carries a low macro amplitude and the smallest edge term, and
 * does its work through tone rather than through wear.
 *
 * The small emissive stays. It is what keeps the threshold legible under the
 * night ambient without making it a light source, the same reasoning as
 * `ROAD_PAINT_WHITE` in `FactoryExterior.tsx`.
 *
 * These are module-level rather than inline because every one of the dock's
 * openings draws the same paint; an inline material is one object per opening.
 */
const HAZARD_PAINT_YELLOW = applyWorldSurface(
  new THREE.MeshStandardMaterial({
    color: '#eab308',
    emissive: '#eab308',
    emissiveIntensity: 0.15,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
    polygonOffsetUnits: POLYGON_OFFSET.standard.units,
  }),
  'signage'
);

const HAZARD_PAINT_BLACK = applyWorldSurface(
  new THREE.MeshStandardMaterial({
    color: '#1e293b',
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.moderate.factor,
    polygonOffsetUnits: POLYGON_OFFSET.moderate.units,
  }),
  'signage'
);

/** Shared unit box: one geometry for every rectangular member on the dock. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const LAMP_SPHERE = new THREE.SphereGeometry(0.15, 16, 16);

/** Lamp lenses. Emissive only - a lens has no useful albedo detail. */
const LAMP_MATERIALS = {
  greenLit: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#22c55e',
    emissiveIntensity: 0.9,
    roughness: 0.35,
  }),
  greenDark: new THREE.MeshStandardMaterial({ color: '#14361f', roughness: 0.8 }),
  redLit: new THREE.MeshStandardMaterial({
    color: '#ef4444',
    emissive: '#ef4444',
    emissiveIntensity: 0.9,
    roughness: 0.35,
  }),
  redDark: new THREE.MeshStandardMaterial({ color: '#4a1515', roughness: 0.8 }),
} as const;

/**
 * Dock leveler and status lamps: the moving half of this subsystem.
 *
 * WHY THIS EXISTS. `audit-scene-motion.mjs` read `authored-dock-openings` as 43
 * objects, 0 moved, 0 turned and 0 of 6 instanced meshes changed - a completely
 * dead subsystem in a scene whose entire subject is trucks arriving. It was
 * dead because there was nothing here that COULD move: the opening is
 * deliberately a see-through portal with no shutter, so the honest mechanism to
 * animate is the one a real dock actually works with. A leveler plate bridges
 * the gap onto the trailer bed when a truck berths and sits flat when it does
 * not, and the pair of post lamps reads green for a free bay and red for an
 * occupied one.
 *
 * `userData.dynamic` keeps the whole group out of `StaticMeshBatch`: a merged
 * mesh cannot move, and a merged material cannot change colour, so batching
 * this would silently restore the zero it exists to remove.
 */
// ~7.5 degrees: the outboard lip lifts toward the trailer bed, which sits above the dock floor.
const LEVELER_DEPLOYED_PITCH = -0.13;
const LEVELER_SMOOTH_TIME = 0.55; // Seconds to converge; a hydraulic ram is slow.

interface DockMechanismProps {
  width: number;
  height: number;
  halfWidth: number;
  frameWidth: number;
  frameDepth: number;
  dock?: OpenDockOpeningProps['dock'];
}

const DockMechanism: React.FC<DockMechanismProps> = ({
  width,
  height,
  halfWidth,
  frameWidth,
  frameDepth,
  dock,
}) => {
  const levelerRef = useRef<THREE.Group>(null);
  const pitchRef = useRef(0);

  /**
   * Subscribed, not polled. This is a boolean that changes a few times a
   * shift, so a selector re-render is cheaper than reading the store every
   * frame - and the lamp lenses are swapped MATERIALS, which only React can do.
   */
  const docked = useTruckScheduleStore((state) =>
    dock ? state.truckSchedule[dock].truckDocked : false
  );

  useFrame((_state, delta) => {
    const target = docked ? LEVELER_DEPLOYED_PITCH : 0;
    // Exponential damping, framerate independent. A discrete assignment would
    // teleport a 29 m steel plate through 7 degrees in one frame.
    const alpha = 1 - Math.exp(-Math.max(0, delta) / LEVELER_SMOOTH_TIME);
    pitchRef.current += (target - pitchRef.current) * alpha;
    if (levelerRef.current) levelerRef.current.rotation.x = pitchRef.current;
  });

  const lampPositions = useMemo(
    () => [-halfWidth - frameWidth / 2, halfWidth + frameWidth / 2],
    [halfWidth, frameWidth]
  );

  return (
    <group userData={{ dynamic: true }}>
      {/* Dock leveler platform. The pivot is at the inboard edge so the lip
          swings out over the trailer rather than the whole plate sinking. */}
      <group ref={levelerRef} position={[0, 0.08, 0]}>
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.plate}
          scale={[width - 1, 0.15, 2]}
          position={[0, 0, 1]}
          castShadow
        />
        {[-6, -3, 0, 3, 6].map((x, index) => (
          <mesh
            key={`leveler-rib-${index}`}
            geometry={UNIT_BOX}
            material={MATERIALS.plateRib}
            scale={[0.1, 0.02, 1.8]}
            position={[x, 0.08, 1]}
          />
        ))}
      </group>

      {/* Status lamps: green for a free bay, red for an occupied one. */}
      {lampPositions.map((x, index) => (
        <group key={`status-${index}`} position={[x, height - 1, frameDepth / 2 + 0.2]}>
          <mesh
            geometry={LAMP_SPHERE}
            material={docked ? LAMP_MATERIALS.greenDark : LAMP_MATERIALS.greenLit}
            position={[0, 0.5, 0]}
          />
          <mesh
            geometry={LAMP_SPHERE}
            material={docked ? LAMP_MATERIALS.redLit : LAMP_MATERIALS.redDark}
            position={[0, -0.5, 0]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.housing}
            scale={[0.5, 1.5, 0.2]}
            position={[0, 0, -0.1]}
          />
        </group>
      ))}
    </group>
  );
};

/**
 * Open-air dock opening with steel frame structure.
 * Creates a walkthrough/see-through loading dock entrance
 * that visually communicates the exterior beyond.
 */
export const OpenDockOpening: React.FC<OpenDockOpeningProps> = ({
  position,
  width = 20,
  height = 20,
  rotation = 0,
  label = 'DOCK',
  hasCanopy = true,
  dock,
}) => {
  const halfWidth = width / 2;
  const frameWidth = 0.8; // I-beam width
  const frameDepth = 0.6;
  // One diagonal every 4 m across the full `width + 2` threshold band.
  const stripeCount = Math.floor((width + 2) / 4);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Left and right vertical I-beam posts */}
      {[-halfWidth - frameWidth / 2, halfWidth + frameWidth / 2].map((x, index) => (
        <group key={`post-${index}`} position={[x, height / 2, 0]}>
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.post}
            scale={[frameWidth, height, frameDepth]}
            castShadow
          />
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.flange}
            scale={[frameWidth + 0.3, height, 0.15]}
            position={[0, 0, frameDepth / 2 + 0.1]}
            castShadow
          />
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.flange}
            scale={[frameWidth + 0.3, height, 0.15]}
            position={[0, 0, -frameDepth / 2 - 0.1]}
            castShadow
          />
        </group>
      ))}

      {/* Top header beam */}
      <group position={[0, height + frameWidth / 2, 0]}>
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.header}
          scale={[width + frameWidth * 2 + 0.6, frameWidth, frameDepth]}
          castShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.headerFlange}
          scale={[width + frameWidth * 2 + 0.6, frameWidth + 0.2, 0.15]}
          position={[0, 0, frameDepth / 2 + 0.1]}
          castShadow
        />
      </group>

      {/* Warning stripes at floor level */}
      <mesh position={[0, FLOOR_LAYERS.safetyMain, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 2, 1.5]} />
        <primitive object={HAZARD_PAINT_YELLOW} attach="material" />
      </mesh>
      {/* Black diagonal stripes on yellow */}
      {Array.from({ length: stripeCount }, (_, i) => (
        <mesh
          key={`stripe-${i}`}
          position={[(i - (stripeCount - 1) / 2) * 4, FLOOR_LAYERS.safetyMain + 0.005, 0]}
          rotation={[-Math.PI / 2, 0, Math.PI / 4]}
        >
          {/* 1.7 m long: rotated 45 degrees it reaches +/-0.74 m, inside the 1.5 m band. */}
          <planeGeometry args={[0.4, 1.7]} />
          <primitive object={HAZARD_PAINT_BLACK} attach="material" />
        </mesh>
      ))}

      <DockMechanism
        width={width}
        height={height}
        halfWidth={halfWidth}
        frameWidth={frameWidth}
        frameDepth={frameDepth}
        dock={dock}
      />

      {/* Interior hood over the dock header. Local -Z is the building interior
          and +Z is outdoors; the exterior bays carry their own canopies in
          the truck yard, and the wall glazing above the opening rules out a
          slab running outward at this height. */}
      {hasCanopy && (
        <group position={[0, height + 1.5, -4]}>
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.canopy}
            scale={[width + 4, 0.2, 8]}
            castShadow
            receiveShadow
          />
          {[-halfWidth - 1, halfWidth + 1].map((x, i) => (
            <mesh
              key={`strut-${i}`}
              geometry={UNIT_BOX}
              material={MATERIALS.strut}
              scale={[0.15, 4, 0.15]}
              position={[x, -1.5, -2]}
              rotation={[Math.PI / 6, 0, 0]}
              castShadow
            />
          ))}
          <mesh
            geometry={UNIT_BOX}
            material={MATERIALS.trim}
            scale={[width + 4.2, 0.3, 0.2]}
            position={[0, -0.05, -3.9]}
          />
        </group>
      )}

      {/* Dock label sign */}
      <group position={[0, height + 2.5, 0.5]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.sign} scale={[6, 1.2, 0.15]} />
        {/* Painted lettering on a lit board: it darkens with the board at night instead of glowing. */}
        <Text
          position={[0, 0, 0.1]}
          fontSize={0.6}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          {label}
        </Text>
      </group>
    </group>
  );
};

export default OpenDockOpening;
