import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  applyOfficeWindows,
  applyApartmentWindows,
  applyVillageWindows,
  VILLAGE_INTERIOR_STRENGTH,
} from './GeneratedOfficeModel';
import { applyBoatPortholes } from './GeneratedBoatModel';
import { applyLampLens, LAMP_LENS_HEIGHTS } from './GeneratedLampModel';
import { EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';
import { WORKSHOP_GLAZING } from '../TruckBay';

function compile(apply: (material: THREE.MeshStandardMaterial, night: { value: number }) => void) {
  const material = new THREE.MeshStandardMaterial();
  const night = { value: 1 };
  apply(material, night);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <emissivemap_fragment>',
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

it('binds the actual shared workshop glass to pane rooms without domestic curtains', () => {
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <emissivemap_fragment>',
  } as Parameters<typeof WORKSHOP_GLAZING.onBeforeCompile>[0];
  WORKSHOP_GLAZING.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(WORKSHOP_GLAZING.name).toBe('maintenance-workshop-glazing');
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(shader.uniforms.villageAtlas.value).toBe(0);
  expect(WORKSHOP_GLAZING.customProgramCacheKey()).toBe('millos-authored-village-windows-v4');
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
      fragmentShader: '#include <emissivemap_fragment>',
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
      fragmentShader: '#include <emissivemap_fragment>',
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
      fragmentShader: '#include <emissivemap_fragment>',
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
    fragmentShader: '#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(material.customProgramCacheKey()).toBe('millos-authored-village-windows-v4');
  material.dispose();
});

it('keeps church stained glass out of domestic room replacement', () => {
  const material = new THREE.MeshStandardMaterial();
  applyVillageWindows(material, { value: 1 }, false, 'stained');
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageCurtains.value).toBe(0);
  expect(shader.uniforms.villageRooms.value).toBe(0);
  expect(shader.fragmentShader).toContain('&& villageRooms > 0.5');
  expect(shader.fragmentShader).toContain(
    'mix(diffuseColor.rgb * 0.85, villageGlow, villageRooms)'
  );
  expect(shader.fragmentShader).toContain('glazing = max(stainedRow, roseTile)');
  expect(material.customProgramCacheKey()).toBe('millos-authored-village-windows-v4');
  material.dispose();
});

it('uses the castle glass tile and its delivered padding with the same room shader', () => {
  const material = new THREE.MeshStandardMaterial();
  applyVillageWindows(material, { value: 1 }, true, 'castle');
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <emissivemap_fragment>',
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.villageTileOrigin.value.toArray()).toEqual([0.75, 0.75]);
  expect(shader.uniforms.villagePaneUV.value.toArray()).toEqual([0.00375, 0.2425]);
  expect(shader.uniforms.villageRooms.value).toBe(1);
  expect(shader.uniforms.villageCurtains.value).toBe(1);
  expect(material.customProgramCacheKey()).toBe('millos-authored-village-windows-v4');
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
      fragmentShader: '#include <emissivemap_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.apartmentFloorLow.value.z).toBe(floors === 3 ? 0.01059 : 0.01663);
    expect(shader.uniforms.apartmentFloorHigh.value.z).toBe(floors === 3 ? 0.13193 : 0.13014);
    expect(material.customProgramCacheKey()).toBe('millos-generated-apartment-window-v3');
    material.dispose();
  }
});
