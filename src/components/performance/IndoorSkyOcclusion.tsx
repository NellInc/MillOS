import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { INDOOR_SKY_DEFINE } from '../../shaders/interiorLighting';

/**
 * The switch for the indoor sky visibility experiment (D-063).
 *
 * The term lives in the global `lights_fragment_end` chunk
 * (`shaders/interiorLighting.ts` part 3) behind `MILLOS_INDOOR_SKY`. A chunk
 * edit cannot reach programs already compiled, and built-in materials upload
 * no uniform a chunk declares, so the switch has to enter through the program
 * cache key: `material.defines` is part of it for every material
 * (`WebGLPrograms.getProgramCacheKey`). Tagging a material recompiles it with
 * the term; untagging puts back the program it had.
 *
 * Re-swept by FRAME COUNT, not time: under `holdFrame` the clock is stopped
 * but `advance()` still runs this, and lazily mounted machines, vehicles and
 * workers bring their own materials long after the first sweep.
 */

const RESWEEP_FRAMES = 30;

interface Tagged {
  /** Whether the material had a `defines` object before it was tagged. */
  hadDefines: boolean;
}

const tagged = new Map<THREE.Material, Tagged>();

export interface IndoorSkyOcclusionReport {
  /** Materials currently compiled with the term. */
  tagged: number;
}

export function readIndoorSkyOcclusionReport(): IndoorSkyOcclusionReport {
  return { tagged: tagged.size };
}

/** Materials whose fragment shader assembles three's indirect light. */
function isLit(material: THREE.Material): boolean {
  const lit = material as THREE.Material & {
    isMeshStandardMaterial?: boolean;
    isMeshLambertMaterial?: boolean;
    isMeshPhongMaterial?: boolean;
    isMeshToonMaterial?: boolean;
    isShaderMaterial?: boolean;
    lights?: boolean;
  };
  return Boolean(
    lit.isMeshStandardMaterial ||
    lit.isMeshLambertMaterial ||
    lit.isMeshPhongMaterial ||
    lit.isMeshToonMaterial ||
    (lit.isShaderMaterial && lit.lights)
  );
}

function tag(material: THREE.Material): void {
  if (tagged.has(material) || !isLit(material)) return;
  const withDefines = material as THREE.Material & { defines?: Record<string, unknown> };
  tagged.set(material, { hadDefines: withDefines.defines !== undefined });
  withDefines.defines = withDefines.defines ?? {};
  withDefines.defines[INDOOR_SKY_DEFINE] = '';
  material.needsUpdate = true;
}

function visit(object: THREE.Object3D): void {
  const material = (object as THREE.Mesh).material;
  if (!material) return;
  if (Array.isArray(material)) material.forEach(tag);
  else tag(material);
}

export function sweepIndoorSkyOcclusion(root: THREE.Object3D): number {
  const before = tagged.size;
  root.traverse(visit);
  return tagged.size - before;
}

export function releaseIndoorSkyOcclusion(): void {
  tagged.forEach(({ hadDefines }, material) => {
    const withDefines = material as THREE.Material & { defines?: Record<string, unknown> };
    if (withDefines.defines) delete withDefines.defines[INDOOR_SKY_DEFINE];
    if (!hadDefines) withDefines.defines = undefined;
    material.needsUpdate = true;
  });
  tagged.clear();
}

export function IndoorSkyOcclusion() {
  const scene = useThree((state) => state.scene);
  const enabled = useGraphicsStore((state) => state.graphics.perfDebug.enableIndoorSkyOcclusion);
  const framesUntilSweep = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    sweepIndoorSkyOcclusion(scene);
    framesUntilSweep.current = RESWEEP_FRAMES;
    return releaseIndoorSkyOcclusion;
  }, [enabled, scene]);

  useFrame(() => {
    if (!enabled) return;
    framesUntilSweep.current -= 1;
    if (framesUntilSweep.current > 0) return;
    framesUntilSweep.current = RESWEEP_FRAMES;
    sweepIndoorSkyOcclusion(scene);
  });

  return null;
}

export default IndoorSkyOcclusion;
