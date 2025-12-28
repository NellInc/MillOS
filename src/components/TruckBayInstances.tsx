import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { POLYGON_OFFSET } from '../constants/renderLayers';

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

// We need to fix the offset issue. The easiest way with standard geometries is to translate the geometry itself.
// However, in R3F/Three, modifying geometry affects all instances.
// So we should construct specific geometries that are pre-transformed (translated) to the correct relative position.

/** Geometry constructor type for Three.js geometries that accept numeric arguments */
type GeometryConstructor = new (...args: number[]) => THREE.BufferGeometry;

/** Geometry constructor arguments - varies by type (Box: [w,h,d], Cone: [r,h,seg], etc.) */
type GeometryArgs = readonly number[];

// Helper to create translated geometry
const useTranslatedGeometry = (
  GeometryClass: GeometryConstructor,
  args: GeometryArgs,
  translation: [number, number, number],
  rotation?: [number, number, number]
) => {
  return useMemo(() => {
    const geo = new GeometryClass(...args);
    if (rotation) geo.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]);
    geo.translate(...translation);
    return geo;
  }, [GeometryClass, args, translation, rotation]);
};

export const OptimizedTrafficConeInstances: React.FC<{
  positions: [number, number, number][];
}> = React.memo(({ positions }) => {
  const data = useMemo(() => positions.map((p) => ({ position: p })), [positions]);

  // Geometries with baked-in offsets to match original components
  const baseGeo = useTranslatedGeometry(THREE.BoxGeometry, [0.4, 0.04, 0.4], [0, 0.02, 0]);
  const bodyGeo = useTranslatedGeometry(THREE.ConeGeometry, [0.12, 0.45, 8], [0, 0.25, 0]);
  const stripe1Geo = useTranslatedGeometry(
    THREE.CylinderGeometry,
    [0.09, 0.11, 0.08, 8],
    [0, 0.2, 0]
  );
  const stripe2Geo = useTranslatedGeometry(
    THREE.CylinderGeometry,
    [0.06, 0.08, 0.06, 8],
    [0, 0.35, 0]
  );

  const baseRef = useInstances(data.length, data);
  const bodyRef = useInstances(data.length, data);
  const stripe1Ref = useInstances(data.length, data);
  const stripe2Ref = useInstances(data.length, data);

  return (
    <group>
      <instancedMesh ref={baseRef} args={[baseGeo, undefined, data.length]}>
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={bodyRef} args={[bodyGeo, undefined, data.length]}>
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={stripe1Ref} args={[stripe1Geo, undefined, data.length]}>
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={stripe2Ref} args={[stripe2Geo, undefined, data.length]}>
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.4} />
      </instancedMesh>
    </group>
  );
});

// --- Concrete Bollards ---
export const OptimizedBollardInstances: React.FC<{
  positions: [number, number, number][];
}> = React.memo(({ positions }) => {
  const data = useMemo(() => positions.map((p) => ({ position: p })), [positions]);

  // Original: Base cylinder at [0, 0.4, 0], Cap at [0, 0.82, 0]
  const baseGeo = useTranslatedGeometry(THREE.CylinderGeometry, [0.2, 0.25, 0.8, 12], [0, 0.4, 0]);
  const capGeo = useTranslatedGeometry(THREE.CylinderGeometry, [0.22, 0.2, 0.05, 12], [0, 0.82, 0]);

  const baseRef = useInstances(data.length, data);
  const capRef = useInstances(data.length, data);

  return (
    <group>
      <instancedMesh ref={baseRef} args={[baseGeo, undefined, data.length]}>
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[capGeo, undefined, data.length]}>
        <meshStandardMaterial color="#fbbf24" roughness={0.6} />
      </instancedMesh>
    </group>
  );
});

// --- Speed Bumps ---
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

  // Main bump body at [0, 0.06, 0]
  const bumpGeo = useTranslatedGeometry(THREE.BoxGeometry, [6, 0.12, 0.5], [0, 0.06, 0]);

  // Stripes - there are 6 stripes per bump.
  // Instancing the stripes is tricky because each bump has 6 stripes.
  // We can treat all stripes of all bumps as one massive instance cloud, OR we can make a geometry that includes all 6 stripes merged.
  // Merging geometries is better here.

  const stripeGeos = useMemo(() => {
    return [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((x) => {
      const g = new THREE.BoxGeometry(0.4, 0.02, 0.52);
      g.translate(x, 0.13, 0);
      return g;
    });
  }, []);

  const bumpRef = useInstances(data.length, data);

  // We need one ref per stripe position if we iterate in render
  // OR we can map over stripesGeo and render an InstancedMesh for each sub-part, reusing the matrix logic.
  // Custom hook reuse is fine.

  // React Reminder: Hooks must be top level.
  // Okay, let's just use a fixed array since we know it's always 6 stripes.

  const s0 = useInstances(data.length, data);
  const s1 = useInstances(data.length, data);
  const s2 = useInstances(data.length, data);
  const s3 = useInstances(data.length, data);
  const s4 = useInstances(data.length, data);
  const s5 = useInstances(data.length, data);
  const sRefs = [s0, s1, s2, s3, s4, s5];

  return (
    <group>
      <instancedMesh ref={bumpRef} args={[bumpGeo, undefined, data.length]}>
        <meshStandardMaterial color="#fbbf24" roughness={0.7} />
      </instancedMesh>

      {stripeGeos.map((geo, i) => (
        <instancedMesh key={i} ref={sRefs[i]} args={[geo, undefined, data.length]}>
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </instancedMesh>
      ))}
    </group>
  );
});

// --- Stripes (Road Markings) ---
export const OptimizedStripeInstances: React.FC<{
  positions: [number, number, number][];
  rotation?: [number, number, number];
  color?: string;
}> = React.memo(
  ({
    positions,
    rotation = [-Math.PI / 2, 0, 0] as [number, number, number],
    color = '#fef3c7',
  }) => {
    const data = useMemo(
      () =>
        positions.map((p) => ({
          position: p,
          rotation: rotation,
        })),
      [positions, rotation]
    );

    const geo = useTranslatedGeometry(THREE.PlaneGeometry, [0.15, 4], [0, 0, 0]);
    const ref = useInstances(data.length, data);

    return (
      <instancedMesh ref={ref} args={[geo, undefined, data.length]} renderOrder={10}>
        <meshBasicMaterial
          color={color}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.strong.factor}
          polygonOffsetUnits={POLYGON_OFFSET.strong.units}
          depthWrite={false}
        />
      </instancedMesh>
    );
  }
);
