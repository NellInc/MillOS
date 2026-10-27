import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyWorldSurface } from '../../utils/worldSurface';
import { EXTERIOR_LAMP_LEVEL } from './ExteriorLighting';
import { apartmentFacadeLayout, type ApartmentFloors } from './apartmentFacadeLayout';

const SLAB = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#a29d93', roughness: 0.9, metalness: 0 }),
  'masonry'
);
const RENDER = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#b9a98f', roughness: 0.88, metalness: 0 }),
  'masonry'
);
const COPING = new THREE.MeshStandardMaterial({ color: '#6f7377', roughness: 0.7, metalness: 0.2 });
const RAIL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#2b3236', roughness: 0.5, metalness: 0.5 }),
  'painted'
);
// Galvanised, not the facade's dark navy: in the shipping frame the dark panels
// merged with the shaded wall into three solid bands (final-med-12).
const PANEL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#8a9397', roughness: 0.55, metalness: 0.4 }),
  'painted'
);
/**
 * The stair core's glazing, lit at night. It was dark glass by day and
 * by night, so at 22:00 the tower read as an unlit black monolith beside the
 * block (shipping med-22). A stairwell is lit all night; the slot and the
 * ground-floor door glow from the exterior lamp level. These meshes stay out
 * of the static batch: the batcher clones materials, and a merged clone would
 * never see the per-frame intensity.
 *
 * On the flats' schedule since final4: it glowed full height from the lamp
 * level while the block beside it is lit on alternate storeys, so at 18:30
 * one cream strip stood beside a half-lit block (farm, shipping). Only the
 * storeys whose flats are lit glow (`stairStoreys`), linearly with the lamp
 * level and in the windows' glow colour (`applyApartmentWindows`, #ffdcb0),
 * and the glass is satin rather than a mirror for the dusk sky.
 */
export const STAIR_LIGHT_GLAZING = new THREE.MeshStandardMaterial({
  name: 'apartment-stair-light-glazing',
  color: '#1c2830',
  roughness: 0.4,
  metalness: 0.05,
  emissive: '#ffdcb0',
  emissiveIntensity: 0,
});
/** The slot on the storeys whose flats are dark: the same glass, never lit. */
const STAIR_GLAZING = new THREE.MeshStandardMaterial({
  name: 'apartment-stair-glazing',
  color: '#1c2830',
  roughness: 0.4,
  metalness: 0.05,
});
/** Emissive intensity of the stair glazing at an exterior lamp level (0 day, 1 night). */
export const stairLightIntensity = (level: number) => 0.3 * THREE.MathUtils.clamp(level, 0, 1);
const UNBATCHED = { noStaticBatch: true } as const;
const BOX = new THREE.BoxGeometry(1, 1, 1);

const Block: React.FC<{
  min: [number, number, number];
  max: [number, number, number];
  material: THREE.Material;
  cast?: boolean;
  userData?: Record<string, unknown>;
}> = ({ min, max, material, cast = true, userData }) => (
  <mesh
    geometry={BOX}
    material={material}
    position={[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]}
    scale={[max[0] - min[0], max[1] - min[1], max[2] - min[2]]}
    castShadow={cast}
    receiveShadow
    userData={userData}
  />
);

/** Drives the stair glazing from the shared lamp level (shared material: idempotent). */
const StairLightDriver: React.FC = () => {
  useFrame(() => {
    STAIR_LIGHT_GLAZING.emissiveIntensity = stairLightIntensity(EXTERIOR_LAMP_LEVEL.value);
  });
  return null;
};

/**
 * Access galleries, the columns that carry them, a stair tower and its coping
 * on an apartment block's +x face (`apartmentFacadeLayout.ts`), for either
 * block. Apartment-local metres.
 */
export const ApartmentFacade: React.FC<{ floors: ApartmentFloors }> = ({ floors }) => {
  const layout = apartmentFacadeLayout(floors);
  const face = layout.shell.halfX;
  const g = layout.gallery;
  const t = layout.stairTower;
  const outer = face + g.depth;
  return (
    <group name="apartment-facade-form">
      {/* Gallery columns, ground to top rail, on the piers between windows:
          the verticals that turn stacked bands into a framed facade. */}
      {layout.columns.map((column) => (
        <Block
          key={column.z}
          min={[column.x - column.size / 2, column.bottom, column.z - column.size / 2]}
          max={[column.x + column.size / 2, column.top, column.z + column.size / 2]}
          material={SLAB}
        />
      ))}
      {g.tops.map((top) => (
        <group key={top}>
          <Block
            min={[face - g.embed, top - g.thickness, g.minZ]}
            max={[outer, top, g.maxZ]}
            material={SLAB}
          />
          {/* Edge upstand: the slab's own concrete, so each deck edge reads as
              a light line across the facade, not as one more dark band. */}
          <Block
            min={[outer - 0.02, top - g.thickness - 0.06, g.minZ]}
            max={[outer + 0.04, top + 0.08, g.maxZ + 0.02]}
            material={SLAB}
            cast={false}
          />
          {/* A solid pressed-steel balustrade, not balusters: 25 mm bars at
              0.12 m pitch fall under a pixel from the shipping camera and
              aliased into a stippled band (dressing-r2). */}
          <Block
            min={[outer - 0.1, top + 0.08, g.minZ]}
            max={[outer - 0.07, top + g.railHeight - 0.05, g.maxZ - 0.04]}
            material={PANEL}
          />
          <Block
            min={[outer - 0.13, top + g.railHeight - 0.05, g.minZ]}
            max={[outer - 0.03, top + g.railHeight, g.maxZ]}
            material={RAIL}
          />
          {/* End rail back to the facade. */}
          <Block
            min={[face, top + g.railHeight - 0.05, g.maxZ - 0.08]}
            max={[outer - 0.03, top + g.railHeight, g.maxZ]}
            material={RAIL}
          />
          {/* Complete the free return beneath that rail. Butt the long panel's
              inner face, keeping its top/bottom faces free of coplanar overlap.
              Working if every gallery has a continuous end below its handrail. */}
          <Block
            min={[face - 0.02, top + 0.08, g.maxZ - 0.07]}
            max={[outer - 0.1, top + g.railHeight - 0.05, g.maxZ - 0.04]}
            material={PANEL}
          />
          {/* Two brackets under each gallery. */}
          {[g.minZ + 2.5, (g.minZ + g.maxZ) / 2 + 1, g.maxZ - 1.2].map((z) => (
            <Block
              key={z}
              min={[face - g.embed, top - g.thickness - 0.45, z - 0.06]}
              max={[outer - 0.2, top - g.thickness, z + 0.06]}
              material={RAIL}
              cast={false}
            />
          ))}
        </group>
      ))}
      {/* Stair tower: rendered, rising over the roofline with a coping, and a
          full-height glazing slot lighting the stair. */}
      <Block min={[t.minX, -0.1, t.minZ]} max={[t.maxX, t.top, t.maxZ]} material={RENDER} />
      <Block
        min={[t.minX - 0.05, t.top, t.minZ - 0.06]}
        max={[t.maxX + 0.06, t.top + 0.18, t.maxZ + 0.06]}
        material={COPING}
      />
      <StairLightDriver />
      {/* The slot storey by storey, lit where the flats are (stairStoreys);
          each pane meets the landings, which stand over its ends. */}
      {layout.stairStoreys.map(({ storey, bottom, top, lit }) => (
        <Block
          key={storey}
          min={[t.maxX - 0.03, bottom, (t.minZ + t.maxZ) / 2 - 0.45]}
          max={[t.maxX + 0.03, top, (t.minZ + t.maxZ) / 2 + 0.45]}
          material={lit ? STAIR_LIGHT_GLAZING : STAIR_GLAZING}
          cast={false}
          userData={lit ? UNBATCHED : undefined}
        />
      ))}
      {/* A landing slab across the slot at every upper floor, so the lit slot
          reads as a stair rather than one strip light. */}
      {layout.stairLandings.map((y) => (
        <Block
          key={y}
          min={[t.maxX - 0.02, y - 0.1, (t.minZ + t.maxZ) / 2 - 0.47]}
          max={[t.maxX + 0.06, y + 0.1, (t.minZ + t.maxZ) / 2 + 0.47]}
          material={RAIL}
          cast={false}
        />
      ))}
      {/* Ground-floor door into the stair, on the gallery side. */}
      <Block
        min={[t.minX + 0.35, 0, t.maxZ - 0.03]}
        max={[t.maxX - 0.25, 2.2, t.maxZ + 0.03]}
        material={STAIR_LIGHT_GLAZING}
        cast={false}
        userData={UNBATCHED}
      />
    </group>
  );
};
