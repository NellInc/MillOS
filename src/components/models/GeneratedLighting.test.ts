import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import {
  applyOfficeWindows,
  OFFICE_INTERIOR_STRENGTH,
  OFFICE_PANE_LAYOUT,
  applyFarmWindows,
  FARM_INTERIOR_STRENGTH,
  applyForgeWindows,
  FORGE_HEAT_LEVEL,
  FORGE_HEAT_STRENGTH,
  applyApartmentWindows,
  applyApartmentFacade,
  APARTMENT_FACADE_CACHE_KEY,
  applyVillageWindows,
  applyCastlePaving,
  CASTLE_PAVING_STRENGTH,
  CASTLE_PAVING_TILE,
  applyShopWindows,
  SHOP_JOINERY_COLOURS,
  VILLAGE_INTERIOR_STRENGTH,
  VILLAGE_FABRIC_STRENGTH,
} from './GeneratedOfficeModel';
import {
  applyBoatPortholes,
  BOAT_INTERIOR_STRENGTH,
  BOAT_PAINT_STRENGTH,
} from './GeneratedBoatModel';
import { applyLampLens, LAMP_LENS_HEIGHTS } from './GeneratedLampModel';
import { EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';
import { WORKSHOP_GLAZING } from '../TruckBay';
import { hasWorldSurface, WORLD_SURFACE_CACHE_KEY } from '../../utils/worldSurface';

function compile(apply: (material: THREE.MeshStandardMaterial, night: { value: number }) => void) {
  const material = new THREE.MeshStandardMaterial();
  const night = { value: 1 };
  apply(material, night);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  // The night flag is bound by reference, so a day/night flip needs no rebuild.
  expect(Object.values(shader.uniforms)).toContain(night);
  const nightKey = material.customProgramCacheKey();
  apply(material, { value: 0 });
  expect(material.customProgramCacheKey()).toBe(nightKey);
  expect(shader.vertexShader).toContain('#include <begin_vertex>');
  expect(shader.fragmentShader).toContain('#include <emissivemap_fragment>');
  material.dispose();
  return shader;
}

describe('generated architectural night lighting', () => {
  it('confines office glazing to the outer front bays, excluding the blue roof', () => {
    const shader = compile(applyOfficeWindows);
    expect(shader.uniforms.officeNight.value).toBe(1);
    expect(shader.fragmentShader).toContain('step(0.095, abs(vOfficePosition.x))');
    expect(shader.fragmentShader).toContain('1.0 - step(0.14, vOfficePosition.y)');
    expect(shader.fragmentShader).toContain('step(0.30, vOfficePosition.z)');
  });
  it('locates boat portholes in object-rest coordinates rather than lighting the blue hull', () => {
    const shader = compile(applyBoatPortholes);
    expect(shader.uniforms.boatNight.value).toBe(1);
    expect(shader.vertexShader).toContain('vBoatPosition = position');
    expect(shader.fragmentShader).toContain('step(1.18, abs(vBoatPosition.x))');
    expect(shader.fragmentShader).toContain('step(1.80, vBoatPosition.y)');
  });
});

it('gives only physical boat glass filtered curtain and view-dependent cabin depth', () => {
  const shader = compile(applyBoatPortholes);
  expect(shader.uniforms.boatInteriorStrength).toBe(BOAT_INTERIOR_STRENGTH);
  expect(shader.vertexShader).toContain('vBoatUV = uv');
  expect(shader.vertexShader).toContain('modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)');
  expect(shader.fragmentShader).toContain('glassTile * step(1.18');
  expect(shader.fragmentShader).toContain('inside = pane - clamp(slope');
  expect(shader.fragmentShader.indexOf('fwidth(vBoatPosition.z)')).toBeLessThan(
    shader.fragmentShader.indexOf('if (glazing > 0.5)')
  );
  expect(shader.fragmentShader).toContain('(1.0 - curtain)');
  expect(shader.fragmentShader).toContain('* boatNight * strength');
  expect(shader.fragmentShader).not.toContain('diffuseColor.b - diffuseColor.r');
  for (const z of [-2.8, -1.2, 0.4, 2.0]) {
    const bay = Math.floor((z + 3.6) / 1.6);
    expect(-2.8 + bay * 1.6).toBeCloseTo(z, 10);
  }
  const source = readFileSync('src/components/models/GeneratedBoatModel.tsx', 'utf8');
  expect(source).not.toMatch(/TextureLoader|<(?:pointLight|spotLight)|useFrame/);
});

it('shades all four measured door panes while excluding wood, paint and brass', async () => {
  const shader = compile(applyBoatPortholes);
  expect(shader.fragmentShader).toContain('float endPane = glassTile * step(3.54');
  expect(shader.fragmentShader).toContain('vec2 pane = mix(sidePane, doorPane, endPane)');
  expect(shader.fragmentShader).toContain('axisZ * sign(vBoatPosition.z), endPane');
  expect(shader.fragmentShader.indexOf('fwidth(vBoatPosition.x)')).toBeLessThan(
    shader.fragmentShader.indexOf('if (glazing > 0.5)')
  );
  const document = await new NodeIO().read('public/models/world/canal-boat.glb');
  const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
  const positions = primitive.getAttribute('POSITION')!.getArray()!;
  const uv = primitive.getAttribute('TEXCOORD_0')!.getArray()!;
  const panes = new Set<string>();
  let selected = 0;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3],
      y = positions[i * 3 + 1],
      z = positions[i * 3 + 2];
    const glass =
      uv[i * 2] >= 0.5 && uv[i * 2] < 0.75 && uv[i * 2 + 1] >= 0.25 && uv[i * 2 + 1] < 0.5;
    const inPane =
      Math.abs(z) >= 3.54 && Math.abs(z) < 4.14 && y >= 1.92 && y < 2.28 && Math.abs(x) < 0.44;
    if (!glass || !inPane) continue;
    selected++;
    panes.add(`${Math.sign(x)},${Math.sign(z)}`);
    expect(Math.abs((x - Math.sign(x) * 0.298164) / 0.123378)).toBeCloseTo(1, 4);
    expect(Math.abs((y - 2.1) / 0.17)).toBeCloseTo(1, 4);
  }
  expect(selected).toBe(96);
  expect(panes.size).toBe(4);
});

it('binds the actual shared workshop glass to pane rooms without domestic curtains', () => {
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof WORKSHOP_GLAZING.onBeforeCompile>[0];
  WORKSHOP_GLAZING.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(WORKSHOP_GLAZING.name).toBe('maintenance-workshop-glazing');
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(shader.uniforms.villageAtlas.value).toBe(0);
  expect(WORKSHOP_GLAZING.customProgramCacheKey()).toBe('millos-authored-village-windows-v8');
  expect(WORKSHOP_GLAZING.map).toBeNull();
});

it('faces both existing side panes outward and keeps their dimensions and shared material', () => {
  const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
  const start = source.indexOf('key={`garage-side-window-${side}`}');
  const panes = source.slice(start, source.indexOf('</mesh>', start));
  expect(panes).toContain('rotation={[0, (side * Math.PI) / 2, 0]}');
  expect(panes).toContain('material={WORKSHOP_GLAZING}');
  expect(panes).toContain('args={[3.4, 1.5]}');
  for (const side of [-1, 1]) {
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (side * Math.PI) / 2
    );
    expect(normal.x).toBeCloseTo(side, 10);
  }
});

it('generated lanterns use the existing live dusk/weather driver without rebuilding materials', () => {
  const original = EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity;
  const material = new THREE.MeshStandardMaterial();
  try {
    applyLampLens(material, 'victorian');
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader:
        '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = 0.25;
    expect(shader.uniforms.lampLensStrength.value).toBe(0.25);
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = 2.5;
    expect(shader.uniforms.lampLensStrength.value).toBe(2.5);
    expect(shader.fragmentShader).toContain('step(lampLensHeights.x, vLampRestHeight)');
    expect(shader.fragmentShader).toContain('1.0 - step(lampLensHeights.y, vLampRestHeight)');
    expect(shader.uniforms.lampLensHeights.value.toArray()).toEqual([3.935, 4.245]);
    expect(material.customProgramCacheKey()).toBe('millos-generated-lamp-lens-v2');
  } finally {
    EXTERIOR_LAMP_LENS_MATERIAL.emissiveIntensity = original;
    material.dispose();
  }
});

for (const style of ['modern', 'victorian'] as const) {
  it(`${style} confines emission to its authored optic height`, () => {
    const [low, high] = LAMP_LENS_HEIGHTS[style];
    const accepts = (height: number) => height >= low && height < high;
    expect(accepts(0.3)).toBe(false);
    expect(accepts(2.5)).toBe(false);
    expect(accepts((low + high) / 2)).toBe(true);
    expect(accepts(4.26)).toBe(false);
    const material = new THREE.MeshStandardMaterial();
    applyLampLens(material, style);
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader:
        '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.lampLensHeights.value.toArray()).toEqual([low, high]);
    material.dispose();
  });
}

it('lights apartment glazing on alternating storeys without another scene light', () => {
  const shader = compile(applyApartmentWindows);
  expect(shader.uniforms.officeNight.value).toBe(1);
  expect(shader.fragmentShader).toContain('mod(floor(roomHeight / 3.5), 2.0)');
  expect(shader.fragmentShader).toContain('step(0.52, mod(roomHeight, 3.5))');
  expect(shader.fragmentShader).toContain('diffuseColor.b - diffuseColor.r');
  expect(shader.fragmentShader).toContain('1.0 - step(13.8, roomHeight)');
  const glow = shader.uniforms.officeGlow.value as THREE.Color;
  expect(Math.max(glow.r, glow.g, glow.b)).toBeLessThan(0.4);
});

it('rejects measured blue-grey masonry while accepting cyan apartment glass', () => {
  const mask = (hex: string) => {
    const c = new THREE.Color(hex);
    return (
      THREE.MathUtils.smoothstep((c.b - c.r) / Math.max(0.001, c.b), 0.4, 0.55) *
      THREE.MathUtils.smoothstep((c.g - c.r) / Math.max(0.001, c.g), 0.32, 0.46)
    );
  };
  // Actual delivered albedo samples, linearised just as the GPU does.
  expect(mask('#6493a7')).toBe(1);
  expect(mask('#686f77')).toBe(0);
  expect(mask('#444b53')).toBe(0);
  expect(mask('#616568')).toBe(0);
  const shader = compile(applyApartmentWindows);
  expect(shader.fragmentShader).toContain('smoothstep(0.40, 0.55');
  expect(shader.fragmentShader).toContain('smoothstep(0.32, 0.46');
});

it('keeps apartment cornices dark beneath the actual window sills', () => {
  const aboveSill = (height: number) => height % 3.5 >= 0.52;
  for (const height of [3.6, 3.8, 10.6, 10.8]) expect(aboveSill(height)).toBe(false);
  for (const height of [4.8, 5.4, 6, 11.8, 12.4, 13]) expect(aboveSill(height)).toBe(true);
});

it('illuminates only the authored village glass atlas tile, on the shared live dimmer', () => {
  const shader = compile(applyVillageWindows);
  expect(shader.uniforms.villageNight.value).toBe(1);
  expect(shader.vertexShader).toContain('vVillageUV = uv');
  expect(shader.fragmentShader).toContain('step(villageTileOrigin.x, vVillageUV.x)');
  expect(shader.fragmentShader).toContain('step(villageTileOrigin.y, vVillageUV.y)');
  expect(shader.uniforms.villageTileOrigin.value.toArray()).toEqual([0.5, 0.25]);
  expect(shader.uniforms.villageAtlas.value).toBe(1);
  expect(shader.uniforms.villageInteriorStrength).toBe(VILLAGE_INTERIOR_STRENGTH);
  expect(shader.uniforms.villageCurtains.value).toBe(1);
  expect(shader.uniforms.villagePaneUV.value.toArray()).toEqual([0.0075, 0.235]);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(shader.fragmentShader).toContain('villageTileOrigin - vec2(villagePaneUV.x)');
  expect(shader.fragmentShader).toContain('pane - viewSlope * 0.22');
  expect(shader.fragmentShader).toContain('pane - viewSlope * 0.035');
  expect(shader.fragmentShader.indexOf('dFdx(pane)')).toBeLessThan(
    shader.fragmentShader.indexOf('if (glazing > 0.5')
  );
  expect(shader.fragmentShader).toContain('max(abs(determinant), 0.00000001)');
  expect(shader.fragmentShader).toContain('max(facing, 0.25)');
  expect(shader.fragmentShader).toContain('float occupied = step(0.22, seed)');
});

it('uses the actual standalone home UVs and pub amber tile without treating a lantern as curtains', () => {
  for (const [glazing, atlas, origin] of [
    ['pane', 0, [0.5, 0.25]],
    ['amber', 1, [0.75, 0.25]],
  ] as const) {
    const material = new THREE.MeshStandardMaterial();
    applyVillageWindows(material, { value: 1 }, true, glazing);
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader:
        '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.villageAtlas.value).toBe(atlas);
    expect(shader.uniforms.villageTileOrigin.value.toArray()).toEqual(origin);
    expect(shader.fragmentShader).toContain('vec2(vVillageUV.x, 1.0 - vVillageUV.y)');
    expect(shader.fragmentShader).toContain('step(0.5, min(length(worldU), length(worldV)))');
    expect(shader.fragmentShader).toContain('foldDetail');
    material.dispose();
  }
});

it('retains forge workrooms without domestic curtains or a new shader variant', () => {
  const material = new THREE.MeshStandardMaterial();
  applyVillageWindows(material, { value: 1 }, false);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(material.customProgramCacheKey()).toBe('millos-authored-village-windows-v8');
  material.dispose();
});

it('keeps church stained glass out of domestic room replacement', () => {
  const material = new THREE.MeshStandardMaterial();
  applyVillageWindows(material, { value: 1 }, false, 'stained');
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  expect(shader.uniforms.villageRooms.value).toBe(0);
  expect(shader.fragmentShader).toContain('&& villageRooms > 0.5');
  expect(shader.fragmentShader).toContain(
    'mix(diffuseColor.rgb * 0.85, villageGlow, villageRooms)'
  );
  expect(shader.fragmentShader).toContain('glazing = max(stainedRow, roseTile)');
  expect(material.customProgramCacheKey()).toBe('millos-authored-village-windows-v8');
  material.dispose();
});

it('uses the castle glass tile and its delivered padding with the same room shader', () => {
  const material = new THREE.MeshStandardMaterial();
  applyVillageWindows(material, { value: 1 }, true, 'castle');
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageTileOrigin.value.toArray()).toEqual([0.75, 0.75]);
  expect(shader.uniforms.villagePaneUV.value.toArray()).toEqual([0.00375, 0.2425]);
  expect(shader.uniforms.villagePalace.value).toBe(1);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(shader.uniforms.villageCurtains.value).toBe(1);
  expect(material.customProgramCacheKey()).toBe('millos-authored-village-windows-v8');
  material.dispose();
});

it('pins the pane transform to UVs in the actual delivered castle GLB', () => {
  const bytes = readFileSync('public/models/village/castle.glb');
  const jsonLength = bytes.readUInt32LE(12);
  const asset = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const primitive = asset.meshes[0].primitives[0];
  const accessor = asset.accessors[primitive.attributes.TEXCOORD_0];
  const view = asset.bufferViews[accessor.bufferView];
  expect(accessor.componentType).toBe(5126);
  expect(accessor.type).toBe('VEC2');
  const offset = 28 + jsonLength + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const glassUVs: [number, number][] = [];
  for (let i = 0; i < accessor.count; i++) {
    const vertex = offset + i * (view.byteStride ?? 8);
    const uv: [number, number] = [bytes.readFloatLE(vertex), bytes.readFloatLE(vertex + 4)];
    if (uv[0] > 0.75 && uv[0] < 1 && uv[1] > 0.75 && uv[1] < 1) glassUVs.push(uv);
  }
  expect(glassUVs.length).toBeGreaterThan(1000);
  for (const axis of [0, 1]) {
    expect(Math.min(...glassUVs.map((uv) => uv[axis]))).toBeCloseTo(0.75375, 6);
    expect(Math.max(...glassUVs.map((uv) => uv[axis]))).toBeCloseTo(0.99625, 6);
  }
});

it('reuses bounded curtains and room depth on apartment facade coordinates, with retained dark floors', () => {
  const shader = compile(applyApartmentWindows);
  expect(shader.uniforms.villageInteriorStrength).toBe(VILLAGE_INTERIOR_STRENGTH);
  expect(shader.uniforms.villageCurtains.value).toBe(1);
  expect(shader.uniforms.villageRoomLight).toBe(shader.uniforms.officeGlow);
  expect(shader.fragmentShader).toContain('float occupied = occupiedFloor * step(0.22, seed)');
  expect(shader.fragmentShader).toContain('* villageNight * occupiedFloor;');
  expect(shader.fragmentShader).toContain('mix(0.192, 0.200, sideFacade)');
  expect(shader.fragmentShader).toContain('1.0 - (vOfficePosition.y - floorLow)');
  expect(shader.fragmentShader).toContain('pane - viewSlope * 0.22');
  expect(shader.fragmentShader).toContain('vec2 du = dFdx(pane)');
  expect(shader.fragmentShader).not.toContain('vec2 pane = mix(');
});

it('keeps the delivered cut upper storey separate from the four-storey pane height', () => {
  for (const floors of [3, 4] as const) {
    const material = new THREE.MeshStandardMaterial();
    applyApartmentWindows(material, { value: 1 }, floors);
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader:
        '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.apartmentFloorLow.value.z).toBe(floors === 3 ? 0.01059 : 0.01663);
    expect(shader.uniforms.apartmentFloorHigh.value.z).toBe(floors === 3 ? 0.13193 : 0.13014);
    expect(material.customProgramCacheKey()).toBe('millos-generated-apartment-window-v5');
    material.dispose();
  }
});

it('opens warmer civic rooms only on the town-hall glass atlas contract', () => {
  const civic = compile((m, n) => applyVillageWindows(m, n, true, 'civic'));
  const ordinary = compile(applyVillageWindows);
  expect(civic.uniforms.villageCivic.value).toBe(1);
  expect(ordinary.uniforms.villageCivic.value).toBe(0);
  expect(civic.uniforms.villageTileOrigin.value.toArray()).toEqual([0.5, 0.25]);
  expect(civic.fragmentShader).toContain('mix(1.0, 2.5, villageCivic)');
  expect(civic.fragmentShader).toContain('desk * villageCivic * 0.65');
});

it('repaints only the authored shop joinery swatch, retaining grain, linen and room lighting', () => {
  const material = new THREE.MeshStandardMaterial();
  const original = new THREE.Color('#476454');
  const keys = new Set<string>();
  for (const trade of ['bakery', 'butcher', 'general'] as const) {
    applyShopWindows(material, trade);
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader:
        '#include <map_fragment>\n#include <emissivemap_fragment>\n#include <lights_fragment_end>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.shopDisplayTrade?.value).toBe(
      { bakery: 0, butcher: 1, general: 2 }[trade]
    );
    const ratio = shader.uniforms.shopJoineryTint.value as THREE.Color;
    const target = new THREE.Color(SHOP_JOINERY_COLOURS[trade]);
    expect(original.r * ratio.r).toBeCloseTo(target.r, 10);
    expect(original.g * ratio.g).toBeCloseTo(target.g, 10);
    expect(original.b * ratio.b).toBeCloseTo(target.b, 10);
    expect(shader.fragmentShader.match(/uniform vec3 shopJoineryTint;/g)).toHaveLength(1);
    expect(shader.fragmentShader).toContain(
      'diffuseColor.rgb *= mix(vec3(1.0), shopJoineryTint, shopJoinery)'
    );
    expect(shader.fragmentShader).toContain(
      'step(0.25, vVillageUV.x) * (1.0 - step(0.5, vVillageUV.x))'
    );
    expect(shader.fragmentShader).toContain(
      'step(0.25, vVillageUV.y) * (1.0 - step(0.5, vVillageUV.y))'
    );
    expect(shader.uniforms.villageTileOrigin.value.toArray()).toEqual([0.5, 0.25]);
    expect(shader.uniforms.villageCurtains.value).toBe(1);
    expect(shader.uniforms.villageInteriorStrength).toBe(VILLAGE_INTERIOR_STRENGTH);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(shader.fragmentShader).toContain('reflectedLight.indirectDiffuse += villageRoomLight');
    expect(shader.fragmentShader).toContain('BRDF_Lambert(diffuseColor.rgb) * roomDiffuse');
    expect(shader.fragmentShader).toContain('* villageNight * villageInteriorStrength');
    expect(shader.fragmentShader).toContain('step(0.75, vVillageUV.x)');
    expect(shader.fragmentShader).toContain('dot(normal, roomUp)');
    expect(shader.fragmentShader.match(/float shopDisplay =/g)).toHaveLength(1);
    expect(shader.uniforms.shopDisplayItemGrid.value.toArray()).toEqual([0.35, 2.25]);
    expect(shader.vertexShader).toContain(
      'floor((position.x + shopDisplayItemGrid.x) * shopDisplayItemGrid.y)'
    );
    expect(shader.fragmentShader).toContain('shopDisplay > 0.5');
    expect(shader.fragmentShader).toContain('vec2 goodsUV = (vVillageUV - vec2(0.75, 0.25)) * 4.0');
    expect(shader.fragmentShader).toContain('max(fwidth(veinField), 0.09)');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = peel *');
    expect(shader.fragmentShader).toContain('max(fwidth(scoreField), 0.10)');
    expect(shader.fragmentShader).toContain('score *= smoothstep(0.42, 0.62, goodsUV.y)');
    expect(shader.fragmentShader).toContain('mix(diffuseColor.rgb, shopDisplayPale, score * 0.58)');
    expect(shader.fragmentShader.indexOf('vec2 goodsUV')).toBeLessThan(
      shader.fragmentShader.indexOf('#include <lights_fragment_end>')
    );
    expect(shader.fragmentShader).not.toContain('totalEmissiveRadiance += shopDisplay');
    const expectedWarm = new THREE.Color(
      { bakery: '#bc965b', butcher: '#a95e57', general: '#be4d3d' }[trade]
    );
    expect(shader.uniforms.shopDisplayWarm.value.toArray()).toEqual(expectedWarm.toArray());
    keys.add(material.customProgramCacheKey());
  }
  expect(keys.size).toBe(1);
  material.dispose();
});

it('composes the castle-only paving finish with the existing shared room dimmer and stable key', () => {
  const material = new THREE.MeshStandardMaterial();
  const night = { value: 0.6 };
  applyVillageWindows(material, night, true, 'castle');
  applyCastlePaving(material);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageNight).toBe(night);
  expect(shader.uniforms.castlePavingStrength).toBe(CASTLE_PAVING_STRENGTH);
  expect(shader.uniforms.castlePavingTile.value.toArray()).toEqual([...CASTLE_PAVING_TILE]);
  expect(shader.vertexShader).toContain('step(0.99, normal.y) * step(3.18, position.y)');
  expect(shader.fragmentShader).toContain('castlePaving > 0.5 && castlePavingStrength > 0.0');
  expect(shader.fragmentShader).toContain('0.00045 * castlePavingStrength');
  expect(material.customProgramCacheKey()).toBe(
    'millos-castle-paving-v1:millos-authored-village-windows-v8'
  );
  night.value = 0;
  expect(material.customProgramCacheKey()).toBe(
    'millos-castle-paving-v1:millos-authored-village-windows-v8'
  );
  material.dispose();
});

it('pins the paving selector to the actual delivered slab, excluding its walls and underside', async () => {
  const doc = await new NodeIO().readBinary(
    new Uint8Array(readFileSync('public/models/village/castle.glb'))
  );
  const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const uv = p.getAttribute('TEXCOORD_0')!.getArray()!,
    positions = p.getAttribute('POSITION')!.getArray()!,
    normals = p.getAttribute('NORMAL')!.getArray()!;
  const [u0, v0, u1, v1] = CASTLE_PAVING_TILE;
  const top: number[] = [];
  for (let i = 0; i < uv.length / 2; i++) {
    if (uv[i * 2] <= u0 || uv[i * 2] >= u1 || uv[i * 2 + 1] <= v0 || uv[i * 2 + 1] >= v1) continue;
    if (normals[i * 3 + 1] >= 0.99 && positions[i * 3 + 1] >= 3.18) top.push(i);
  }
  expect(top).toHaveLength(4);
  for (const i of top) expect(positions[i * 3 + 1]).toBeCloseTo(3.2, 6);
  for (const axis of [0, 2]) {
    expect(Math.min(...top.map((i) => positions[i * 3 + axis]))).toBeCloseTo(-15.925, 5);
    expect(Math.max(...top.map((i) => positions[i * 3 + axis]))).toBeCloseTo(15.925, 5);
  }
});

it('shares the forge schedule and confines coal emission to the delivered firebox', async () => {
  const material = new THREE.MeshStandardMaterial();
  applyForgeWindows(material);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader:
      '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(material.customProgramCacheKey()).toContain('millos-authored-village-windows-v8');
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  material.dispose();
  expect(shader.uniforms.forgeHeat).toBe(FORGE_HEAT_LEVEL);
  expect(shader.uniforms.forgeHeatStrength).toBe(FORGE_HEAT_STRENGTH);
  expect(shader.fragmentShader).toContain('forgeHeat * forgeHeatStrength');
  expect(shader.vertexShader).toContain('vForgePosition = position');
  const doc = await new NodeIO().read('public/models/village/forge.glb');
  const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const positions = primitive.getAttribute('POSITION')!.getArray()!;
  const uv = primitive.getAttribute('TEXCOORD_0')!.getArray()!;
  const selected = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3],
      y = positions[i * 3 + 1],
      z = positions[i * 3 + 2];
    if (
      x >= -0.89 &&
      x < 0.09 &&
      y >= 0.817 &&
      y < 1.376 &&
      z >= 2.425 &&
      z < 2.435 &&
      uv[i * 2] >= 0.5 &&
      uv[i * 2] < 0.75 &&
      uv[i * 2 + 1] < 0.25
    )
      selected.push(i);
  }
  expect(selected.length).toBeGreaterThan(0);
  for (const i of selected) expect(positions[i * 3 + 2]).toBeCloseTo(2.429119, 5);
  const source = readFileSync('src/components/VillageArea.tsx', 'utf8');
  expect(source).toContain("if (kind === 'forge') FORGE_HEAT_LEVEL.value = level");
});

it('finishes only the actual boat paint slots, filtering detail without changing cabin lighting', async () => {
  const shader = compile(applyBoatPortholes);
  expect(shader.uniforms.boatPaintStrength).toBe(BOAT_PAINT_STRENGTH);
  expect(shader.fragmentShader).toContain('paintMetres.x * 33.07');
  expect(shader.fragmentShader).toContain('fwidth(paintMetres.x)');
  expect(shader.fragmentShader).toContain(
    'roughnessFactor + (0.035 + brushLay * 0.018) * paintStrength'
  );
  const doc = await new NodeIO().read('public/models/world/canal-boat.glb');
  const uv = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('TEXCOORD_0')!;
  const selected = new Set([4, 5, 14, 15]);
  let paint = 0,
    excluded = 0;
  for (let i = 0; i < uv.getCount(); i++) {
    const [u, v] = uv.getElement(i, []);
    const slot = Math.floor(u * 4) + Math.floor(v * 4) * 4;
    if (selected.has(slot)) paint++;
    else excluded++;
  }
  expect(paint).toBe(932);
  expect(excluded).toBeGreaterThan(10000);
  for (const protectedSlot of [0, 3, 6, 10]) expect(selected.has(protectedSlot)).toBe(false);
  const source = readFileSync('src/components/models/GeneratedBoatModel.tsx', 'utf8');
  expect(source).not.toMatch(/TextureLoader|<(?:pointLight|spotLight)|useFrame/);
  expect(source).toContain("'millos-authored-boat-portholes-v7'");
});

it('binds fabric-only filtered linen by reference, retaining room, glazing and light contracts', () => {
  const shader = compile(applyVillageWindows);
  expect(shader.uniforms.villageFabricStrength).toBe(VILLAGE_FABRIC_STRENGTH);
  expect(VILLAGE_FABRIC_STRENGTH.value).toBe(1);
  expect(shader.uniforms.villageInteriorStrength).toBe(VILLAGE_INTERIOR_STRENGTH);
  const source = shader.fragmentShader;
  expect(source.indexOf('float weaveDetail')).toBeLessThan(source.indexOf('if (glazing >'));
  expect(source).toContain('mix(0.16, 0.12, fabric)');
  expect(source).toContain('mix(0.06, 0.04, fabric)');
  expect(source).toContain('fabric * (weave - 0.13 * hem)');
  expect(source).toContain('mix(roomColour, linen, clamp(curtain, 0.0, 1.0))');
  expect(source).toContain('float occupied = step(0.22, seed)');
  expect(source).toContain('float roomScale = step(0.5, min(length(worldU), length(worldV)))');
  expect(source).toContain('roomEmission *= mix(1.0, 2.5, villageCivic)');
});

it('confines leaded palace framing and panelled rooms to castle glass, with retained dimmer and depth', () => {
  for (const glazing of ['glass', 'amber', 'pane', 'stained', 'civic', 'castle'] as const) {
    const material = new THREE.MeshStandardMaterial(),
      night = { value: 0 };
    applyVillageWindows(material, night, true, glazing);
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.villageNight).toBe(night);
    expect(shader.uniforms.villagePalace.value).toBe(glazing === 'castle' ? 1 : 0);
    expect(shader.uniforms.villageInteriorStrength).toBe(VILLAGE_INTERIOR_STRENGTH);
    expect(shader.fragmentShader).toContain('if (villagePalace > 0.5)');
    expect(shader.fragmentShader).toContain('smoothstep(0.025, 0.065, palacePixel)');
    expect(shader.fragmentShader).toContain('villageInteriorStrength * roomScale');
    expect(shader.fragmentShader).toContain('pane - viewSlope * 0.22');
    expect(shader.fragmentShader).toContain('pane - viewSlope * 0.035');
    if (glazing !== 'castle') {
      expect(shader.uniforms.villageLinen.value.getHexString()).toBe('e6d6b9');
      expect(shader.uniforms.villageRoomLight.value.r).toBeCloseTo(
        new THREE.Color('#ffe0b5').r * 0.62,
        8
      );
    }
    material.dispose();
  }
});

it('reuses shallow rooms only inside measured farm apertures, retaining painted joinery and a live dimmer', () => {
  for (const kind of ['farmhouse', 'barn'] as const) {
    const shader = compile((material, night) => applyFarmWindows(material, kind, night));
    expect(shader.uniforms.farmInteriorStrength).toBe(FARM_INTERIOR_STRENGTH);
    expect(shader.uniforms.villageCurtains.value).toBe(kind === 'farmhouse' ? 1 : 0);
    expect(shader.uniforms.villageAtlas.value).toBe(0);
    expect(shader.fragmentShader).toContain('float occupied = 1.0;');
    expect(shader.fragmentShader).toContain('farmInteriorStrength * (1.0 - reflection');
    if (kind === 'farmhouse') {
      expect(shader.vertexShader).toContain('vFarmPosition = position');
      expect(shader.fragmentShader).toContain('step(0.37, abs(vFarmPosition.z))');
      expect(shader.fragmentShader).toContain('step(0.38, vFarmPosition.x)');
      expect(shader.fragmentShader).toContain(
        'glazing = aperture * recess * darkGlass * farmInteriorStrength'
      );
      expect(shader.fragmentShader).toContain('diffuseColor.g - diffuseColor.r');
      expect(shader.fragmentShader).toContain('(horizontal - low) / (high - low)');
    } else {
      expect(shader.fragmentShader).toContain('step(0.360, vFarmPosition.z)');
      expect(shader.fragmentShader).toContain('1.0 - step(0.375, vFarmPosition.z)');
    }
  }
  const material = new THREE.MeshStandardMaterial();
  applyFarmWindows(material, 'farmhouse');
  expect(material.userData.farmInteriorStrength).toBe(FARM_INTERIOR_STRENGTH);
  expect(material.customProgramCacheKey()).toBe('millos-farm-window-farmhouse-v1');
  applyFarmWindows(material, 'barn');
  expect(material.customProgramCacheKey()).toBe('millos-farm-window-barn-v1');
  material.dispose();
});

it('matches the real farm recesses and keeps the original loft brace in front of its backing', async () => {
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { default: draco } = await import('draco3dgltf');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
  });
  const house = await io.read('public/models/farm/farmhouse.glb');
  const p = house.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION')!;
  // Measured dark-pane and protruding-joinery witnesses, not the village atlas.
  expect(p.getElement(1493, [])[2]).toBeCloseTo(0.4342, 4);
  expect(p.getElement(1499, [])[2]).toBeGreaterThan(0.439);
  expect(p.getElement(90, [])[2]).toBeCloseTo(-0.3835, 4);
  expect(p.getElement(83, [])[2]).toBeLessThan(-0.39);
  expect(p.getElement(3276, [])[0]).toBeCloseTo(0.3916, 4);
  expect(house.getRoot().listNodes()[0].getScale()[0]).toBeCloseTo(6.001156, 5);
  const barn = await io.read('public/models/farm/barn.glb');
  const primitive = barn.getRoot().listMeshes()[0].listPrimitives()[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
  );
  geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const hit = (x: number, y: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(
      mesh
    )[0].point.z;
  expect(hit(0, 0.05)).toBeCloseTo(0.369353, 5);
  expect(hit(0.07, -0.04)).toBeCloseTo(0.369291, 5);
  expect(hit(0, 0)).toBeGreaterThan(0.375); // Original X brace excludes itself by depth.
  expect(barn.getRoot().listNodes()[0].getScale()[0]).toBeCloseTo(10.007632, 5);
  geometry.dispose();
  material.dispose();
});

it('gives office panes a filtered room basis while retaining the exact old zero-strength response', () => {
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
    night = { value: 0.6 };
  const map = material.map;
  applyOfficeWindows(material, night);
  const source = THREE.ShaderLib.standard;
  const shader = {
    uniforms: THREE.UniformsUtils.clone(source.uniforms),
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.officeNight).toBe(night);
  expect(shader.uniforms.officeRoomLight.value.b).toBeGreaterThan(
    shader.uniforms.officeGlow.value.b * 4
  );
  expect(shader.fragmentShader).toContain('vec3 roomEmission = officeRoomLight');
  expect(shader.uniforms.officeInteriorStrength).toBe(OFFICE_INTERIOR_STRENGTH);
  expect(material.userData.officeInteriorStrength).toBe(OFFICE_INTERIOR_STRENGTH);
  expect(material.map).toBe(map);
  expect(shader.fragmentShader).toContain(
    'diffuseColor.rgb = mix(diffuseColor.rgb, officeGlass, officeWindow)'
  );
  expect(shader.fragmentShader).toContain('totalEmissiveRadiance += officeGlow * officeWindow');
  expect(shader.fragmentShader).toContain('if (officeStrength > 0.0 && officeMask > 0.5');
  expect(shader.fragmentShader).toContain(
    '(roomEmission - officeGlow * officeWindow) * officeStrength'
  );
  expect(shader.fragmentShader).toContain(
    'officeGlazing(diffuseColor.rgb) * clamp(officeInteriorStrength'
  );
  expect(shader.fragmentShader.indexOf('dFdx(pane)')).toBeLessThan(
    shader.fragmentShader.indexOf('if (officeStrength > 0.0')
  );
  expect(shader.fragmentShader).toContain('vec2 room = pane - slope * 0.20');
  expect(shader.fragmentShader).toContain('vec2 cloth = pane - slope * 0.025');
  expect(shader.fragmentShader).toContain('smoothstep(0.008, 0.025, officePixel)');
  const key = material.customProgramCacheKey();
  OFFICE_INTERIOR_STRENGTH.value = 0;
  try {
    expect(material.customProgramCacheKey()).toBe(key);
    expect(shader.uniforms.officeInteriorStrength.value).toBe(0);
  } finally {
    OFFICE_INTERIOR_STRENGTH.value = 1;
  }
  expect(key).toBe('millos-generated-office-window-v3');
  material.dispose();
  map!.dispose();
});

it('calibrates office room coordinates to actual retained blue facade triangles and excludes non-glazing', async () => {
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { default: draco } = await import('draco3dgltf');
  const { default: sharp } = await import('sharp');
  const doc = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() })
    .read('public/models/world/small-office.glb');
  const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0],
    pos = primitive.getAttribute('POSITION')!,
    uv = primitive.getAttribute('TEXCOORD_0')!,
    indices = primitive.getIndices()!;
  const { data, info } = await sharp(primitive.getMaterial()!.getBaseColorTexture()!.getImage()!)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = (p: number[], c: THREE.Color) =>
    Math.abs(p[0]) >= 0.095 &&
    p[1] >= -0.16 &&
    p[1] < 0.14 &&
    p[2] >= 0.3 &&
    c.b - c.r >= 0.055 &&
    c.g - c.r >= 0.035;
  const bays = new Set<number>();
  let selected = 0;
  for (let f = 0; f < indices.getCount(); f += 3) {
    const p = [0, 0, 0],
      t = [0, 0];
    for (let j = 0; j < 3; j++) {
      const i = indices.getScalar(f + j),
        a = pos.getElement(i, []),
        b = uv.getElement(i, []);
      a.forEach((v, k) => (p[k] += v / 3));
      b.forEach((v, k) => (t[k] += v / 3));
    }
    const x = Math.min(info.width - 1, Math.floor(t[0] * info.width)),
      y = Math.min(info.height - 1, Math.floor(t[1] * info.height)),
      o = (y * info.width + x) * 4;
    const c = new THREE.Color().setRGB(
      data[o] / 255,
      data[o + 1] / 255,
      data[o + 2] / 255,
      THREE.SRGBColorSpace
    );
    if (!mask(p, c)) continue;
    const bay = p[0] < 0 ? 0 : 1,
      u = (p[0] - OFFICE_PANE_LAYOUT.centres[bay]) / OFFICE_PANE_LAYOUT.width + 0.5,
      v = 1 - (p[1] - OFFICE_PANE_LAYOUT.bottom) / OFFICE_PANE_LAYOUT.height;
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThan(1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
    selected++;
    bays.add(bay);
  }
  expect(selected).toBe(15);
  expect(bays.size).toBe(2);
  const blue = new THREE.Color('#65a2b8');
  expect(mask([0, 0.04, 0.345], blue)).toBe(false);
  expect(mask([0.2, 0.24, 0.345], blue)).toBe(false);
  expect(mask([0.2, 0.04, -0.345], blue)).toBe(false);
  expect(mask([0.2, 0.04, 0.345], new THREE.Color('#aaa79e'))).toBe(false);
});

it('composes a facade finish on the apartments without losing their window shader', () => {
  const material = new THREE.MeshStandardMaterial();
  applyApartmentWindows(material, { value: 1 }, 4);
  applyApartmentFacade(material);
  expect(hasWorldSurface(material)).toBe(true);
  expect(material.userData.millosWorldSurfaceComposed).toBe(true);
  expect(material.customProgramCacheKey()).toBe(
    `${APARTMENT_FACADE_CACHE_KEY}_${WORLD_SURFACE_CACHE_KEY}`
  );
  const lib = THREE.ShaderLib.physical;
  const shader = {
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  // Both injections are present, and the finish runs BEFORE the window code,
  // whose glazing mask reads a chroma ratio a tonal scale cannot change.
  expect(shader.fragmentShader).toContain('roomHeight');
  expect(shader.fragmentShader).toContain('surfMacro');
  expect(shader.fragmentShader.indexOf('surfMacro')).toBeLessThan(
    shader.fragmentShader.indexOf('float roomHeight')
  );
  // Ledge dust is the term that separates the storeys; grime stays below the door glass.
  const mask = (shader.uniforms.uSurfMask.value as THREE.Vector4).toArray();
  expect(mask[1]).toBeGreaterThan(0.15);
  expect((shader.uniforms.uSurfSpan.value as THREE.Vector4).y).toBeLessThanOrEqual(1.2);
  material.dispose();
});
