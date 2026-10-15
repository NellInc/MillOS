import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import {
  getExteriorLampLevel,
  PICNIC_SHELTER_LIGHT,
  picnicShelterLightLayout,
  CANAL_CROSSING_LAMPS,
  CANAL_CROSSING_LIGHT,
  WEST_FACTORY_PATH,
  WEST_FACTORY_PATH_LAMPS,
  WEST_FACTORY_PATH_POOL_RADIUS,
} from './ExteriorLighting';
import {
  CANAL_FOOTBRIDGE_ACCESS,
  WORLD_REALM_PATHS,
  inRealmPath,
} from '../../constants/publicRealmLayout';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { LAMP_LENS_HEIGHTS } from '../models/GeneratedLampModel';

describe('exterior lamp schedule', () => {
  it('is fully lit at night and off at clear noon', () => {
    expect(getExteriorLampLevel(23, 'clear')).toBe(1);
    expect(getExteriorLampLevel(12, 'clear')).toBe(0);
  });

  it('fades smoothly at dawn and dusk', () => {
    expect(getExteriorLampLevel(6, 'clear')).toBe(1);
    expect(getExteriorLampLevel(18, 'clear')).toBe(1);
  });

  it('raises a daytime minimum in severe weather', () => {
    expect(getExteriorLampLevel(12, 'storm')).toBe(0.7);
  });
});

it('covers the existing west walk without poles in its two-metre paving', () => {
  expect(WEST_FACTORY_PATH_LAMPS).toHaveLength(7);
  for (const [x, y] of WEST_FACTORY_PATH_LAMPS) {
    expect(Math.abs(x - WEST_FACTORY_PATH.start[0])).toBeGreaterThan(
      WEST_FACTORY_PATH.width / 2 + 0.5
    );
    expect(y).toBe(0);
  }
  for (let z = WEST_FACTORY_PATH.end[2]; z <= WEST_FACTORY_PATH.start[2]; z += 0.5) {
    const nearest = Math.min(
      ...WEST_FACTORY_PATH_LAMPS.map(([x, , lampZ]) =>
        Math.hypot(x - WEST_FACTORY_PATH.start[0], lampZ - z)
      )
    );
    // Keep the whole centreline inside the useful inner part of the shared mask.
    expect(nearest / WEST_FACTORY_PATH_POOL_RADIUS).toBeLessThan(0.71);
  }
});

it('lights the site before sunset and fades continuously without a late switch', () => {
  expect(getExteriorLampLevel(17, 'clear')).toBeGreaterThan(0.4);
  expect(getExteriorLampLevel(17.5, 'clear')).toBeGreaterThan(0.9);
  for (let h = 16; h < 20; h += 1 / 60) {
    const delta = getExteriorLampLevel(h + 1 / 60, 'clear') - getExteriorLampLevel(h, 'clear');
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(0.02);
  }
  expect(getExteriorLampLevel(18 + 24, 'clear')).toBe(1);
});

it('puts both crossing lamps on dry banks, outside stairs and paths, with light inside the real optic', () => {
  const bridge = CANAL_FOOTBRIDGE_ACCESS;
  const canal = SITE_LAYOUT.exteriorFeatures.canal;
  expect(CANAL_CROSSING_LAMPS.map((l) => l.id)).toEqual(['west', 'east']);
  for (const {
    position: [x, y, z],
  } of CANAL_CROSSING_LAMPS) {
    for (const segments of [64, 128]) expect(sampleTerrainGroundHeight(x, z, segments)).toBe(0);
    expect(y).toBe(-0.02);
    expect(Math.abs(z - bridge.z) - 0.2 - 0.4).toBeGreaterThan(bridge.halfWidth);
    expect(WORLD_REALM_PATHS.some((path) => inRealmPath(x, z, path, 0.6))).toBe(false);
    // The shared ground-pool disk never floats over the actual inner water edge.
    expect(Math.abs(x - canal.position[0]) - CANAL_CROSSING_LIGHT.poolRadius).toBeGreaterThan(
      (canal.width - 1) / 2
    );
  }
  expect(CANAL_CROSSING_LIGHT.height).toBeGreaterThan(LAMP_LENS_HEIGHTS.victorian[0]);
  expect(CANAL_CROSSING_LIGHT.height).toBeLessThan(LAMP_LENS_HEIGHTS.victorian[1]);
});

it('attaches the picnic pendant to the actual delivered soffit and reaches both real tabletops', async () => {
  const read = async (asset: string) => {
    const doc = await new NodeIO().read(`public/models/world/${asset}.glb`);
    const group = new THREE.Group();
    for (const node of doc.getRoot().listNodes())
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const g = new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
        );
        if (primitive.getIndices()) g.setIndex(Array.from(primitive.getIndices()!.getArray()!));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        m.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
        group.add(m);
      }
    group.updateMatrixWorld(true);
    return group;
  };
  const roof = await read('brick-carport');
  roof.position.z = -2;
  roof.updateMatrixWorld(true);
  const layout = picnicShelterLightLayout(10, 3.5, 8),
    config = PICNIC_SHELTER_LIGHT;
  const source = new THREE.Vector3(...layout.source);
  const soffit = new THREE.Raycaster(source, new THREE.Vector3(0, 1, 0)).intersectObject(
    roof,
    true
  )[0].point.y;
  expect(soffit).toBeCloseTo(config.measuredSoffit, 6);
  expect(layout.cap[1] + 0.03).toBeGreaterThan(soffit);
  expect(layout.cap[1] - 0.03).toBeLessThan(soffit);
  expect(layout.stem[1] + layout.stemLength / 2).toBeCloseTo(layout.cap[1], 6);
  expect(layout.stem[1] - layout.stemLength / 2).toBeCloseTo(
    layout.housing[1] + config.housing.height / 2,
    6
  );
  expect(layout.lens[1] + config.lens.height / 2).toBeGreaterThan(
    layout.housing[1] - config.housing.height / 2
  );
  expect(layout.source[1]).toBeLessThan(layout.lens[1] - config.lens.height / 2);
  // The fallback roof's solid underside is3.5m; its buried hanger is harmless.
  expect(layout.housing[1] + config.housing.height / 2).toBeLessThan(3.5);
  expect(layout.cap[1] + 0.03).toBeLessThan(3.8);
  for (const x of [-2, 2]) {
    const table = await read('picnic-table');
    table.position.set(x, 0, -2);
    table.updateMatrixWorld(true);
    const top = new THREE.Raycaster(
      new THREE.Vector3(x + 0.1, 2, -1.9),
      new THREE.Vector3(0, -1, 0)
    ).intersectObject(table, true)[0].point;
    expect(top.y).toBeCloseTo(0.80289840698, 5);
    const direction = top.clone().sub(source),
      distance = direction.length();
    direction.normalize();
    expect(distance).toBeLessThan(config.distance);
    expect(-direction.y).toBeGreaterThan(Math.cos(1.24));
    const reach = new THREE.Raycaster(source, direction, 0, distance - 0.005);
    expect(reach.intersectObject(roof, true)).toHaveLength(0);
    expect(reach.intersectObject(table, true)).toHaveLength(0);
    const cutoff = (1 - (distance / config.distance) ** 4) ** 2;
    const incident = (config.intensity * cutoff * -direction.y) / (distance * distance);
    expect(incident).toBeGreaterThan(3);
    table.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
  roof.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
});

it('keeps the bounded picnic spill on paving and uses the existing quality, dimmer and shadow contract', () => {
  for (const [width, height, depth] of [
    [10, 3.5, 8],
    [8, 3.5, 6],
  ]) {
    const layout = picnicShelterLightLayout(width, height, depth);
    expect(layout.poolRadius * PICNIC_SHELTER_LIGHT.poolWidthScale).toBeLessThan(width / 2);
    expect(layout.poolRadius).toBeLessThan(depth / 2);
    expect(layout.pool[2]).toBe(-depth / 4);
    expect(layout.stemLength).toBeGreaterThan(0);
    expect(layout.source.every(Number.isFinite)).toBe(true);
  }
  expect(getExteriorLampLevel(12, 'clear') * PICNIC_SHELTER_LIGHT.intensity).toBe(0);
  expect(getExteriorLampLevel(22, 'clear') * PICNIC_SHELTER_LIGHT.intensity).toBe(76);
  const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const carport = source.slice(
    source.indexOf('const BrickCarport:'),
    source.indexOf('export function createGroundPathGeometry')
  );
  expect(carport.match(/name="picnic-shelter-downlight"/g)).toHaveLength(1);
  expect(carport).toContain("state.graphics.quality !== 'low'");
  expect(carport).toContain('!state.graphics.perfDebug.disablePunctualLights');
  expect(carport).toContain('!state.graphics.perfDebug.disableLightingPolish');
  expect(carport).toContain('<ExteriorDownlight');
  expect(carport).toContain('material={EXTERIOR_LAMP_LENS_MATERIAL}');
  expect(carport).not.toMatch(/<(?:spotLight|pointLight)|useFrame|TextureLoader/);
  const downlight = readFileSync('src/components/exterior/ExteriorLighting.tsx', 'utf8').split(
    'export const ExteriorDownlight:'
  )[1];
  expect(downlight).toContain('castShadow={false}');
});
