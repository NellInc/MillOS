import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CIVIC_LAMPS,
  CIVIC_WORLD_LIGHTS,
  CIVIC_LIGHT_COLOR,
  CIVIC_SHADOW_ATLAS_SIZE,
  CIVIC_SHADOW_FACE_SIZE,
  CIVIC_SHADOW_BAKE_READY,
  CIVIC_SHADOW_ASSET_VERSION,
  CIVIC_CUBE_FACE_BASES,
  CIVIC_SHADOW_CONVENTION,
  CIVIC_SOURCE_LOOKUP,
} from '../../constants/civicSquareLighting';
import { EXTERIOR_LAMP_LENS_MATERIAL, ExteriorPointLight } from '../exterior/ExteriorLighting';
import {
  applyCivicLampShadows,
  CIVIC_SHADOW_ATLAS,
  CIVIC_SHADOW_STRENGTH,
  validateCivicShadowBake,
} from '../../shaders/civicLampShadows';
import { getRuntimeMode } from '../../runtime/runtimeMode';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { isWindDeformedMaterial } from './WindDriver';
import { SKY_AFTERGLOW_STRENGTH } from '../environment/OptimizedSkySystem';

const lampGains = new Map(CIVIC_LAMPS.map((lamp) => [lamp.id, { value: 1 }]));
const fittings: THREE.BufferGeometry[] = [];
const lenses: THREE.BufferGeometry[] = [];
for (const lamp of CIVIC_LAMPS) {
  const [x, y, z] = lamp.position;
  if (lamp.kind === 'garden') {
    // A low bronze uplighter, with its glass aperture above the metal cup.
    // No opaque roof masks the upward rays intended to illuminate planting.
    fittings.push(new THREE.CylinderGeometry(0.115, 0.14, 0.08, 12).translate(x, 0.04, z));
    fittings.push(new THREE.CylinderGeometry(0.045, 0.055, 0.3, 10).translate(x, 0.21, z));
    fittings.push(new THREE.CylinderGeometry(0.15, 0.12, 0.05, 12).translate(x, y - 0.13, z));
    lenses.push(new THREE.SphereGeometry(0.105, 12, 8).translate(x, y, z));
  } else if (lamp.id === 'shed-wall') {
    fittings.push(new THREE.BoxGeometry(0.12, 0.28, 0.05).translate(x, y, z - 0.12));
    fittings.push(new THREE.BoxGeometry(0.3, 0.035, 0.3).translate(x, y - 0.15, z));
    fittings.push(
      new THREE.ConeGeometry(0.25, 0.12, 4).rotateY(Math.PI / 4).translate(x, y + 0.21, z)
    );
    lenses.push(new THREE.BoxGeometry(0.21, 0.26, 0.21).translate(x, y, z));
  } else if (lamp.kind === 'sign') {
    fittings.push(
      new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8).rotateZ(Math.PI / 2).translate(x, y + 0.075, z)
    );
    lenses.push(new THREE.BoxGeometry(3.3, 0.025, 0.045).translate(x, y, z));
  }
}
export const CIVIC_FITTING_GEOMETRY = mergeGeometries(fittings)!;
export const CIVIC_LENS_GEOMETRY = mergeGeometries(lenses)!;
[...fittings, ...lenses].forEach((g) => g.dispose());
const metal = new THREE.MeshStandardMaterial({ color: '#35443c', roughness: 0.6, metalness: 0.45 });

/** Export rigid actual triangles only; alpha/windy crowns and people stay live. */
export function exportCivicOccluders(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const vertices: number[] = [];
  const triangles: number[] = [];
  const objects: { name: string; vertices: number; instances: number }[] = [];
  const exclusions: Record<string, number> = {};
  const vertex = new THREE.Vector3();
  const instance = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  const region = new THREE.Box3();
  for (const source of CIVIC_WORLD_LIGHTS) {
    const centre = new THREE.Vector3(...source.position);
    region.union(
      new THREE.Box3().setFromCenterAndSize(
        centre,
        new THREE.Vector3(1, 1, 1).multiplyScalar(source.distance * 2)
      )
    );
  }
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow) return;
    let ancestor: THREE.Object3D | null = object;
    while (ancestor) {
      if (
        !ancestor.visible ||
        ancestor.userData.dynamic ||
        /worker|personnel|forklift|truck|bird|clock-hand/i.test(ancestor.name)
      )
        return;
      ancestor = ancestor.parent;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (
      mesh instanceof THREE.SkinnedMesh ||
      materials.some(
        (m) => m.transparent || m.alphaTest > 0 || m.opacity < 0.99 || isWindDeformedMaterial(m)
      )
    ) {
      exclusions.alphaOrMoving = (exclusions.alphaOrMoving ?? 0) + 1;
      return;
    }
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    mesh.geometry.computeBoundingBox();
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    let included = 0;
    for (let n = 0; n < instances; n++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh instanceof THREE.InstancedMesh) {
        mesh.getMatrixAt(n, instance);
        matrix.multiply(instance);
      }
      box.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix);
      if (!box.intersectsBox(region)) continue;
      const start = vertices.length / 3;
      for (let v = 0; v < position.count; v++) {
        vertex.fromBufferAttribute(position, v).applyMatrix4(matrix);
        vertices.push(vertex.x, vertex.y, vertex.z);
      }
      const index = mesh.geometry.getIndex();
      const count = index?.count ?? position.count;
      const first = mesh.geometry.drawRange.start;
      const last = Math.min(count, first + mesh.geometry.drawRange.count);
      for (let i = first; i + 2 < last; i += 3) {
        triangles.push(
          start + (index ? index.getX(i) : i),
          start + (index ? index.getX(i + 1) : i + 1),
          start + (index ? index.getX(i + 2) : i + 2)
        );
      }
      included++;
    }
    if (included) objects.push({ name: mesh.name, vertices: position.count, instances: included });
  });
  return {
    convention: CIVIC_SHADOW_CONVENTION,
    faceBases: CIVIC_CUBE_FACE_BASES,
    sourceLookup: CIVIC_SOURCE_LOOKUP,
    faceSize: CIVIC_SHADOW_FACE_SIZE,
    atlasSize: CIVIC_SHADOW_ATLAS_SIZE,
    sources: CIVIC_WORLD_LIGHTS,
    vertices,
    triangles,
    objects,
    exclusions,
    dynamicLocalShadows: false,
  };
}

/** Working if every manifest origin matches the actual mounted light within 1 mm. */
export function civicRuntimeSources(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  return CIVIC_WORLD_LIGHTS.map((expected) => {
    const source = scene.getObjectByName(`civic-lamp:${expected.id}`);
    if (!(source instanceof THREE.PointLight))
      throw new Error(`Missing civic source: ${expected.id}`);
    const position = source.getWorldPosition(new THREE.Vector3()).toArray();
    if (position.some((v, k) => Math.abs(v - expected.position[k]) > 0.001))
      throw new Error(`Moved civic source: ${expected.id}`);
    return { ...expected, position, actualIntensity: source.intensity };
  });
}

/** Benchmark-only interrogation of the actual linked programs, not a texture estimate. */
function civicGpuCapacity(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext();
  const samplerTypes: number[] = [context.SAMPLER_2D, context.SAMPLER_CUBE];
  if ('SAMPLER_3D' in context)
    samplerTypes.push(
      context.SAMPLER_3D,
      context.SAMPLER_2D_SHADOW,
      context.SAMPLER_2D_ARRAY,
      context.SAMPLER_CUBE_SHADOW,
      context.SAMPLER_2D_ARRAY_SHADOW,
      context.INT_SAMPLER_2D,
      context.UNSIGNED_INT_SAMPLER_2D
    );
  let largestProgramSamplers = 0,
    unlinkedPrograms = 0;
  for (const program of renderer.info.programs ?? []) {
    if (!context.getProgramParameter(program.program, context.LINK_STATUS)) unlinkedPrograms++;
    let samplers = 0;
    const count = context.getProgramParameter(program.program, context.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index++) {
      const uniform = context.getActiveUniform(program.program, index);
      if (uniform && samplerTypes.includes(uniform.type)) samplers += uniform.size;
    }
    largestProgramSamplers = Math.max(largestProgramSamplers, samplers);
  }
  return {
    maxTextureSize: renderer.capabilities.maxTextureSize,
    maxFragmentSamplers: renderer.capabilities.maxTextures,
    largestProgramSamplers,
    unlinkedPrograms,
  };
}

type CivicInstrument = {
  exportGeometry: () => ReturnType<typeof exportCivicOccluders>;
  setShadowStrength: (value: number) => void;
  setSkyAfterglowStrength: (value: number) => void;
  setLampGain: (id: string | null, value: number) => void;
  sources: () => ReturnType<typeof civicRuntimeSources>;
  status: () => { atlas: boolean; sources: number; materials: number } & ReturnType<
    typeof civicGpuCapacity
  >;
};
declare global {
  interface Window {
    __MILLOS_CIVIC_LIGHTING__?: CivicInstrument;
  }
}

function CivicShadowAssembly({ texture }: { texture: THREE.Texture | null }) {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.gl);
  const installed = useMemo(() => new Set<THREE.Material>(), []);
  useLayoutEffect(() => {
    CIVIC_SHADOW_ATLAS.value = texture;
  }, [texture]);
  const attach = React.useCallback(() => {
    if (!texture) return;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        applyCivicLampShadows(material);
        if (material instanceof THREE.MeshStandardMaterial) installed.add(material);
      }
    });
  }, [scene, texture, installed]);
  useLayoutEffect(attach, [attach]);
  let frames = 0;
  useFrame(() => {
    // Newly streamed or rebatch-cloned materials need the same composed hook.
    // No graph walk per draw/frame; sweep every 30 rendered frames.
    if (++frames % 30 === 0) attach();
  });
  useEffect(() => {
    if (!getRuntimeMode().benchmark) return;
    const instrument: CivicInstrument = {
      exportGeometry: () => ({
        ...exportCivicOccluders(scene),
        sources: civicRuntimeSources(scene),
      }),
      sources: () => civicRuntimeSources(scene),
      setLampGain: (id, value) => {
        if (!Number.isFinite(value)) throw new Error('Invalid civic isolation gain');
        if (id !== null && !lampGains.has(id)) throw new Error('Unknown civic isolation source');
        for (const [key, gain] of lampGains) {
          if (id === null || key === id) gain.value = THREE.MathUtils.clamp(value, 0, 1);
        }
      },
      setSkyAfterglowStrength: (value) => {
        if (!Number.isFinite(value)) throw new Error('Invalid sky isolation strength');
        SKY_AFTERGLOW_STRENGTH.value = THREE.MathUtils.clamp(value, 0, 1);
      },
      setShadowStrength: (value) => {
        CIVIC_SHADOW_STRENGTH.value = THREE.MathUtils.clamp(value, 0, 1);
      },
      status: () => ({
        atlas: Boolean(CIVIC_SHADOW_ATLAS.value),
        sources: CIVIC_WORLD_LIGHTS.length,
        materials: installed.size,
        ...civicGpuCapacity(renderer),
      }),
    };
    window.__MILLOS_CIVIC_LIGHTING__ = instrument;
    return () => {
      if (window.__MILLOS_CIVIC_LIGHTING__ === instrument) delete window.__MILLOS_CIVIC_LIGHTING__;
      for (const gain of lampGains.values()) gain.value = 1;
      SKY_AFTERGLOW_STRENGTH.value = 1;
    };
  }, [scene, installed, renderer]);
  return null;
}

function LoadedCivicShadows() {
  const texture = useLoader(
    THREE.TextureLoader,
    `${import.meta.env.BASE_URL}textures/civic-square-lamp-depth.png?v=${CIVIC_SHADOW_ASSET_VERSION}`
  );
  const metadata = useLoader(
    THREE.FileLoader,
    `${import.meta.env.BASE_URL}textures/civic-square-lamp-depth.json?v=${CIVIC_SHADOW_ASSET_VERSION}`
  );
  useMemo(() => validateCivicShadowBake(JSON.parse(String(metadata))), [metadata]);
  useMemo(() => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
  }, [texture]);
  return <CivicShadowAssembly texture={texture} />;
}

export function CivicSquareLighting() {
  const disabled = useGraphicsStore((s) => s.graphics.perfDebug.disableLightingPolish);
  // Export/pending stages carry no substitute atlas. Once the real bake is
  // retained, ordinary builds load it through the asset/readiness boundary.
  const exporting = import.meta.env.VITE_CIVIC_BAKE_EXPORT === '1';
  return (
    <group name="civic-square-concept-lighting">
      <mesh geometry={CIVIC_FITTING_GEOMETRY} material={metal} castShadow receiveShadow />
      <mesh geometry={CIVIC_LENS_GEOMETRY} material={EXTERIOR_LAMP_LENS_MATERIAL} />
      {CIVIC_LAMPS.map((lamp) => (
        <ExteriorPointLight
          key={lamp.id}
          name={`civic-lamp:${lamp.id}`}
          gain={lampGains.get(lamp.id)}
          position={lamp.position}
          intensity={disabled ? 0 : lamp.intensity}
          distance={lamp.distance}
          color={CIVIC_LIGHT_COLOR}
        />
      ))}
      {exporting || !CIVIC_SHADOW_BAKE_READY ? (
        <CivicShadowAssembly texture={null} />
      ) : (
        <LoadedCivicShadows />
      )}
    </group>
  );
}
