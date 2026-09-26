import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POLYGON_OFFSET } from '../constants/renderLayers';

/**
 * ONE DRAW CALL PER YARD PROP, NOT ONE PER PART.
 *
 * These helpers existed to instance repeated yard furniture, but each authored
 * part kept its own `InstancedMesh`: a traffic cone cost four draw calls to draw
 * four cones, and a speed bump cost SEVEN (one body plus one per painted
 * stripe) to draw two. Instancing four objects across four batches is strictly
 * worse than merging them, and `StaticMeshBatch` cannot rescue it because it
 * skips `InstancedMesh` outright (`inspectStaticBatchObject`, reason
 * `'instanced'`). Across the two yards and the two docks that was 34 draw calls
 * for 8 cones, 16 bollards, 4 speed bumps and 20 stripes.
 *
 * Each prop is now ONE pre-merged, vertex-coloured geometry drawn by a single
 * `InstancedMesh`. Per-part colour survives exactly - `THREE.Color` applies the
 * same sRGB decode that `material.color.set()` does, so the linear values
 * written into the `color` attribute are the ones the old per-part materials
 * produced. This is the same technique `StaticMeshBatch.createMergedGeometry`
 * uses for the rest of the site.
 *
 * WHAT THIS TRADES: the parts of one prop now share a single roughness /
 * metalness instead of one per part, because a merged geometry has one
 * material. The unified values are chosen close to the area-dominant part and
 * the deltas land on features 0.02-0.05 m across (a cone's reflective band, a
 * bollard's cap, a speed bump's stripes). Colour, geometry and position are
 * untouched.
 */
interface MergedPart {
  readonly geometry: THREE.BufferGeometry;
  readonly colour: string;
}

const _partColour = new THREE.Color();

/**
 * Merge authored parts into one geometry, baking each part's colour into a
 * vertex-colour attribute. Returns null when the parts cannot be merged, in
 * which case the caller must not build an `InstancedMesh` from it.
 */
const mergeColouredParts = (parts: readonly MergedPart[]): THREE.BufferGeometry | null => {
  const prepared: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    const position = geometry.getAttribute('position');
    if (!position) {
      geometry.dispose();
      prepared.forEach((entry) => entry.dispose());
      return null;
    }
    _partColour.set(part.colour);
    const colours = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      colours[offset] = _partColour.r;
      colours[offset + 1] = _partColour.g;
      colours[offset + 2] = _partColour.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    prepared.push(geometry);
  }
  const merged = mergeGeometries(prepared, false) ?? null;
  prepared.forEach((entry) => entry.dispose());
  parts.forEach((part) => part.geometry.dispose());
  merged?.computeBoundingBox();
  merged?.computeBoundingSphere();
  return merged;
};

const translatedGeometry = (
  geometry: THREE.BufferGeometry,
  translation: readonly [number, number, number]
): THREE.BufferGeometry => geometry.translate(translation[0], translation[1], translation[2]);

// Helper to update instance matrices
const useInstances = (
  _count: number,
  data: { position: [number, number, number]; rotation?: [number, number, number] }[]
) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (meshRef.current) {
      data.forEach((item, i) => {
        tempObject.position.set(...item.position);
        if (item.rotation) {
          tempObject.rotation.set(...item.rotation);
        } else {
          tempObject.rotation.set(0, 0, 0);
        }
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(i, tempObject.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [data, tempObject]);

  return meshRef;
};

// --- Traffic Cones ---
export const TrafficConeInstances: React.FC<{
  frames: { position: [number, number, number] }[];
}> = React.memo(({ frames }) => {
  const baseRef = useInstances(frames.length, frames);
  const bodyRef = useInstances(frames.length, frames);
  const stripe1Ref = useInstances(frames.length, frames);
  const stripe2Ref = useInstances(frames.length, frames);

  return (
    <group>
      {/* Base */}
      <instancedMesh ref={baseRef} args={[undefined, undefined, frames.length]}>
        <boxGeometry args={[0.4, 0.04, 0.4]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
        <group position={[0, 0.02, 0]} />
      </instancedMesh>
      {/* Cone Body */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, frames.length]}>
        <coneGeometry args={[0.12, 0.45, 8]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
        {/* Helper to offset geometry relative to instance origin if needed, 
            but here we can just offset the instance or the geometry. 
            Since we share position, better to offset geometry or use nested group logic which instancing doesn't support easily without manual matrix offset.
            Actually, the original TrafficCone has children at different relative positions.
            We need to apply that offset to the position we pass to useInstances OR translate geometry.
        */}
      </instancedMesh>
      {/* Stripe 1 */}
      <instancedMesh ref={stripe1Ref} args={[undefined, undefined, frames.length]}>
        <cylinderGeometry args={[0.09, 0.11, 0.08, 8]} />
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.4} />
      </instancedMesh>
      {/* Stripe 2 */}
      <instancedMesh ref={stripe2Ref} args={[undefined, undefined, frames.length]}>
        <cylinderGeometry args={[0.06, 0.08, 0.06, 8]} />
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.4} />
      </instancedMesh>
    </group>
  );
});

/**
 * Build a merged prop geometry once and dispose it when the caller unmounts.
 *
 * The builder is called at most once per mount; `useMemo` is a cache, not a
 * guarantee, so disposal is driven from the effect that owns the value.
 */
const useMergedPropGeometry = (
  build: () => THREE.BufferGeometry | null
): THREE.BufferGeometry | null => {
  // The builder closes over nothing but module constants, so rebuilding it on
  // every render would be pure waste; the geometry is intentionally built once.
  const geometry = useMemo(() => build(), [build]);
  useLayoutEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
};

/** Cone: 0.04 m base plate, 0.45 m body, two reflective bands. */
const buildTrafficConeGeometry = (): THREE.BufferGeometry | null =>
  mergeColouredParts([
    {
      geometry: translatedGeometry(new THREE.BoxGeometry(0.4, 0.04, 0.4), [0, 0.02, 0]),
      colour: '#1f2937',
    },
    {
      geometry: translatedGeometry(new THREE.ConeGeometry(0.12, 0.45, 8), [0, 0.25, 0]),
      colour: '#f97316',
    },
    {
      geometry: translatedGeometry(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 8), [0, 0.2, 0]),
      colour: '#ffffff',
    },
    {
      geometry: translatedGeometry(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 8), [0, 0.35, 0]),
      colour: '#ffffff',
    },
  ]);

export const OptimizedTrafficConeInstances: React.FC<{
  positions: [number, number, number][];
}> = React.memo(({ positions }) => {
  const data = useMemo(() => positions.map((p) => ({ position: p })), [positions]);
  const geometry = useMergedPropGeometry(buildTrafficConeGeometry);
  const coneRef = useInstances(data.length, data);

  if (!geometry) return null;
  return (
    <instancedMesh ref={coneRef} args={[geometry, undefined, data.length]}>
      {/* 0.65 sits between the moulded body (0.6) and the rubber base (0.8);
          the reflective bands lose their 0.3 metalness, which on a 0.06 m
          collar under a 0.30 environment intensity is not a visible term. */}
      <meshStandardMaterial vertexColors roughness={0.65} metalness={0} />
    </instancedMesh>
  );
});

// --- Concrete Bollards ---
/** Bollard: 0.8 m concrete post with a 0.05 m painted cap. */
const buildBollardGeometry = (): THREE.BufferGeometry | null =>
  mergeColouredParts([
    {
      geometry: translatedGeometry(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 12), [0, 0.4, 0]),
      colour: '#6b7280',
    },
    {
      geometry: translatedGeometry(new THREE.CylinderGeometry(0.22, 0.2, 0.05, 12), [0, 0.82, 0]),
      colour: '#fbbf24',
    },
  ]);

export const OptimizedBollardInstances: React.FC<{
  positions: [number, number, number][];
}> = React.memo(({ positions }) => {
  const data = useMemo(() => positions.map((p) => ({ position: p })), [positions]);
  const geometry = useMergedPropGeometry(buildBollardGeometry);
  const bollardRef = useInstances(data.length, data);

  if (!geometry) return null;
  return (
    <instancedMesh ref={bollardRef} args={[geometry, undefined, data.length]}>
      {/* Concrete dominates the surface area, so the post keeps its value and
          the 0.05 m cap moves from 0.6 to 0.85. */}
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0} />
    </instancedMesh>
  );
});

// --- Speed Bumps ---
/** Speed bump: 6 m painted body with six 0.4 m dark stripes. */
const SPEED_BUMP_STRIPE_OFFSETS = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5] as const;

const buildSpeedBumpGeometry = (): THREE.BufferGeometry | null =>
  mergeColouredParts([
    {
      geometry: translatedGeometry(new THREE.BoxGeometry(6, 0.12, 0.5), [0, 0.06, 0]),
      colour: '#fbbf24',
    },
    ...SPEED_BUMP_STRIPE_OFFSETS.map((x) => ({
      geometry: translatedGeometry(new THREE.BoxGeometry(0.4, 0.02, 0.52), [x, 0.13, 0]),
      colour: '#1f2937',
    })),
  ]);

export const OptimizedSpeedBumpInstances: React.FC<{
  bumps: { position: [number, number, number]; rotation?: number }[];
}> = React.memo(({ bumps }) => {
  const data = useMemo(
    () =>
      bumps.map((b) => ({
        position: b.position,
        rotation: [0, b.rotation || 0, 0] as [number, number, number],
      })),
    [bumps]
  );
  const geometry = useMergedPropGeometry(buildSpeedBumpGeometry);
  const bumpRef = useInstances(data.length, data);

  if (!geometry) return null;
  return (
    <instancedMesh ref={bumpRef} args={[geometry, undefined, data.length]}>
      {/* Body 0.7, stripes 0.8 - both land on 0.75. */}
      <meshStandardMaterial vertexColors roughness={0.75} metalness={0} />
    </instancedMesh>
  );
});

// --- Stripes (Road Markings) ---
// Module-level and never disposed: one stripe plane shared by every instance.
// Built per render (fresh array literals defeated the memo) it rebuilt the
// InstancedMesh on each TruckBay render and leaked the old geometry.
const STRIPE_GEOMETRY = new THREE.PlaneGeometry(0.15, 4);
const STRIPE_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

export const OptimizedStripeInstances: React.FC<{
  positions: [number, number, number][];
  rotation?: [number, number, number];
  color?: string;
}> = React.memo(({ positions, rotation = STRIPE_ROTATION, color = '#fef3c7' }) => {
  const data = useMemo(
    () =>
      positions.map((p) => ({
        position: p,
        rotation: rotation,
      })),
    [positions, rotation]
  );

  const ref = useInstances(data.length, data);

  return (
    <instancedMesh ref={ref} args={[STRIPE_GEOMETRY, undefined, data.length]} renderOrder={10}>
      <meshStandardMaterial
        color={color}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.strong.factor}
        polygonOffsetUnits={POLYGON_OFFSET.strong.units}
        depthWrite={false}
        roughness={0.85}
      />
    </instancedMesh>
  );
});
