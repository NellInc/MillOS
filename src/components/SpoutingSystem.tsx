import { GeneratedBoundary } from './models/GeneratedModel';
import { GeneratedGeometrySurface } from './models/GeneratedGeometrySurface';
import React, { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyWorldSurface } from '../utils/worldSurface';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MachineData, MachineType } from '../types';
import { SITE_LAYOUT, PROCESS_GALLERY_POST_X } from '../constants/siteLayout';
import { audioManager } from '../utils/audioManager';
import { useAudioInitialized } from '../hooks/useAudioState';
import { ORM_MEAN_ROUGHNESS, PIPE_MATERIALS } from '../utils/sharedMaterials';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { selectSafetyHoldActive, useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useProductionStore } from '../stores/productionStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { isFlowAudible, machineFlowState } from '../simulation/lineFlow';
import { useShallow } from 'zustand/react/shallow';
import { generateProceduralNormal } from '../textures/normalGenerator';
import { useInstanceDistanceLod } from './performance/DistanceLod';
import {
  buildSpoutRoutes,
  createSpoutTubeGeometry,
  getSpoutRiserX,
  spoutMachineKey,
  SPOUT_PIPE_RADIUS,
  SPOUT_SERVICE_LAYOUT,
  type PipeRouteFamily,
  type SpoutRoute,
} from './flow/spoutRoutes';
import { FIXTURE_GRID_X, FIXTURE_GRID_Z } from './environment/InteriorLightRig';

export { createSpoutTubeGeometry };

/**
 * Bolted spout joint, instanced every 3-4 m along every route.
 *
 * Rendered 0.44 m across x 0.12 m long on a 0.34 m tube, and the camera walks
 * underneath these runs, so the previous `CylinderGeometry(0.22, 0.22, 0.12,
 * 12)` read as a plain collar slid onto the pipe: no hub, no joint, nothing to
 * say the network is bolted up in sections rather than extruded in one piece.
 *
 * This is the real part - two weld-neck half-flanges back to back. Four
 * features carry, and all four were previewed at the pixel footprint of a 7 m
 * look up at a ceiling-height run (`pipe_flange_far` in
 * scripts/blender/specs/conveyors-spouting.json):
 *   - a tapered hub at each end, so the collar grows out of the tube instead
 *     of being pasted onto it;
 *   - a flat back face where the hub meets the plate;
 *   - a 17 mm plate rim band with a chamfer above and below. The chamfers are
 *     SHORT profile segments beside long ones, and LatheGeometry weights its
 *     normal average by segment length, so they shade as crisp machined edges
 *     rather than the soft 45-degree corner a bare step produces;
 *   - a 24 mm deep groove on the centreline - the silhouette notch that reads
 *     as TWO flanges from across the mill.
 *
 * The profile ends at r = 0.14, INSIDE the 0.17 m tube. A lathe is open at
 * both profile ends; tucking them under the pipe surface hides those openings
 * without paying for two cap fans. 0.14 is set by the WORST tier, not the
 * nominal radius: `radialSegments` drops to 6 on `low`, and a hexagon of
 * circumradius 0.17 has an apothem of 0.17 * cos(30 deg) = 0.1472, so an inner
 * rim at 0.15 pokes out through the flats of its own pipe over about a third
 * of the circumference. 0.14 clears the hex flats by 7 mm and the 8- and
 * 12-sided tiers by more.
 *
 * Envelope is identical to the cylinder it replaces - max radius 0.22, y in
 * [-0.06, 0.06] - so no flange matrix needs retuning. Radii are authored
 * against `SPOUT_PIPE_RADIUS` = 0.17 (rim = radius + 0.05, as before). Segments
 * stay at 12 to match the tube's high-tier `radialSegments`: a rounder flange
 * on a 12-sided pipe would only make the pipe look coarser.
 */
function createPipeFlangeGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.14, -0.06), // hub root, tucked inside the tube
    new THREE.Vector2(0.188, -0.06), // hub end face - envelope y min
    new THREE.Vector2(0.194, -0.0545), // hub end chamfer
    new THREE.Vector2(0.202, -0.04), // hub cone rising to the plate
    new THREE.Vector2(0.202, -0.0355), // hub shoulder
    new THREE.Vector2(0.216, -0.0355), // plate back face
    new THREE.Vector2(0.22, -0.0315), // plate back chamfer
    new THREE.Vector2(0.22, -0.0145), // plate rim band - envelope max radius
    new THREE.Vector2(0.216, -0.0105), // plate front chamfer
    new THREE.Vector2(0.196, -0.008), // step into the joint groove
    new THREE.Vector2(0.196, 0.008), // groove floor
    new THREE.Vector2(0.216, 0.0105),
    new THREE.Vector2(0.22, 0.0145),
    new THREE.Vector2(0.22, 0.0315),
    new THREE.Vector2(0.216, 0.0355),
    new THREE.Vector2(0.202, 0.0355),
    new THREE.Vector2(0.202, 0.04),
    new THREE.Vector2(0.194, 0.0545),
    new THREE.Vector2(0.188, 0.06), // envelope y max
    new THREE.Vector2(0.14, 0.06),
  ];
  return new THREE.LatheGeometry(profile, 12);
}

const PIPE_FLANGE_GEOMETRY = createPipeFlangeGeometry();

/**
 * The flange beyond `PIPE_FLANGE_LOD.distance`: hub roots, hub ends and the
 * plate rim band of the same envelope on 8 sides (the medium pipe's count).
 * The chamfers and the 16 mm joint groove are under a pixel past 25 m; 80
 * triangles against the near flange's 456.
 */
export const PIPE_FLANGE_FAR_GEOMETRY = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0.14, -0.06),
    new THREE.Vector2(0.188, -0.06),
    new THREE.Vector2(0.22, -0.0315),
    new THREE.Vector2(0.22, 0.0315),
    new THREE.Vector2(0.188, 0.06),
    new THREE.Vector2(0.14, 0.06),
  ],
  8
);
export const PIPE_FLANGE_LOD = { distance: 30, hysteresis: 0.1 } as const;

/**
 * Pipe-rack column, instanced at [0.1, height, 0.1] with height 10-12: a 0.2 m
 * round column standing the full height of the interior.
 *
 * One `CylinderGeometry(1, 1, 1, 12)` used to serve BOTH this and the cross
 * beam below, at wildly different non-uniform scales, and that is why neither
 * could have features: any detail authored in unit y renders 11 m long on the
 * column and 3 m long on the beam. They are two geometries now. There are five
 * of each, both instanced, so the split costs one extra draw call and nothing
 * per-instance.
 *
 * Features are placed where the camera actually is. At 11 m tall and 0.2 m
 * across you read the foot as you walk past it and the head where the cross
 * beam lands; mid-height is a featureless tube from every angle, so it is left
 * BARE rather than given a splice collar nobody can see. What it gets: a
 * 0.23 m grout pedestal at the floor with a chamfered top shoulder, a slim
 * 0.156 m shaft, and a 0.18 m capital collar under the beam.
 *
 * Envelope unchanged - max radius 1.0, y in [-0.5, 0.5] - so the pedestal and
 * capital sit exactly on the old cylinder's skin and no instance matrix moves.
 * The SHAFT is what got thinner; insetting the body is the only way to stand a
 * plate proud without growing the part.
 */
function createPipeColumnGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.5), // pedestal underside centre (on the floor)
    new THREE.Vector2(1.0, -0.5), // pedestal rim - envelope max radius, y min
    new THREE.Vector2(1.0, -0.47909), // pedestal band, 0.23 m at scale 11
    new THREE.Vector2(0.94, -0.47727), // pedestal top chamfer
    new THREE.Vector2(0.78, -0.47727), // pedestal top face
    new THREE.Vector2(0.78, 0.47818), // bare shaft - 10.5 m, deliberately plain
    new THREE.Vector2(0.94, 0.48), // capital underside chamfer
    new THREE.Vector2(1.0, 0.48182),
    new THREE.Vector2(1.0, 0.49818), // capital band, 0.18 m
    new THREE.Vector2(0.94, 0.5), // capital top chamfer - envelope y max
    new THREE.Vector2(0.0, 0.5),
  ];
  return new THREE.LatheGeometry(profile, 12);
}

const PIPE_COLUMN_GEOMETRY = createPipeColumnGeometry();

/**
 * Pipe-rack cross beam, instanced at [0.08, 3, 0.08] and rotated 90 degrees
 * about Z: a 0.16 m strut spanning 3 m across the head of each column.
 *
 * Viewed from the floor, 10 m below, so the only things that can read are the
 * silhouette steps. It gets three: bolted end plates at both ends, a slimmed
 * 0.128 m web between them, and two U-bolt clamp saddles where spouting is
 * strapped down. That last pair is what turns a smooth rod into a rack member.
 *
 * Envelope unchanged - max radius 1.0, y in [-0.5, 0.5]; the end plates hold
 * the extremes and the web is inset behind them.
 */
function createPipeCrossBeamGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.5), // end plate outer face centre
    new THREE.Vector2(1.0, -0.5), // end plate rim - envelope max radius, y min
    new THREE.Vector2(1.0, -0.49333), // plate band, 20 mm at scale 3
    new THREE.Vector2(0.8, -0.48667), // step in to the web
    new THREE.Vector2(0.8, -0.2),
    new THREE.Vector2(0.95, -0.19333), // U-bolt clamp saddle
    new THREE.Vector2(0.95, -0.17333),
    new THREE.Vector2(0.8, -0.16667),
    new THREE.Vector2(0.8, 0.16667),
    new THREE.Vector2(0.95, 0.17333), // second saddle
    new THREE.Vector2(0.95, 0.19333),
    new THREE.Vector2(0.8, 0.2),
    new THREE.Vector2(0.8, 0.48667),
    new THREE.Vector2(1.0, 0.49333),
    new THREE.Vector2(1.0, 0.5), // envelope y max
    new THREE.Vector2(0.0, 0.5),
  ];
  return new THREE.LatheGeometry(profile, 12);
}

const PIPE_CROSS_BEAM_GEOMETRY = createPipeCrossBeamGeometry();
/**
 * Machined joint faces read brighter and tighter than the tube body - that
 * contrast is what makes a spouting run legible from across the mill.
 *
 * `metal`, and the same overturn `machineSurfaces.hardware` records. The
 * standing closure on this row - "0.2 m members, sub-pixel noise that mips to a
 * flat constant" - is exactly right about a UV-TILED MAP and says nothing about
 * an analytic field sampled in metres with no UVs at all. At 17.1 m over 77
 * instances this was the largest untreated row left after the pass-7 sweep, and
 * the sweep could not reach it: the spouting network mounts outside every
 * `StaticMeshBatch` root, so no batcher pass ever sees these materials.
 *
 * The term that pays here is `edge`, not `meso`: a 0.2 m flange is near-grazing
 * over most of its visible area, so the fresnel wear toward bare steel is what
 * gives a joint a silhouette at mill distance, while the 0.4 m meso period
 * varies flange-to-flange rather than within one.
 */
const PIPE_FLANGE_MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({
    color: '#8b9ca0',
    metalness: 0.62,
    roughness: 0.35,
    envMapIntensity: 1.25,
  }),
  'metal'
);

interface PipeRouteMesh {
  readonly family: PipeRouteFamily;
  readonly geometry: THREE.BufferGeometry;
}

/** Whether two straight runs lie on one centreline and overlap along it. */
function sharesRun(a: THREE.LineCurve3, b: THREE.LineCurve3) {
  const along = a.v2.clone().sub(a.v1);
  const length = along.length();
  if (length < 1e-6) return false;
  along.divideScalar(length);
  const other = b.v2.clone().sub(b.v1);
  if (other.lengthSq() < 1e-12 || other.normalize().cross(along).length() > 1e-6) return false;
  const offset = b.v1.clone().sub(a.v1);
  if (offset.clone().addScaledVector(along, -offset.dot(along)).length() > 1e-4) return false;
  const t1 = offset.dot(along),
    t2 = b.v2.clone().sub(a.v1).dot(along);
  return Math.min(length, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > 1e-3;
}

/**
 * Tube radius per route. Routes of one family can run down one centreline:
 * the silo intakes share the silo-side gallery run, and two lift lines land
 * on the same sifter inlet (four mills, three sifters). Equal tubes there lie
 * face on face in one merged draw, with the roughness and AO texels of two UV
 * runs fighting for depth. Each route that shares a run with earlier ones
 * takes the first radius none of them uses, in 4 mm steps, so a shared run
 * shows one sleeve over the others.
 * Working if no two routes of one family share a tube face.
 */
export function spoutRouteRadii(
  routes: readonly {
    readonly family: PipeRouteFamily;
    readonly curve: THREE.CurvePath<THREE.Vector3>;
  }[]
): number[] {
  const runs = routes.map(({ curve }) =>
    curve.curves.filter((c): c is THREE.LineCurve3 => c instanceof THREE.LineCurve3)
  );
  const steps: number[] = [];
  routes.forEach((route, i) => {
    const taken = new Set(
      steps.filter(
        (_, j) =>
          routes[j].family === route.family &&
          runs[i].some((a) => runs[j].some((b) => sharesRun(a, b)))
      )
    );
    let step = 0;
    while (taken.has(step)) step++;
    steps.push(step);
  });
  return steps.map((step) => SPOUT_PIPE_RADIUS + step * 0.004);
}

/**
 * Family-specific route materials.
 *
 * These are CLONES of the shared `PIPE_MATERIALS`, not edits to them:
 * `sharedMaterials.ts` is consumed by machines, forklifts and infrastructure,
 * and the spouting network is the only place that wants rolled-sheet grain and
 * a per-family roughness spread. The clone shares the source textures, so the
 * only cost is three extra material objects.
 *
 * These materials have no albedo map, so `color` IS the finish colour.
 * Intake and product lines are galvanised conductors; the lift line remains
 * food-grade paint. The global pipe library is untouched.
 */
let routeMaterialCache: Record<PipeRouteFamily, THREE.MeshStandardMaterial> | null = null;

export const getSpoutRouteMaterials = (): Record<PipeRouteFamily, THREE.MeshStandardMaterial> => {
  if (routeMaterialCache) return routeMaterialCache;

  // Cloned so the tiling below cannot leak into other consumers of the cached
  // source texture.
  const detailNormal = generateProceduralNormal(256, 0.12, 16).clone();
  detailNormal.wrapS = THREE.RepeatWrapping;
  detailNormal.wrapT = THREE.RepeatWrapping;
  // Fine rolled-sheet grain, with the actual flanges providing the joints.
  // An embossed cabinet-panel grid stretched around these tubes read as dents.
  detailNormal.colorSpace = THREE.NoColorSpace;
  detailNormal.repeat.set(6, 1);
  detailNormal.needsUpdate = true;

  const normalScale = new THREE.Vector2(0.22, 0.22);

  const derive = (
    source: THREE.MeshStandardMaterial,
    finishRoughness: number,
    color: string,
    family: PipeRouteFamily
  ): THREE.MeshStandardMaterial => {
    const material = source.clone();
    material.name = `process-spout-${family}`;
    material.color.set(color);
    // The source carries an ORM roughness map. Author the FINAL average,
    // otherwise its green channel halves the intended finish into a mirror.
    material.roughness = finishRoughness / ORM_MEAN_ROUGHNESS;
    material.normalMap = detailNormal;
    material.normalScale = normalScale;
    material.envMapIntensity = 1.2;
    return material;
  };

  routeMaterialCache = {
    intake: derive(PIPE_MATERIALS.lightPipe, 0.42, '#b8c2bf', 'intake'),
    pneumatic: derive(PIPE_MATERIALS.whitePipe, 0.38, '#9ba7a1', 'pneumatic'),
    finished: derive(PIPE_MATERIALS.lightPipe, 0.32, '#cbd0c9', 'finished'),
  };
  return routeMaterialCache;
};

function InstancedPipeFlanges({ matrices }: { readonly matrices: readonly THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const farRef = useRef<THREE.InstancedMesh>(null);
  const near = useMemo(() => [ref], []);
  const far = useMemo(() => [farRef], []);
  useInstanceDistanceLod({ near, far, matrices, ...PIPE_FLANGE_LOD });

  useLayoutEffect(() => {
    if (!ref.current) return;
    matrices.forEach((matrix, index) => ref.current?.setMatrixAt(index, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [matrices]);

  if (matrices.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[PIPE_FLANGE_GEOMETRY, PIPE_FLANGE_MATERIAL, matrices.length]}
        castShadow
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'spoutingFlangeUnit'}
            original={PIPE_FLANGE_GEOMETRY}
            meshRef={ref}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        name="spout-flanges-far"
        ref={farRef}
        args={[PIPE_FLANGE_FAR_GEOMETRY, PIPE_FLANGE_MATERIAL, matrices.length]}
        castShadow
        receiveShadow
      />
    </>
  );
}

export const SpoutingSystem = React.memo<{
  machines: MachineData[];
  enableAudio?: boolean;
}>(({ machines, enableAudio = true }) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  // Product stops moving through the spouts under a fire drill or emergency
  // stop, so the flow sound stops with it and resumes when the hold clears.
  const safetyHold = useGameSimulationStore(selectSafetyHoldActive);
  const quality = useGraphicsStore(useShallow((state) => state.graphics.quality));
  // Extract stable machine data to prevent unnecessary re-renders.
  // Shared with GrainFlow through `spoutRoutes`, so both agree on when the
  // layout has actually changed (and ignore per-tick status churn).
  const machineKey = useMemo(() => spoutMachineKey(machines), [machines]);

  // Calculate spouting sound positions (midpoints of key pipe connections)
  const spoutPositions = useMemo(() => {
    // `machineId` is the machine the product is pouring into or through; the
    // pour is audible only while that machine is working.
    const positions: { id: string; machineId: string; x: number; y: number; z: number }[] = [];
    const silos = machines.filter((m) => m.type === MachineType.SILO);
    const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
    const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);

    // Add sound positions at key pipe junctions
    mills.forEach((mill, i) => {
      const silo = silos[i % silos.length];
      if (silo) {
        positions.push({
          id: `spout-silo-mill-${i}`,
          machineId: mill.id,
          x: (silo.position[0] + mill.position[0]) / 2,
          y: 8,
          z: (silo.position[2] + mill.position[2]) / 2,
        });
      }
    });

    sifters.forEach((sifter, i) => {
      positions.push({
        id: `spout-sifter-${i}`,
        machineId: sifter.id,
        x: sifter.position[0],
        y: sifter.position[1],
        z: sifter.position[2],
      });
    });

    return positions;
  }, [machineKey]); // Use stable key instead of full machines array

  // Each pour sound follows the product it stands for: silent while the shift
  // clock or a safety hold stops the plant, and while its machine is critical,
  // idle or starved (the state the machine itself animates from). Reconciled
  // from the frame loop on a throttle, so per-tick status churn never
  // re-renders this component.
  const audioReady = useAudioInitialized();
  const playingRef = useRef(new Set<string>());
  useEffect(() => {
    const playing = playingRef.current;
    return () => {
      playing.forEach((id) => audioManager.stopSpoutingSound(id));
      playing.clear();
    };
  }, [enableAudio, audioReady, spoutPositions]);

  useFrame(() => {
    if (!isTabVisible) return;
    const playing = playingRef.current;
    if (shouldRunThisFrame(15)) {
      const { gameSpeed } = useGameSimulationStore.getState();
      const machinesNow = useProductionStore.getState().machines;
      const buffers = useMaterialFlowStore.getState().machineBuffers;
      spoutPositions.forEach((pos) => {
        const audible =
          enableAudio &&
          audioReady &&
          isFlowAudible(
            machineFlowState(pos.machineId, machinesNow, buffers),
            gameSpeed,
            safetyHold
          );
        if (audible && !playing.has(pos.id)) {
          audioManager.startSpoutingSound(pos.id, pos.x, pos.y, pos.z);
          playing.add(pos.id);
        } else if (!audible && playing.has(pos.id)) {
          audioManager.stopSpoutingSound(pos.id);
          playing.delete(pos.id);
        }
      });
    }
    // Spatial volume is fine at ~30fps; throttle to reduce per-frame audio work
    if (playing.size === 0 || !shouldRunThisFrame(2)) return;
    playing.forEach((id) => audioManager.updateSpoutingSpatialVolume(id));
  });

  // Silhouette quality by tier. 8 radial segments on a 0.17 m pipe is a visible
  // octagon at interior camera distance; the routes are merged into 3 draw
  // calls either way, so this is vertex throughput only.
  const radialSegments = quality === 'low' ? 6 : quality === 'medium' ? 8 : 12;

  const pipeData = useMemo(() => {
    const routeGeometries: Record<PipeRouteFamily, THREE.BufferGeometry[]> = {
      intake: [],
      pneumatic: [],
      finished: [],
    };
    const flangeMatrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const tangentTarget = new THREE.Vector3();

    // Curves come from the shared route builder so GrainFlow puts product
    // inside these exact pipes.
    const spoutRoutes = buildSpoutRoutes(machines);
    const radii = spoutRouteRadii(spoutRoutes);
    spoutRoutes.forEach(({ family, curve, length }, index) => {
      routeGeometries[family].push(createSpoutTubeGeometry(curve, radialSegments, radii[index]));

      // Real spouting is bolted up roughly every 3-4 m. Flanges are instanced
      // into one draw call, so density here is nearly free and it is what makes
      // the run read as jointed pipework rather than an extruded noodle.
      const flangeCount = Math.min(16, Math.max(2, Math.round(length / 4)));

      for (let f = 1; f < flangeCount; f++) {
        const t = f / flangeCount;
        const pt = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);

        dummy.position.copy(pt);
        tangentTarget.copy(pt).add(tan);
        dummy.lookAt(tangentTarget);
        dummy.rotateX(Math.PI / 2);
        dummy.updateMatrix();
        flangeMatrices.push(dummy.matrix.clone());
      }
    });

    const routes = (Object.entries(routeGeometries) as [PipeRouteFamily, THREE.BufferGeometry[]][])
      .map(([family, geometries]): PipeRouteMesh | null => {
        if (geometries.length === 0) return null;
        const geometry = mergeGeometries(geometries, false);
        geometries.forEach((sourceGeometry) => sourceGeometry.dispose());
        return geometry ? { family, geometry } : null;
      })
      .filter((route): route is PipeRouteMesh => route !== null);

    const hangers = buildSpoutHangers(spoutRoutes, radii);

    return { routes, flangeMatrices, hangers };
    // Stable layout key + tier, not the machines array (status ticks constantly).
  }, [machineKey, radialSegments]);

  // Dispose route geometries on unmount or when dependencies change. Module-level
  // materials and instanced detail geometry remain shared for the application lifetime.
  useEffect(() => {
    return () => {
      pipeData.routes.forEach(({ geometry }) => geometry.dispose());
    };
  }, [pipeData]);

  const routeMaterials = getSpoutRouteMaterials();

  return (
    <group name="process-spouting-network">
      {pipeData.routes.map(({ family, geometry }) => (
        // receiveShadow: without it the runs never darken under the roof
        // structure or under each other, which is most of the "nothing is
        // occluded at ceiling height" read.
        <mesh
          key={family}
          geometry={geometry}
          material={routeMaterials[family]}
          castShadow
          receiveShadow
        />
      ))}
      <InstancedPipeFlanges matrices={pipeData.flangeMatrices} />
      <PipeSupports />
      <SpoutHangers hangers={pipeData.hangers} />
    </group>
  );
});

type SupportSegment = {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
};

/** Braced service racks attach to the existing gallery columns.
 * Working if the arms meet actual pipe runs, their inner ends meet a gallery
 * post, and no replacement post occupies a vehicle or maintenance aisle.
 */
export const PIPE_SUPPORT_SEGMENTS: { beams: SupportSegment[]; braces: SupportSegment[] } = (() => {
  const beams: SupportSegment[] = [];
  const braces: SupportSegment[] = [];
  const galleryZ = SITE_LAYOUT.factory.zones.sifting;
  const intakeY = SPOUT_SERVICE_LAYOUT.intakeRackY;
  const beamY = intakeY - SPOUT_PIPE_RADIUS - 0.08;
  const endZ =
    SITE_LAYOUT.machines.rollerMills[0].position[2] -
    SPOUT_SERVICE_LAYOUT.intakeSetback +
    (SITE_LAYOUT.machines.rollerMills.length - 1) * SPOUT_SERVICE_LAYOUT.intakeLanePitch +
    0.25;
  for (const x of PROCESS_GALLERY_POST_X.filter((x) => x !== 0)) {
    const start = [x, beamY, galleryZ + 4.8] as const;
    const end = [x, beamY, endZ] as const;
    beams.push({ start, end });
    braces.push({ start: [x, beamY - 0.75, galleryZ + 4.8], end });
  }
  SITE_LAYOUT.machines.rollerMills.forEach((mill, index) => {
    const sifter = SITE_LAYOUT.machines.sifters[index % SITE_LAYOUT.machines.sifters.length];
    const x = getSpoutRiserX(mill.position[0]);
    const z =
      sifter.position[2] -
      SPOUT_SERVICE_LAYOUT.rearSetback +
      index * SPOUT_SERVICE_LAYOUT.rearLanePitch;
    const post = PROCESS_GALLERY_POST_X.reduce((nearest, value) =>
      Math.abs(value - x) < Math.abs(nearest - x) ? value : nearest
    );
    const start = new THREE.Vector3(post, beamY, galleryZ - 4.8);
    const end = new THREE.Vector3(x, beamY, z);
    end.addScaledVector(start.clone().sub(end).normalize(), SPOUT_PIPE_RADIUS);
    beams.push({
      start: start.toArray() as [number, number, number],
      end: end.toArray() as [number, number, number],
    });
    braces.push({
      start: [post, beamY - 0.75, galleryZ - 4.8],
      end: end.toArray() as [number, number, number],
    });
  });
  return { beams, braces };
})();

/** A support member: a segment drawn at `radius` with the rack's lathe geometry. */
export type HangerSegment = SupportSegment & { readonly radius: number };

/**
 * Hall roof steel the drop rods hang from, mirrored from
 * `OptimizedFactoryInfrastructure` (deck, purlins, skylight wells, trusses) so
 * this module does not pull the shell's materials into the spouting chunk.
 * `OptimizedFactoryInfrastructure.test.ts` holds every rod top against the
 * real purlins, so a drift in either copy fails there.
 */
const HALL_ROOF = {
  deckTop: SITE_LAYOUT.factory.bounds.maxY + 0.63,
  pitch: 0.05,
  halfCentre: SITE_LAYOUT.factory.floor.width / 4,
  deckDepth: 0.36,
  halfSpan: SITE_LAYOUT.factory.floor.width / 2 - 0.45,
  purlinPitch: 1.5,
  purlinDepth: 0.16,
  purlinGap: 0.01,
  skylightZ: [-26, 0, 26],
  skylightCentreX: 15,
  skylightHalf: { x: 4.5, z: 5.5 },
  trussZ: [-30, -10, 10, 30],
  /** Underside of a truss's bottom-chord flange (`buildFactoryRoofStructure`). */
  trussUnderside: SITE_LAYOUT.factory.bounds.maxY - 2.9 - 0.3,
} as const;

/** Purlin centre lines across the hall, both roof halves. */
const HALL_PURLIN_X: readonly number[] = (() => {
  const count = Math.floor((HALL_ROOF.halfSpan - 0.5) / HALL_ROOF.purlinPitch + 0.5);
  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * HALL_ROOF.purlinPitch;
    xs.push(-x, x);
  }
  return xs.sort((a, b) => a - b);
})();

/** Underside of the purlin on line `x` (its lower face at its centre line). */
function hallPurlinUnderside(x: number): number {
  const side = x < 0 ? -1 : 1;
  const slope = -HALL_ROOF.pitch * side;
  const local = (x - HALL_ROOF.halfCentre * side) / Math.cos(HALL_ROOF.pitch);
  const deckUnderside = HALL_ROOF.deckTop + local * Math.sin(slope) - HALL_ROOF.deckDepth;
  const centre =
    deckUnderside - (HALL_ROOF.purlinGap + HALL_ROOF.purlinDepth / 2) / Math.cos(slope);
  return centre - (HALL_ROOF.purlinDepth / 2) * Math.cos(slope);
}

/** Gallery plan (deck and girders), where its own steel carries the spouting. */
const GALLERY_PLAN = {
  minX: -21.75,
  maxX: 21.75,
  minZ: SITE_LAYOUT.factory.zones.sifting - 5.1,
  maxZ: SITE_LAYOUT.factory.zones.sifting + 5.1,
};

/** Spacing of hangers along a bundle, the spouting's bolted-joint pitch (`flangeCount`). */
const HANGER_PITCH = 4;
const HANGER_BEAM_RADIUS = 0.07;
/**
 * 80 mm drop struts, not 60 mm rod: the packing and interior cameras see them
 * from 30-60 m, where 60 mm drew a one-pixel line that broke up into dashes
 * (groupA-after interior).
 */
const HANGER_ROD_RADIUS = 0.04;

interface HangerLane {
  readonly route: number;
  readonly lateral: number;
  readonly from: number;
  readonly to: number;
  readonly radius: number;
}

/**
 * Trapeze hangers for the overhead spouting that no gallery steel reaches.
 *
 * packing (runtime-triage-20261106): the three finished-product runs crossed
 * the hall 7.7 m up for 26 m with nothing holding them. Each
 * support is a trapeze bar under the run (the rack's crossbeam lathe) on two
 * drop rods (the rack's column lathe) up to a roof purlin: a single run gets
 * one beside a bolted joint, a bundle one every HANGER_PITCH metres. A station
 * is dropped, not moved, wherever it would meet the gallery, a skylight well,
 * a truss, a light fitting, an existing bracket or another run.
 *
 * Working if every rod ends on a real purlin, no member touches a run it does
 * not carry, and each carried run sits on its bar.
 */
export function buildSpoutHangers(
  routes: readonly SpoutRoute[],
  radii: readonly number[]
): { beams: HangerSegment[]; rods: HangerSegment[] } {
  const beams: HangerSegment[] = [];
  const rods: HangerSegment[] = [];
  const groups = new Map<string, HangerLane[]>();
  routes.forEach((route, index) => {
    // Finished-product runs only. The intake bundle east of the gallery was
    // tried (groupA-after): its drops stood 5-12 m in front of the sifting
    // camera and cut the frame top to bottom like strings.
    if (route.family !== 'finished') return;
    for (const piece of route.curve.curves) {
      if (!(piece instanceof THREE.LineCurve3)) continue;
      const { v1: a, v2: b } = piece;
      if (Math.abs(a.y - b.y) > 1e-3 || a.distanceTo(b) < 3) continue;
      const alongX = Math.abs(a.z - b.z) < 1e-3;
      if (!alongX && Math.abs(a.x - b.x) > 1e-3) continue;
      const key = `${alongX ? 'x' : 'z'}:${a.y.toFixed(2)}`;
      const lanes = groups.get(key) ?? [];
      lanes.push({
        route: index,
        lateral: alongX ? a.z : a.x,
        from: Math.min(alongX ? a.x : a.z, alongX ? b.x : b.z),
        to: Math.max(alongX ? a.x : a.z, alongX ? b.x : b.z),
        radius: radii[index] ?? SPOUT_PIPE_RADIUS,
      });
      groups.set(key, lanes);
    }
  });

  // Every run's centreline, for clearance checks.
  const samples: { route: number; point: THREE.Vector3; radius: number }[] = [];
  routes.forEach((route, index) => {
    const steps = Math.ceil(route.length / 0.2);
    for (let s = 0; s <= steps; s++)
      samples.push({
        route: index,
        point: route.curve.getPointAt(s / steps),
        radius: radii[index] ?? SPOUT_PIPE_RADIUS,
      });
  });
  const segment = new THREE.Line3();
  const closest = new THREE.Vector3();
  const clear = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    carried: Set<number>
  ) => {
    segment.set(start, end);
    return samples.every(({ route, point, radius: pipe }) => {
      if (carried.has(route)) return true;
      segment.closestPointToPoint(point, true, closest);
      return closest.distanceTo(point) > pipe + radius + 0.04;
    });
  };
  const rodFree = (x: number, z: number) =>
    Math.abs(x) < HALL_ROOF.halfSpan - 1 &&
    Math.abs(z) < 48 &&
    HALL_ROOF.trussZ.every((tz) => Math.abs(z - tz) > 0.6) &&
    !HALL_ROOF.skylightZ.some(
      (sz) =>
        Math.abs(Math.abs(x) - HALL_ROOF.skylightCentreX) < HALL_ROOF.skylightHalf.x + 0.3 &&
        Math.abs(z - sz) < HALL_ROOF.skylightHalf.z + 0.3
    ) &&
    !FIXTURE_GRID_X.some(
      (fx) => Math.abs(x - fx) < 3.25 && FIXTURE_GRID_Z.some((fz) => Math.abs(z - fz) < 0.55)
    );
  const inGallery = (x: number, z: number) =>
    x > GALLERY_PLAN.minX - 0.4 &&
    x < GALLERY_PLAN.maxX + 0.4 &&
    z > GALLERY_PLAN.minZ - 0.4 &&
    z < GALLERY_PLAN.maxZ + 0.4;
  const nearestPurlin = (x: number) =>
    HALL_PURLIN_X.reduce((best, p) => (Math.abs(p - x) < Math.abs(best - x) ? p : best));

  for (const [key, all] of groups) {
    const alongX = key.startsWith('x');
    const y = Number(key.slice(2));
    // Bundles: lanes within a metre of each other share one trapeze.
    const sorted = [...all].sort((p, q) => p.lateral - q.lateral);
    const bundles: HangerLane[][] = [];
    for (const lane of sorted) {
      const last = bundles[bundles.length - 1];
      if (last && lane.lateral - last[last.length - 1].lateral < 1) last.push(lane);
      else bundles.push([lane]);
    }
    for (const bundle of bundles) {
      let stations: number[];
      if (bundle.length === 1) {
        // Beside each bolted joint the flanges mark (same count as InstancedPipeFlanges).
        const lane = bundle[0];
        const route = routes[lane.route];
        const count = Math.min(16, Math.max(2, Math.round(route.length / 4)));
        stations = [];
        for (let f = 1; f < count; f++) {
          const p = route.curve.getPointAt(f / count);
          const lateral = alongX ? p.z : p.x;
          if (Math.abs(p.y - y) > 1e-2 || Math.abs(lateral - lane.lateral) > 1e-2) continue;
          stations.push((alongX ? p.x : p.z) + 0.45);
        }
      } else {
        const from = Math.min(...bundle.map((lane) => lane.from));
        const to = Math.max(...bundle.map((lane) => lane.to));
        stations = [];
        for (let s = from + 1; s <= to - 0.6; s += HANGER_PITCH) stations.push(s);
      }
      const seen = new Set<string>();
      for (const raw of stations) {
        // A rod lands on a purlin (they run along z) or, beside a truss, on its
        // bottom chord: a station within a metre of a truss moves onto it.
        const truss = alongX ? undefined : HALL_ROOF.trussZ.find((tz) => Math.abs(raw - tz) < 1);
        const along = alongX ? nearestPurlin(raw) : (truss ?? raw);
        if (seen.has(along.toFixed(3))) continue;
        seen.add(along.toFixed(3));
        const lanes = bundle.filter((lane) => along > lane.from + 0.6 && along < lane.to - 0.6);
        if (lanes.length === 0) continue;
        const lo = Math.min(...lanes.map((lane) => lane.lateral));
        const hi = Math.max(...lanes.map((lane) => lane.lateral));
        const radius = Math.max(...lanes.map((lane) => lane.radius));
        let rodLo: number;
        let rodHi: number;
        if (alongX) {
          rodLo = lo - radius - 0.13;
          rodHi = hi + radius + 0.13;
        } else {
          const left = HALL_PURLIN_X.filter((p) => p <= lo - 0.4);
          const right = HALL_PURLIN_X.filter((p) => p >= hi + 0.4);
          if (left.length === 0 || right.length === 0) continue;
          rodLo = left[left.length - 1];
          rodHi = right[0];
        }
        const at = (lateral: number): [number, number] =>
          alongX ? [along, lateral] : [lateral, along];
        const rodsXZ = [at(rodLo), at(rodHi)];
        if (
          !rodsXZ.every(
            ([x, z]) =>
              (truss !== undefined || rodFree(x, z)) && !inGallery(x, z) && Math.abs(x) < 38.6
          )
        )
          continue;
        if (inGallery(...at((lo + hi) / 2))) continue;
        // An existing gallery bracket already carries this bundle here.
        const bracketed = PIPE_SUPPORT_SEGMENTS.beams.some(
          ({ start, end }) =>
            Math.abs((alongX ? start[0] : start[2]) - along) < 1.5 &&
            Math.abs((alongX ? end[0] : end[2]) - along) < 1.5 &&
            Math.abs(start[1] - (y - radius - 0.08)) < 0.3
        );
        if (bracketed) continue;
        const beamY = y - radius - HANGER_BEAM_RADIUS;
        const carried = new Set(lanes.map((lane) => lane.route));
        const beamEnds = [at(rodLo - 0.08), at(rodHi + 0.08)].map(
          ([x, z]) => new THREE.Vector3(x, beamY, z)
        );
        if (!clear(beamEnds[0], beamEnds[1], HANGER_BEAM_RADIUS, carried)) continue;
        const rodSegments = rodsXZ.map(([x, z]) => ({
          start: new THREE.Vector3(x, beamY - HANGER_BEAM_RADIUS - 0.04, z),
          end: new THREE.Vector3(
            x,
            truss !== undefined ? HALL_ROOF.trussUnderside : hallPurlinUnderside(x),
            z
          ),
        }));
        if (!rodSegments.every(({ start, end }) => clear(start, end, HANGER_ROD_RADIUS, new Set())))
          continue;
        beams.push({
          start: beamEnds[0].toArray() as [number, number, number],
          end: beamEnds[1].toArray() as [number, number, number],
          radius: HANGER_BEAM_RADIUS,
        });
        for (const { start, end } of rodSegments)
          rods.push({
            start: start.toArray() as [number, number, number],
            end: end.toArray() as [number, number, number],
            radius: HANGER_ROD_RADIUS,
          });
      }
    }
  }
  return { beams, rods };
}

/** Write one instance matrix per segment: unit y along the member, `radius` across it. */
function setSegmentMatrices(mesh: THREE.InstancedMesh | null, segments: readonly HangerSegment[]) {
  if (!mesh) return;
  const object = new THREE.Object3D();
  const axis = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  segments.forEach(({ start, end, radius }, index) => {
    direction.set(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const length = direction.length();
    object.position.set((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2);
    object.quaternion.setFromUnitVectors(axis, direction.normalize());
    object.scale.set(radius, length, radius);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * The trapeze hangers: two instanced draws on the rack's own lathes and
 * materials, so each bar and rod reads as the same steel as the gallery rack.
 * Neither casts: a 60 mm rod 15 m long is under a shadow texel wide and would
 * only crawl across the slab.
 */
const SpoutHangers: React.FC<{
  readonly hangers: { readonly beams: HangerSegment[]; readonly rods: HangerSegment[] };
}> = React.memo(({ hangers }) => {
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const rodRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    setSegmentMatrices(beamRef.current, hangers.beams);
    setSegmentMatrices(rodRef.current, hangers.rods);
  }, [hangers]);
  if (hangers.beams.length === 0) return null;
  return (
    <group name="process-spouting-hangers">
      <instancedMesh
        key={`beams-${hangers.beams.length}`}
        ref={beamRef}
        args={[PIPE_CROSS_BEAM_GEOMETRY, PIPE_MATERIALS.supportSlate, hangers.beams.length]}
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'spoutingCrossbeamUnit'}
            original={PIPE_CROSS_BEAM_GEOMETRY}
            meshRef={beamRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        key={`rods-${hangers.rods.length}`}
        ref={rodRef}
        args={[PIPE_COLUMN_GEOMETRY, PIPE_MATERIALS.supportSlate, hangers.rods.length]}
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'spoutingColumnUnit'}
            original={PIPE_COLUMN_GEOMETRY}
            meshRef={rodRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
    </group>
  );
});

const PipeSupports: React.FC = React.memo(() => {
  const verticalRef = useRef<THREE.InstancedMesh>(null);
  const crossBeamRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    const axis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    for (const [segments, ref, radius] of [
      [PIPE_SUPPORT_SEGMENTS.braces, verticalRef, 0.06],
      [PIPE_SUPPORT_SEGMENTS.beams, crossBeamRef, 0.08],
    ] as const) {
      segments.forEach(({ start, end }, index) => {
        direction.set(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
        const length = direction.length();
        object.position.set(
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2,
          (start[2] + end[2]) / 2
        );
        object.quaternion.setFromUnitVectors(axis, direction.normalize());
        object.scale.set(radius, length, radius);
        object.updateMatrix();
        ref.current?.setMatrixAt(index, object.matrix);
      });
    }

    [verticalRef.current, crossBeamRef.current].forEach((mesh) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, []);

  return (
    <group name="process-spouting-supports">
      <instancedMesh
        ref={verticalRef}
        args={[
          PIPE_COLUMN_GEOMETRY,
          PIPE_MATERIALS.supportGray,
          PIPE_SUPPORT_SEGMENTS.braces.length,
        ]}
        castShadow
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'spoutingColumnUnit'}
            original={PIPE_COLUMN_GEOMETRY}
            meshRef={verticalRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        ref={crossBeamRef}
        args={[
          PIPE_CROSS_BEAM_GEOMETRY,
          PIPE_MATERIALS.supportSlate,
          PIPE_SUPPORT_SEGMENTS.beams.length,
        ]}
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'spoutingCrossbeamUnit'}
            original={PIPE_CROSS_BEAM_GEOMETRY}
            meshRef={crossBeamRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
    </group>
  );
});
