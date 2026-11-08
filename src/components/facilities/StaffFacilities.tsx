import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { resolveFactoryInteriorDetailVisibility } from '../performance/distantFactoryInteriorLod';
import { SceneText } from '../shared/SceneText';
import {
  FACILITY_SIGNS,
  FACILITY_SIGN_FACE_Z,
  getFacilityGeometry,
  type FacilityLayer,
  type FacilityMaterialKey,
} from './facilityGeometry';
import { getFacilityAtlas, getFacilityFinish, getFacilityRug } from './facilityTextures';

/**
 * The staff facilities: the welfare block (toilets, accessible WC, lockers and
 * the staff room) and the office block (mill manager, meeting room, first aid),
 * standing on the hall floor south of the packing cell. Layout and access are
 * in `facilityLayout.ts`; the parts are built and merged in
 * `facilityGeometry.ts`.
 *
 * Draws: one merged mesh per layer and material, a few dozen in all, plus six
 * painted sign boards. Every surface that is paint, tile, timber or print is a
 * lit `MeshStandardMaterial`; only what emits light (lamp faces, the screens)
 * is unlit. No light source is added: the hall's own rows light the rooms, the
 * warm lamp faces are emissive, and the rooms' own lamplight reaches their
 * surfaces as `FACILITY_ROOM_GLOW` (below). Nothing casts a shadow but the shell.
 * The interior is not finished by `worldSurface`: these rooms are cleaned
 * every shift, and the mapped finishes are outside its scope by design.
 */

type MaterialSpec = {
  readonly roughness: number;
  readonly metalness?: number;
  readonly map?: () => THREE.Texture;
};

const LIT: Partial<Record<FacilityMaterialKey, MaterialSpec>> = {
  paint: { roughness: 0.85 },
  satin: { roughness: 0.45 },
  metal: { roughness: 0.3, metalness: 0.85 },
  fabric: { roughness: 0.95 },
  foliage: { roughness: 0.7 },
  blockwork: { roughness: 0.88, map: () => getFacilityFinish('blockwork') },
  oakBoards: { roughness: 0.55, map: () => getFacilityFinish('oakBoards') },
  oak: { roughness: 0.5, map: () => getFacilityFinish('oakVeneer') },
  tile: { roughness: 0.35, map: () => getFacilityFinish('floorTile') },
  vinyl: { roughness: 0.6, map: () => getFacilityFinish('safetyVinyl') },
  metro: { roughness: 0.22, map: () => getFacilityFinish('metroTile') },
  carpet: { roughness: 1, map: () => getFacilityFinish('carpet') },
  ceilingGrid: { roughness: 0.95, map: () => getFacilityFinish('ceilingGrid') },
  stipple: { roughness: 0.9, map: () => getFacilityFinish('paint') },
  rug: { roughness: 1, map: () => getFacilityRug() },
  print: { roughness: 0.6, map: () => getFacilityAtlas() },
};

/**
 * The rooms' own lamplight, as a radiance in proportion to albedo.
 *
 * The rooms' fittings are always on and adding real lights would put a light
 * count into every material program in the scene (and their only shadowless
 * light would come straight through the ceiling anyway). So each interior part
 * carries a `glow` weight (`facilityGeometry.ts`: 1 in a room, 0 on the hall
 * side, more on a ceiling, which sees only bounced light) and receives
 * `FACILITY_ROOM_GLOW * albedo * glow` as emission. Without it a wall facing
 * away from the hall's light rows, and every ceiling, read near black at night.
 * One shared uniform, so setting it to black is the paired control.
 */
export const FACILITY_ROOM_GLOW = { value: new THREE.Color('#ffe6c2').multiplyScalar(0.17) };
const ROOM_GLOW_CACHE_KEY = 'facility-room-glow-v1';

function withRoomGlow(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFacilityRoomGlow = FACILITY_ROOM_GLOW;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        'attribute float glow;\nvarying float vFacilityGlow;\n#include <common>'
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacilityGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        'uniform vec3 uFacilityRoomGlow;\nvarying float vFacilityGlow;\n#include <common>'
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uFacilityRoomGlow * diffuseColor.rgb * vFacilityGlow;'
      );
  };
  // Stable: the injection never varies (CLAUDE.md, "Shader Cache Key Bug").
  material.customProgramCacheKey = () => ROOM_GLOW_CACHE_KEY;
  return material;
}

let materials: Map<FacilityMaterialKey, THREE.Material> | null = null;

/** Materials are built on first mount, so the textures cost nothing until the hall draws. */
function getFacilityMaterials(): Map<FacilityMaterialKey, THREE.Material> {
  if (materials) return materials;
  const m = new Map<FacilityMaterialKey, THREE.Material>();
  for (const [key, spec] of Object.entries(LIT) as [FacilityMaterialKey, MaterialSpec][]) {
    m.set(
      key,
      withRoomGlow(
        new THREE.MeshStandardMaterial({
          name: `facility-${key}`,
          vertexColors: true,
          roughness: spec.roughness,
          metalness: spec.metalness ?? 0,
          map: spec.map?.() ?? null,
        })
      )
    );
  }
  // Light sources are unlit (CLAUDE.md, "Painted surfaces are lit; light sources are not").
  m.set(
    'lamp',
    new THREE.MeshBasicMaterial({
      name: 'facility-lamp-face',
      vertexColors: true,
      toneMapped: false,
    })
  );
  m.set(
    'screen',
    new THREE.MeshBasicMaterial({ name: 'facility-screen', map: getFacilityAtlas() })
  );
  m.set(
    'glass',
    new THREE.MeshStandardMaterial({
      name: 'facility-glass',
      vertexColors: true,
      color: '#dfeaec',
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
  );
  m.set(
    'obscured',
    new THREE.MeshStandardMaterial({
      name: 'facility-obscured-glass',
      vertexColors: true,
      color: '#eef3f3',
      roughness: 0.55,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  materials = m;
  return m;
}

const TRANSPARENT = new Set<FacilityMaterialKey>(['glass', 'obscured']);

const FacilityLayerMeshes: React.FC<{ layer: FacilityLayer }> = React.memo(({ layer }) => {
  const meshes = useMemo(() => {
    const { merged } = getFacilityGeometry();
    const mats = getFacilityMaterials();
    const out: {
      id: string;
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
      key: FacilityMaterialKey;
    }[] = [];
    for (const [id, geometry] of merged) {
      const [l, key] = id.split(':') as [FacilityLayer, FacilityMaterialKey];
      if (l !== layer) continue;
      const material = mats.get(key);
      if (material) out.push({ id, geometry, material, key });
    }
    return out;
  }, [layer]);
  return (
    <>
      {meshes.map(({ id, geometry, material, key }) => (
        <mesh
          key={id}
          name={`facility-${id.replace(':', '-')}`}
          geometry={geometry}
          material={material}
          castShadow={layer === 'shell' && !TRANSPARENT.has(key) && key !== 'lamp'}
          receiveShadow={!TRANSPARENT.has(key) && key !== 'lamp' && key !== 'screen'}
          renderOrder={TRANSPARENT.has(key) ? 2 : 0}
        />
      ))}
    </>
  );
});
FacilityLayerMeshes.displayName = 'FacilityLayerMeshes';

/** Painted lettering on the sign boards over the doors (in-world signage: never translated). */
const FacilitySigns: React.FC = React.memo(() => (
  <>
    {FACILITY_SIGNS.map((sign) => (
      <SceneText
        key={sign.id}
        surface="painted"
        position={[sign.x, sign.y, FACILITY_SIGN_FACE_Z + 0.004]}
        fontSize={0.13}
        letterSpacing={0.08}
        maxWidth={sign.width - 0.1}
        anchorX="center"
        anchorY="middle"
        color="#f3ead8"
      >
        {sign.text}
      </SceneText>
    ))}
  </>
));
FacilitySigns.displayName = 'FacilitySigns';

/** The facilities sit 30 m from the hall centre; their small things go first. */
const DRESSING_HIDE_DISTANCE = 75;
const DRESSING_SHOW_DISTANCE = 68;
const FACILITY_CENTRE_Z = -31.6;
const SAMPLE_EVERY_FRAMES = 12;

export const StaffFacilities: React.FC = () => {
  const isLowGraphics = useGraphicsStore((state) => state.graphics.quality === 'low');
  const rootRef = useRef<THREE.Group>(null);
  const dressingRef = useRef<THREE.Group>(null);
  const state = useRef({ frame: 0, root: true, dressing: true });

  useFrame(({ camera }) => {
    const s = state.current;
    s.frame = (s.frame + 1) % SAMPLE_EVERY_FRAMES;
    if (s.frame !== 0) return;
    const root = resolveFactoryInteriorDetailVisibility(
      s.root,
      camera.position.x,
      camera.position.z
    );
    if (root !== s.root && rootRef.current) rootRef.current.visible = root;
    s.root = root;
    // The two blocks straddle x = 0, so distance to their shared centre line is enough.
    const dz = camera.position.z - FACILITY_CENTRE_Z;
    const far = Math.hypot(Math.max(0, Math.abs(camera.position.x) - 18), dz);
    const dressing = far < (s.dressing ? DRESSING_HIDE_DISTANCE : DRESSING_SHOW_DISTANCE);
    if (dressing !== s.dressing && dressingRef.current) dressingRef.current.visible = dressing;
    s.dressing = dressing;
  });

  return (
    <group ref={rootRef} name="staff-facilities">
      <FacilityLayerMeshes layer="shell" />
      <FacilityLayerMeshes layer="fittings" />
      {!isLowGraphics && (
        <group ref={dressingRef} name="staff-facilities-dressing">
          <FacilityLayerMeshes layer="dressing" />
          <FacilitySigns />
        </group>
      )}
    </group>
  );
};
