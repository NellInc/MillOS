import { GeneratedBoundary } from './models/GeneratedModel';
import { GeneratedGeometrySurface } from './models/GeneratedGeometrySurface';
import React, { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyWorldSurface } from '../utils/worldSurface';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MachineData, MachineType } from '../types';
import { SITE_LAYOUT, MILL_PROCESS_PORTS, PROCESS_GALLERY_POST_X } from '../constants/siteLayout';
import { audioManager } from '../utils/audioManager';
import { useAudioInitialized } from '../hooks/useAudioState';
import { ORM_MEAN_ROUGHNESS, PIPE_MATERIALS } from '../utils/sharedMaterials';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { selectSafetyHoldActive, useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { generateProceduralNormal } from '../textures/normalGenerator';
import {
  buildSpoutRoutes,
  getSpoutRiserX,
  spoutMachineKey,
  SPOUT_PIPE_RADIUS,
  SPOUT_SERVICE_LAYOUT,
  type PipeRouteFamily,
} from './flow/spoutRoutes';

/** Spend sweep rings on elbows, leaving every straight run as one segment. */
class SpoutSweepCurve extends THREE.Curve<THREE.Vector3> {
  readonly stations: readonly number[];

  constructor(
    private readonly route: THREE.CurvePath<THREE.Vector3>,
    bendSegments: number
  ) {
    super();
    const lengths = route.getCurveLengths();
    const total = lengths[lengths.length - 1];
    const stations = [0];
    route.curves.forEach((curve, index) => {
      const start = index === 0 ? 0 : lengths[index - 1];
      const steps = curve instanceof THREE.LineCurve3 ? 1 : bendSegments;
      for (let step = 1; step <= steps; step++) {
        stations.push((start + ((lengths[index] - start) * step) / steps) / total);
      }
    });
    this.stations = stations;
  }

  private routeProgress(progress: number): number {
    const index = THREE.MathUtils.clamp(progress, 0, 1) * (this.stations.length - 1);
    const lower = Math.min(Math.floor(index), this.stations.length - 2);
    return THREE.MathUtils.lerp(this.stations[lower], this.stations[lower + 1], index - lower);
  }

  override getPoint(progress: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.route.getPointAt(this.routeProgress(progress), target);
  }

  override getPointAt(progress: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.getPoint(progress, target);
  }

  override getTangentAt(progress: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.route.getTangentAt(this.routeProgress(progress), target);
  }
}

/** Same bore as the grain-flow curve, with bounded close-up elbow resolution.
 * Working if the tube follows every route endpoint and curved branch while
 * long straight spans do not add hundreds of redundant sweep rings.
 */
export function createSpoutTubeGeometry(
  curve: THREE.CurvePath<THREE.Vector3>,
  radialSegments: number
): THREE.TubeGeometry {
  const sampling = new SpoutSweepCurve(curve, radialSegments >= 12 ? 6 : 4);
  return new THREE.TubeGeometry(
    sampling,
    sampling.stations.length - 1,
    SPOUT_PIPE_RADIUS,
    radialSegments,
    false
  );
}

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

  useLayoutEffect(() => {
    if (!ref.current) return;
    matrices.forEach((matrix, index) => ref.current?.setMatrixAt(index, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [matrices]);

  if (matrices.length === 0) return null;

  return (
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
    const positions: { id: string; x: number; y: number; z: number }[] = [];
    const silos = machines.filter((m) => m.type === MachineType.SILO);
    const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
    const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);

    // Add sound positions at key pipe junctions
    mills.forEach((mill, i) => {
      const silo = silos[i % silos.length];
      if (silo) {
        positions.push({
          id: `spout-silo-mill-${i}`,
          x: (silo.position[0] + mill.position[0]) / 2,
          y: 8,
          z: (silo.position[2] + mill.position[2]) / 2,
        });
      }
    });

    sifters.forEach((sifter, i) => {
      positions.push({
        id: `spout-sifter-${i}`,
        x: sifter.position[0],
        y: sifter.position[1],
        z: sifter.position[2],
      });
    });

    return positions;
  }, [machineKey]); // Use stable key instead of full machines array

  // Start spouting sounds once the audio context exists
  const audioReady = useAudioInitialized();
  useEffect(() => {
    if (!enableAudio || !audioReady || safetyHold) return;
    spoutPositions.forEach((pos) => {
      audioManager.startSpoutingSound(pos.id, pos.x, pos.y, pos.z);
    });

    return () => {
      spoutPositions.forEach((pos) => {
        audioManager.stopSpoutingSound(pos.id);
      });
    };
  }, [enableAudio, audioReady, safetyHold, spoutPositions]);

  // Update spatial audio volumes each frame
  useFrame(() => {
    if (!enableAudio || safetyHold) return;
    if (!isTabVisible) return;
    // Spatial volume is fine at ~30fps; throttle to reduce per-frame audio work
    if (!shouldRunThisFrame(2)) return;

    spoutPositions.forEach((pos) => {
      audioManager.updateSpoutingSpatialVolume(pos.id);
    });
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
    buildSpoutRoutes(machines).forEach(({ family, curve, length }) => {
      routeGeometries[family].push(createSpoutTubeGeometry(curve, radialSegments));

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

    return { routes, flangeMatrices };
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
  const intakeY = MILL_PROCESS_PORTS.intake[1] + SPOUT_SERVICE_LAYOUT.intakeRise;
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
