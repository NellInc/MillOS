// @vitest-environment node
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import {
  createSignMaterial,
  createEnamelGeometry,
  HERITAGE_LETTERING_FONT,
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
    expect(print.match(/surface="painted"/g)).toHaveLength(8);
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(exterior).toContain('side * 0.04');
    expect(exterior).toContain("brand={end === -1 ? 'flour' : 'dino'}");
    expect(exterior).not.toContain('DeadDinoAdvertRelief');
    const trucks = readFileSync('src/components/truckbay/OptimizedTruckBay.tsx', 'utf8');
    expect(trucks).toContain('useTexture(HERITAGE_ART.wheat)');
    expect(trucks).toContain('context.drawImage(badge, 790, 14)');
    expect(trucks).toContain("company === 'GRAIN CO'");
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
    expect(source.match(/userData=\{\{ noStaticBatch: illuminated \}\}/g)).toHaveLength(3);
    expect(source).toMatch(/width=\{5\.24\}\s+illuminated/);
    expect(source).not.toMatch(/<(?:pointLight|spotLight|rectAreaLight)/);
    expect(source).not.toContain('meshBasicMaterial');
  });

  it('illuminates both canopy wordmarks and the shop sign through the same dimmer', () => {
    const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
    expect(station).toContain('name={`station-canopy-wordmark-${side}`}');
    expect(station).toContain('name="station-shop-wordmark"');
    expect(station.match(/<IlluminatedSignText/g)).toHaveLength(2);
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
  expect(source).toContain("useSignMaterial('#efe3c7')");
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
  expect(print).toContain('name="bus-route-crest-field"');
  expect(print).toContain('name="heritage-flour-seal"');
  expect(print).toContain('name="dead-dino-pylon-keyline"');
  expect(print).toMatch(/kind="wheat"\s+width=\{0\.24\}/);
  expect(
    print.split('name="bus-service-notice"')[1].split('</IlluminatedSignText>')[0]
  ).not.toContain('font=');
  expect(print).toContain('geometry.dispose()');
  const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
  expect(station).toContain('maxWidth={4.4}');
  expect(station).toContain('font={HERITAGE_LETTERING_FONT}');
});
