/**
 * DataFlowLine Component
 *
 * Animated data flow lines between connected machines.
 * Shows material/data flow with animated dashed lines.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../utils/digitalTwinPalette';
import { useProductionStore } from '../stores/productionStore';
import { selectSafetyHoldActive, useGameSimulationStore } from '../stores/gameSimulationStore';
import { clampFrameDelta, lineMotionRate } from '../simulation/lineFlow';
import { createSpoutTubeGeometry, SPOUT_PIPE_RADIUS } from './flow/spoutRoutes';

interface DataFlowLineProps {
  start: [number, number, number];
  end: [number, number, number];
  /** Optional physical spouting path; legacy point-to-point callers retain their arc. */
  path?: THREE.CurvePath<THREE.Vector3>;
  /** Whether flow is active */
  active?: boolean;
  /** Custom flow color */
  color?: string;
  /** Number of dashes in the line */
  segments?: number;
}

/** Tube radius in world units. A `THREE.Line` was one DEVICE pixel wide at any
 *  distance, so at the 0.5-0.65 resolution scale these tiers render at it
 *  upscaled into a crawling two-pixel stipple. */
export const FLOW_TUBE_RADIUS = 0.035;
const FLOW_TUBE_RADIAL_SEGMENTS = 6;
export const FLOW_DASH_PERIOD_METRES = 3.5;
export const PROCESS_FLOW_SLEEVE_RADIUS = SPOUT_PIPE_RADIUS + 0.012;

/**
 * Create the data flow line shader material
 */
export const createDataFlowMaterial = (color: string, active: boolean): THREE.ShaderMaterial => {
  const material = new THREE.ShaderMaterial({
    name: 'MillOS Data Flow Line',
    uniforms: {
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
      flowActive: { value: active ? 1.0 : 0.3 },
      flowCycles: { value: 1 },
    },
    vertexShader: `
      varying vec2 vFlowUv;
      varying vec3 vFlowNormal;
      varying vec3 vFlowView;

      void main() {
        // TubeGeometry's uv.x runs ALONG the tube, so it replaces the custom
        // lineProgress attribute the old THREE.Line needed.
        vFlowUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFlowNormal = normalize(normalMatrix * normal);
        vFlowView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float flowActive;
      uniform float flowCycles;

      varying vec2 vFlowUv;
      varying vec3 vFlowNormal;
      varying vec3 vFlowView;

      void main() {
        float phase = fract(vFlowUv.x * flowCycles - time);
        // DATA_FLOW_PULSE. Phase rises downstream, so 0.84 is the dash's head.
        // A flat-topped band with two equal 0.06 edges read as a painted
        // stripe in any frozen frame; a hard head over a long fading tail reads
        // as product travelling, and keeps the old band's mean weight. Both
        // edges stay smoothed: a hard step shimmered below resolution scale 1.
        float dash = smoothstep(0.5, 0.82, phase) * (1.0 - smoothstep(0.82, 0.86, phase));

        // View-facing rim so the tube reads as a glowing filament rather than
        // a grey noodle.
        float rim = pow(1.0 - abs(dot(normalize(vFlowNormal), normalize(vFlowView))), 2.0);

        float alpha = dash * flowActive * 0.32 * (0.35 + 0.65 * rim);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    // Additive so the lines read as a data overlay rather than as geometry.
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    depthWrite: false,
  });
  // FIXED literal, never a timestamp (CLAUDE.md, shader cache key bug).
  material.customProgramCacheKey = () => 'millos-data-flow-line-v5';
  return material;
};

/**
 * Keep a paused or blocked connection legible without implying product
 * movement. `clock` is the line's own dash clock (`advanceDataFlowClock`), which
 * does not advance while the connection is stopped, so the dashes dim in place.
 */
export function updateDataFlowUniforms(
  material: THREE.ShaderMaterial,
  active: boolean,
  clock: number
): void {
  material.uniforms.time.value = clock;
  material.uniforms.flowActive.value = active ? 1 : 0.3;
}

/**
 * The dash clock, in plant seconds, advanced EVERY FRAME.
 *
 * It used to be `materialFlowStore.simulationTime`, which only moves on the
 * 0.5 s central tick: at standard pace 0.4 plant seconds, a 1.4 m jump of a
 * 0.7 m dash twice a second and nothing in between. Frames 100 ms apart showed
 * identical bands, so the flow read as stripes in motion, not only in stills.
 * `rate` is `lineMotionRate`, the same pace the grain in these pipes moves at:
 * zero while the clock or a safety hold stops the plant.
 */
export function advanceDataFlowClock(
  clock: number,
  frameDelta: number,
  active: boolean,
  rate: number
): number {
  if (!active || !(rate > 0)) return clock;
  return clock + clampFrameDelta(frameDelta) * rate;
}

/** Working if signals fit the real bore and retain metre-spaced dashes at elbows. */
export function createDataFlowGeometry(
  start: [number, number, number],
  end: [number, number, number],
  segments: number,
  path?: THREE.CurvePath<THREE.Vector3>
): THREE.TubeGeometry {
  if (!path) {
    const from = new THREE.Vector3(...start),
      to = new THREE.Vector3(...end);
    const middle = from.clone().add(to).multiplyScalar(0.5);
    middle.y += from.distanceTo(to) * 0.15;
    return new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(from, middle, to),
      segments,
      FLOW_TUBE_RADIUS,
      FLOW_TUBE_RADIAL_SEGMENTS,
      false
    );
  }
  // Use the exact physical sweep stations. Its bounded elbow tessellation
  // avoids adding redundant rings along long straight service runs.
  const geometry = createSpoutTubeGeometry(path, 12, PROCESS_FLOW_SLEEVE_RADIUS);
  const { tubularSegments, radialSegments, path: sampling } = geometry.parameters;
  const lengths = new Float64Array(tubularSegments + 1);
  const previous = sampling.getPointAt(0),
    current = new THREE.Vector3();
  for (let ring = 1; ring <= tubularSegments; ring++) {
    sampling.getPointAt(ring / tubularSegments, current);
    lengths[ring] = lengths[ring - 1] + previous.distanceTo(current);
    previous.copy(current);
  }
  // TubeGeometry's default UV spreads an equal phase over every sweep ring,
  // making dashes slow and bunch at elbows. Restore distance-based phase.
  const uv = geometry.getAttribute('uv');
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const progress = lengths[ring] / lengths[tubularSegments];
    for (let segment = 0; segment <= radialSegments; segment++)
      uv.setX(ring * (radialSegments + 1) + segment, progress);
  }
  return geometry;
}

export const DataFlowLine: React.FC<DataFlowLineProps> = ({
  start,
  end,
  active = true,
  color = PALETTE.data.primary,
  segments = 32,
  path,
}) => {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Keyed on colour only. `active` is written to the uniforms every frame by
  // updateDataFlowUniforms, so a status flip must not rebuild the program.
  const material = useMemo(() => {
    const mat = createDataFlowMaterial(color, true);
    materialRef.current = mat;
    return mat;
  }, [color]);

  // Keyed on the endpoint SCALARS, not the tuples: callers derive fresh arrays
  // from the machine list on every simulation tick, and identity keys rebuilt
  // every tube (geometry, mesh and GPU upload) twice a second.
  const [startX, startY, startZ] = start;
  const [endX, endY, endZ] = end;

  const geometry = useMemo(
    () => createDataFlowGeometry([startX, startY, startZ], [endX, endY, endZ], segments, path),
    [startX, startY, startZ, endX, endY, endZ, segments, path]
  );

  // Stable Mesh identity + disposal. Building the object inline in the JSX
  // allocated a fresh one every render (forcing R3F to detach and reattach it),
  // and superseded geometries/materials were never disposed - a GPU leak that
  // grew with every color/active/endpoint change.
  const mesh = useMemo(() => new THREE.Mesh(geometry, material), [geometry, material]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    // Fixed physical dash length on short and long links alike.
    material.uniforms.flowCycles.value = Math.max(
      1,
      geometry.parameters.path.getLength() / FLOW_DASH_PERIOD_METRES
    );
  }, [geometry, material]);

  // Animate the dash clock per frame, at the plant's pace (see advanceDataFlowClock).
  const clockRef = useRef(0);
  useFrame((_state, delta) => {
    if (!materialRef.current?.uniforms) return;
    const { gameSpeed } = useGameSimulationStore.getState();
    const rate = lineMotionRate(
      useProductionStore.getState().productionSpeed,
      gameSpeed,
      selectSafetyHoldActive(useGameSimulationStore.getState())
    );
    clockRef.current = advanceDataFlowClock(clockRef.current, delta, active, rate);
    updateDataFlowUniforms(materialRef.current, active, clockRef.current);
  });

  // Use primitive element for the pre-built Three.js Mesh
  return <primitive object={mesh} />;
};

/**
 * Memoized version for lists
 */
export const MemoizedDataFlowLine = React.memo(DataFlowLine);
