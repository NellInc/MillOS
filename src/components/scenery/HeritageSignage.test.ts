// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import * as THREE from 'three';
import {
  createSignMaterial,
  createEnamelGeometry,
  HERITAGE_LETTERING_FONT,
  HERITAGE_PRINT_ART,
  BUSINESS_BRANDS,
  transportBrandForCompany,
  heritagePrintSize,
} from './HeritageSignage';
import {
  PUB_SIGN_LAMPS,
  PUB_DOOR_LAMPS,
  CIVIC_ENTRY_LAMPS,
  CIVIC_ENTRY_SOURCE,
  CIVIC_ENTRY_LANTERN_GEOMETRY,
} from './VillageSignage';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

describe('delivered heritage print', () => {
  for (const [name, width, height] of [
    ['dead-dino', 1024, 683],
    ['wheat-sheaf', 512, 512],
  ] as const) {
    it(`${name} is compact, alpha-masked colour artwork`, async () => {
      const bytes = readFileSync(`public/textures/signage/${name}.webp`);
      expect(bytes.byteLength).toBeLessThan(60000);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([width, height, 4]);
      for (const index of [0, width - 1, width * (height - 1), width * height - 1]) {
        expect(data[index * 4 + 3]).toBe(0);
      }
      let covered = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] >= 128) covered++;
      expect(covered / (width * height)).toBeGreaterThan(0.15);
      expect(covered / (width * height)).toBeLessThan(0.65);
    });
  }

  it('backlights shelter and pylon artwork without changing the trailer print', () => {
    const print = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    expect(print).toContain('THREE.SRGBColorSpace');
    expect(print).toContain('alphaTest: map ? 0.5 : 0');
    expect(print).toContain('EXTERIOR_LAMP_LEVEL.value * 0.85');
    expect(print.match(/userData=\{\{ noStaticBatch: true \}\}/g)).toHaveLength(3);
    expect(print).toContain('backlit = false');
    expect(print).toContain('material.dispose()');
    expect(print).not.toContain('<meshBasicMaterial');
    expect(print).not.toContain('transparent');
    expect(print.match(/surface="painted"/g)).toHaveLength(1);
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(exterior).toContain('side * 0.04');
    expect(exterior).toContain("brand={end === -1 ? 'flour' : 'dino'}");
    expect(exterior).not.toContain('DeadDinoAdvertRelief');
    const trucks = readFileSync('src/components/truckbay/OptimizedTruckBay.tsx', 'utf8');
    expect(trucks).toContain("useTexture(BUSINESS_BRANDS[brand ?? 'mill'].primary)");
    expect(trucks).toContain('artwork.image as CanvasImageSource');
    expect(trucks).toContain('transportBrandForCompany(company)');
  });

  it('seats both trailer panels outside the accent strip that previously obscured them', () => {
    const source = readFileSync('src/components/truckbay/OptimizedTruckBay.tsx', 'utf8');
    const panels = [
      ...source.matchAll(
        /name="trailer-identity-(?:left|right)"\s+position=\{\[(-?[\d.]+), 2.55, -5.65\]\}/g
      ),
    ];
    expect(panels).toHaveLength(2);
    for (const panel of panels)
      expect(Math.abs(Number(panel[1])) - 0.035 / 2).toBeGreaterThan(1.3 + 0.06 / 2);
    expect(source.match(/scale=\{\[8.2, 2.05, 0.035\]\}/g)).toHaveLength(2);
    expect(source.match(/scale=\{\[0.06, 0.56, 9.6\]\}/g)).toHaveLength(2);
  });

  it('restores distinct shop identities and removes the obsolete school burial', () => {
    const village = readFileSync('src/components/VillageArea.tsx', 'utf8');
    expect(village).toContain('<VillageShopSign trade={signText} />');
    const signs = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
    expect(signs).toContain("trade ?? 'VILLAGE SHOP'");
    expect(signs).toContain('maxWidth={textWidth}');
    for (const sign of ['BAKER', 'BUTCHER', 'GENERAL STORE'])
      expect(village).toContain(`signText="${sign}"`);
    expect(village).toContain(
      '<GeneratedBody asset="school" fallback={<SchoolPrimitiveBody />} />'
    );
    expect(village).not.toContain('asset="school" sink=');
  });
});

describe('sign lightbox materials', () => {
  it('uses the actual artwork for emission, preserving its colours and alpha mask', () => {
    const texture = new THREE.Texture();
    const material = createSignMaterial('#ffffff', texture);
    expect(material.map).toBe(texture);
    expect(material.emissiveMap).toBe(texture);
    expect(material.alphaTest).toBe(0.5);
    expect(material.transparent).toBe(false);
    expect(material.emissiveIntensity).toBe(0);
    material.dispose();
    texture.dispose();
  });

  it('keeps dark lettering distinct from cream lightbox backgrounds', () => {
    const ink = createSignMaterial('#254b3c');
    const paper = createSignMaterial('#efe3c7');
    expect(ink.emissive.equals(ink.color)).toBe(true);
    expect(paper.emissive.equals(paper.color)).toBe(true);
    expect(paper.emissive.g / ink.emissive.g).toBeGreaterThan(8);
    expect(paper.alphaTest).toBe(0);
    expect(paper.emissiveMap).toBe(null);
    ink.dispose();
    paper.dispose();
  });

  it('scopes dimmed backlit lettering to the three shop fascias', () => {
    const source = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
    expect(source).toContain('illuminated = false');
    expect(source).toContain('illuminated ? IlluminatedSignText : SceneText');
    expect(source).toContain('backlit={illuminated}');
    expect(source.match(/userData=\{\{ noStaticBatch: illuminated \}\}/g)).toHaveLength(4);
    expect(source).toMatch(/width=\{5\.24\}\s+illuminated/);
    expect(source).not.toMatch(/<(?:pointLight|spotLight|rectAreaLight)/);
    expect(source).not.toContain('meshBasicMaterial');
  });

  it('illuminates both canopy wordmarks and the shop sign through the same dimmer', () => {
    const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
    expect(station).toContain('name={`station-canopy-wordmark-${side}`}');
    expect(station).toContain('name="station-shop-wordmark"');
    expect(station.match(/<IlluminatedSignText/g)).toHaveLength(1);
    expect(station).toContain('<BusinessBrandMark brand="dino" variant="fascia"');
    const print = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    expect(print).not.toMatch(/<(?:pointLight|spotLight|rectAreaLight)/);
  });
});

it('seats three bounded pub sign lamps above paint, without backlighting civic lettering', () => {
  expect(PUB_SIGN_LAMPS.map((lamp) => lamp.id)).toEqual([
    'fascia',
    'hanging-front',
    'hanging-back',
  ]);
  for (const lamp of PUB_SIGN_LAMPS) {
    expect(lamp.position.every(Number.isFinite)).toBe(true);
    expect(lamp.position[1]).toBeGreaterThan(lamp.id === 'fascia' ? 4.15 : 4.175);
    expect(lamp.distance).toBeLessThanOrEqual(3.2);
  }
  const source = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
  expect(source).toContain('intensity={disabled ? 0 : lamp.intensity}');
  expect(source).toContain('material={EXTERIOR_LAMP_LENS_MATERIAL}');
  const helper = readFileSync('src/components/exterior/ExteriorLighting.tsx', 'utf8').split(
    'export const ExteriorDownlight:'
  )[1];
  expect(helper).toContain('castShadow={false}');
  expect(helper).toContain('pointLights.delete(registration)');
  const village = readFileSync('src/components/VillageArea.tsx', 'utf8');
  expect(village.match(/<PubSignLighting/g)).toHaveLength(1);
});

it('lights the retained pub door optics and threshold without adding a fixture or caster', async () => {
  const primitive = (await new NodeIO().read('public/models/village/pub.glb'))
    .getRoot()
    .listMeshes()[0]
    .listPrimitives()[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray() as Float32Array, 3)
  );
  geometry.setIndex(
    new THREE.BufferAttribute(primitive.getIndices()!.getArray() as Uint16Array, 1)
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material);
  for (const lamp of PUB_DOOR_LAMPS) {
    const source = new THREE.Vector3(...lamp.position);
    const optic = new THREE.Raycaster(source, new THREE.Vector3(0, 0, -1), 0, 0.05).intersectObject(
      mesh
    )[0];
    expect(optic?.point.z).toBeCloseTo(3.4635, 4);
    const threshold = new THREE.Vector3(Math.sign(source.x) * 0.65, 0.14, 3.4);
    const direction = threshold.clone().sub(source);
    expect(direction.length()).toBeLessThan(lamp.distance);
    const seat = new THREE.Raycaster(
      source,
      direction.normalize(),
      0,
      lamp.distance
    ).intersectObject(mesh)[0];
    expect(seat?.point.y).toBeCloseTo(0.15960975, 5);
    expect(seat?.point.distanceTo(threshold)).toBeLessThan(0.021);
  }
  const source = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
  expect(source).toContain("s.graphics.quality !== 'low'");
  expect(source).toContain('!s.graphics.perfDebug.disablePunctualLights');
  expect(source).toContain('!s.graphics.perfDebug.disableLightingPolish');
  expect(source).toContain('name={`pub-door-lamp:${lamp.id}`}');
  geometry.dispose();
  material.dispose();
});

it('seats civic lanterns on delivered masonry and leaves their threshold beams unobstructed', async () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const fixture = new THREE.Mesh(CIVIC_ENTRY_LANTERN_GEOMETRY, material);
  const source = new THREE.Vector3(...CIVIC_ENTRY_SOURCE);
  expect(
    new THREE.Raycaster(source, new THREE.Vector3(0, -1, 0), 0, 4.4).intersectObject(fixture)
  ).toHaveLength(0);
  for (const building of ['church', 'school'] as const) {
    const primitive = (await new NodeIO().read(`public/models/village/${building}.glb`))
      .getRoot()
      .listMeshes()[0]
      .listPrimitives()[0];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray() as Float32Array, 3)
    );
    geometry.setIndex(
      new THREE.BufferAttribute(primitive.getIndices()!.getArray() as Uint16Array, 1)
    );
    const mesh = new THREE.Mesh(geometry, material);
    for (const lamp of CIVIC_ENTRY_LAMPS[building]) {
      const mount = new THREE.Vector3(...lamp.mount);
      const wall = new THREE.Raycaster(
        mount.clone().add(new THREE.Vector3(0, 0, 0.08)),
        new THREE.Vector3(0, 0, -1),
        0,
        0.14
      ).intersectObject(mesh)[0];
      expect(wall).toBeDefined();
      expect(Math.abs(wall.point.z - mount.z)).toBeLessThan(0.0325);
      const origin = mount.clone().add(source);
      const threshold = new THREE.Vector3(
        0,
        building === 'church' ? 0.188 : 0.14988,
        building === 'church' ? 6.25 : 3.8
      );
      const direction = threshold.clone().sub(origin);
      expect(direction.length()).toBeLessThan(lamp.distance);
      const hit = new THREE.Raycaster(
        origin,
        direction.normalize(),
        0,
        lamp.distance
      ).intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(hit.point.distanceTo(threshold)).toBeLessThan(0.025);
      fixture.position.copy(mount);
      fixture.updateMatrixWorld();
      expect(
        new THREE.Raycaster(origin, direction, 0, lamp.distance).intersectObject(fixture)
      ).toHaveLength(0);
    }
    geometry.dispose();
  }
  material.dispose();
});

it('uses a bounded warm route board and the actual mounted transit controller', () => {
  const source = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
  expect(source).toContain('name="bus-service-board"');
  expect(source).toContain('community-autonomous-village-bus');
  expect(source).toContain('source.userData.communityServiceOpen');
  expect(source).toContain('source.userData.communityDoorsOpen');
  expect(source).toContain('if (value !== last.current)');
  expect(source).toContain('boxGeometry args={[0.88, 1.12, 0.055]}');
  expect(source).toContain('art="route"');
  const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  expect(exterior).toContain('<TransitServiceBoard />');
  expect(exterior).not.toContain('BUS_TIMETABLE_INK_MATERIAL');
});

it('gives enamel keylines real rounded holes without covering the measured print', () => {
  const geometry = createEnamelGeometry(0.73, 0.96, 0.055, 0.009);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.min.x).toBeCloseTo(-0.365, 5);
  expect(geometry.boundingBox!.max.y).toBeCloseTo(0.48, 5);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material);
  const hits = (x: number, y: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(
      mesh
    );
  expect(hits(0, 0)).toHaveLength(0);
  expect(hits(0.362, 0)).toHaveLength(1);
  expect(hits(0.364, 0.479)).toHaveLength(0);
  geometry.dispose();
  material.dispose();
});

it('coordinates existing illustrated identities while retaining plain service text', () => {
  expect(HERITAGE_LETTERING_FONT).toContain('fonts/MedievalSharp.ttf');
  const print = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
  expect(print).toContain('name="bus-route-raster-print"');
  expect(print).toContain('art={brand}');
  expect(print).toContain('variant="pylon"');
  expect(print).toContain('width={3.7}');
  expect(print).toContain('height={4.7}');
  expect(
    print.split('name="bus-service-notice"')[1].split('</IlluminatedSignText>')[0]
  ).not.toContain('font=');
  expect(print).toContain('material.dispose()');
  const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
  expect(station).toContain('width={4.4} height={0.28}');
  expect(station).toContain('position={[0, 4.64, side * 6.28]}');
});

describe('painted raster sign family', () => {
  it('ships all six reviewed compact raster prints with matching provenance and no lost padding', async () => {
    const provenance = JSON.parse(
      readFileSync('public/textures/signage/PROVENANCE.json', 'utf8')
    ).rasterPrints;
    expect(provenance.assets).toHaveLength(6);
    let total = 0;
    for (const [kind, path] of Object.entries(HERITAGE_PRINT_ART)) {
      const bytes = readFileSync(`public/${path}`);
      const current = JSON.parse(readFileSync('public/textures/signage/PROVENANCE.json', 'utf8'));
      const asset = [
        ...provenance.assets,
        ...current.businessBrands.assets,
        ...current.stationPosterAndAppBrand.assets,
      ].find((a: { file: string }) => path.endsWith(`/${a.file}`));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([asset.width, asset.height]);
      expect(info.width).toBeLessThanOrEqual(2048);
      expect(info.height).toBeLessThanOrEqual(1536);
      expect(bytes.byteLength).toBeLessThan(
        kind === 'flour' || kind === 'dino' || kind === 'route' ? 700000 : 200000
      );
      let nonOpaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) nonOpaque++;
      expect(nonOpaque).toBe(0);
      if (['bakery', 'butcher', 'grocer'].includes(kind)) {
        expect(info.width / info.height).toBeGreaterThan(7.4);
        expect(info.width / info.height).toBeLessThan(9.5);
        for (const y of [0, info.height - 1]) {
          let light = 0;
          for (let x = 0; x < info.width; x++) {
            const i = (y * info.width + x) * 4;
            if (Math.min(data[i], data[i + 1], data[i + 2]) > 245) light++;
          }
          expect(light / info.width).toBeLessThan(0.05);
        }
      }
      total += bytes.byteLength;
    }
    expect(total).toBeLessThan(2200000);
  });
  it('contains every image in its existing seat without stretching its aspect', () => {
    for (const [w, h, iw, ih] of [
      [1.4, 2, 1049, 1499],
      [3.7, 4.7, 1049, 1499],
      [0.78, 1.02, 1097, 1434],
      [5.04, 0.56, 2027, 267],
      [5.04, 0.56, 2021, 247],
      [5.04, 0.56, 2048, 221],
    ]) {
      const [width, height] = heritagePrintSize(w, h, iw, ih);
      expect(width).toBeLessThanOrEqual(w);
      expect(height).toBeLessThanOrEqual(h + 1e-12);
      expect(width / height).toBeCloseTo(iw / ih, 10);
    }
  });
  it('uses one complete print on ads/fascias, with only live transit text remaining separate', () => {
    const source = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    const posters = source.slice(
      source.indexOf('export function HeritagePoster'),
      source.indexOf('export function DeadDinoPylonFace')
    );
    expect(posters).not.toContain('IlluminatedSignText');
    expect(posters).not.toContain('HeritageEmblem');
    expect(source).toContain('url={HERITAGE_PRINT_ART[art]}');
    expect(source).toContain('const texture = useTexture(url)');
    expect(source).toContain("useSignMaterial('#ffffff', texture, backlit)");
    expect(source).toContain('userData={{ noStaticBatch: backlit, heritagePrint: printId }}');
    const shops = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
    expect(shops).toContain('art ? (');
    expect(shops).toContain('<HeritageRasterPrint');
    expect(shops).toContain("trade === 'GENERAL STORE'");
    for (const path of Object.values(HERITAGE_PRINT_ART)) expect(path).toMatch(/\.webp$/);
  });
});

describe('distinct world business brands', () => {
  it('keeps seven unique identities and binds only the actual transport companies', () => {
    const names = Object.values(BUSINESS_BRANDS).map((brand) => brand.name);
    expect(names).toEqual([
      'DEAD DINO',
      'Riverside Bakers',
      'Fieldgate Butchers',
      'Canalside Provisions',
      'MillOS',
      'FLOUR EXPRESS',
      'GRAIN CO',
    ]);
    expect(new Set(Object.values(BUSINESS_BRANDS).map((brand) => brand.primary)).size).toBe(7);
    expect(transportBrandForCompany('FLOUR EXPRESS')).toBe('flourExpress');
    expect(transportBrandForCompany('GRAIN CO')).toBe('grainCo');
    for (const name of ['', 'OTHER CARRIER', 'MillOS', 'Grain Co'])
      expect(transportBrandForCompany(name)).toBeNull();
  });

  it('ships opaque, compact brand/sign variants and the revised poster with matching provenance', async () => {
    const provenance = JSON.parse(readFileSync('public/textures/signage/PROVENANCE.json', 'utf8'));
    const assets = provenance.businessBrands.assets;
    const currentAssets = [...assets, ...provenance.stationPosterAndAppBrand.assets];
    expect(assets).toHaveLength(13);
    let total = 0;
    for (const asset of assets) {
      const bytes = readFileSync(`public/textures/signage/${asset.file}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([asset.width, asset.height]);
      expect(info.width).toBeLessThanOrEqual(2048);
      expect(info.height).toBeLessThanOrEqual(1536);
      let nonOpaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) nonOpaque++;
      expect(nonOpaque).toBe(0);
      total += bytes.byteLength;
    }
    expect(total).toBeLessThan(1500000);
    for (const brand of Object.values(BUSINESS_BRANDS)) {
      for (const url of [brand.primary, brand.fascia])
        expect(currentAssets.some((a: { file: string }) => url.endsWith(`/${a.file}`))).toBe(true);
    }
    expect(BUSINESS_BRANDS.dino.pylon).toContain('pylon-v3.webp');
    expect(HERITAGE_PRINT_ART.dino).toContain('dino-painted-v3.webp');
  });

  it('fits the new portrait and narrow raster signs without clipping or stretching', async () => {
    for (const [url, w, h] of [
      [BUSINESS_BRANDS.dino.pylon, 3.7, 4.7],
      [BUSINESS_BRANDS.dino.fascia, 4.4, 0.28],
      [BUSINESS_BRANDS.bakery.fascia, 5.04, 0.72 * 0.51],
      [BUSINESS_BRANDS.butcher.fascia, 5.04, 0.72 * 0.51],
      [BUSINESS_BRANDS.grocer.fascia, 5.04, 0.72 * 0.51],
    ] as const) {
      const image = await sharp(readFileSync(`public/${url}`)).metadata();
      const [width, height] = heritagePrintSize(w, h, image.width!, image.height!);
      expect(width).toBeLessThanOrEqual(w);
      expect(height).toBeLessThanOrEqual(h + 1e-12);
      expect(width / height).toBeCloseTo(image.width! / image.height!, 10);
    }
    expect(4.64 + 0.28 / 2).toBeLessThan(4.8);
    expect(4.64 - 0.28 / 2).toBeGreaterThan(4.43 + 0.045 / 2);
    expect(0.72 * 0.085 - (0.72 * 0.51) / 2).toBeGreaterThan(-0.72 * 0.235 + (0.72 * 0.12) / 2);
  });

  it('wraps the MillOS bitmap outward around the silo and retains trailer plate ownership', () => {
    const radius = 14.1,
      width = 6,
      height = (width * 379) / 1536;
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      height,
      32,
      1,
      true,
      -width / radius / 2,
      width / radius
    );
    const positions = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal');
    for (let i = 0; i < positions.count; i++) {
      expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeCloseTo(radius, 5);
      expect(
        positions.getX(i) * normals.getX(i) + positions.getZ(i) * normals.getZ(i)
      ).toBeGreaterThan(14);
    }
    geometry.dispose();
    const trucks = readFileSync('src/components/truckbay/OptimizedTruckBay.tsx', 'utf8');
    expect(trucks).toContain('heritagePrintSize(910, 162, image.width, image.height)');
    expect(trucks).toContain('MILL LOGISTICS  •  ${plateNumber}');
    expect(trucks).toContain('context.fillText(company, 78, 112)');
    expect(trucks).toContain('material.dispose()');
    expect(trucks).toContain('texture.dispose()');
    expect(trucks).not.toContain('emissiveMap');
    const signs = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    expect(signs).toContain('size[0] / surfaceRadius');
    expect(signs).toContain('-angle / 2,');
  });
});

it('delivers the corrected dark-eye artwork and square MillOS application mark', async () => {
  const assets = JSON.parse(readFileSync('public/textures/signage/PROVENANCE.json', 'utf8'))
    .stationPosterAndAppBrand.assets;
  expect(assets).toHaveLength(5);
  for (const asset of assets) {
    const bytes = readFileSync(`public/textures/signage/${asset.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([asset.width, asset.height]);
    let nonOpaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) nonOpaque++;
    expect(nonOpaque).toBe(0);
  }
  const icon = await sharp(readFileSync('public/textures/signage/millos-mark-v1.webp')).metadata();
  expect([icon.width, icon.height]).toEqual([256, 256]);
  const favicon = await sharp(
    readFileSync('public/textures/signage/millos-mark-v1.png')
  ).metadata();
  expect([favicon.width, favicon.height]).toEqual([64, 64]);
});
