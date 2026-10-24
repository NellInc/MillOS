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
import {
  SERVICE_ENTRANCE_LIGHTS,
  SERVICE_ENTRANCE_STRENGTH,
  SERVICE_LAMP_SOURCE,
  SERVICE_LAMP_LENSES,
  serviceEntranceSource,
  createServiceLampHardware,
} from './ServiceEntranceLighting';
import {
  createMaintenanceRoof,
  createMaintenanceJoinery,
  createSubstationCraft,
} from './serviceBuildingCraft';
import { createBarnJoineryGeometry } from '../scenery/AuthoredPropTrim';

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

it.each(SERVICE_ENTRANCE_LIGHTS)(
  'seats $id on real construction and reaches its task/paving below the open optic',
  async (light) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      body = new THREE.Group();
    const add = (g: THREE.BufferGeometry, position = new THREE.Vector3()) => {
      const m = new THREE.Mesh(g, material);
      m.position.copy(position);
      body.add(m);
      return m;
    };
    if (light.site === 'maintenance') {
      add(new THREE.BoxGeometry(10, 5, 8), new THREE.Vector3(0, 2.5, 0));
      add(createMaintenanceRoof());
      add(createMaintenanceJoinery());
    } else if (light.site === 'substation') {
      add(new THREE.BoxGeometry(5, 4, 4), new THREE.Vector3(0, 2, 0));
      add(createSubstationCraft());
    } else {
      const doc = await new NodeIO().read('public/models/farm/barn.glb');
      const node = doc
          .getRoot()
          .listNodes()
          .find((n) => n.getMesh())!,
        primitive = node.getMesh()!.listPrimitives()[0],
        g = new THREE.BufferGeometry();
      for (const [name, semantic] of [
        ['position', 'POSITION'],
        ['normal', 'NORMAL'],
        ['uv', 'TEXCOORD_0'],
      ] as const) {
        const a = primitive.getAttribute(semantic)!;
        g.setAttribute(name, new THREE.Float32BufferAttribute(a.getArray()!, a.getElementSize()));
      }
      g.setIndex(Array.from(primitive.getIndices()!.getArray()!));
      const fitted = createBarnJoineryGeometry(g);
      add(fitted).applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      if (fitted !== g) g.dispose();
    }
    body.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), light.yaw),
      mount = new THREE.Vector3(...light.mount);
    const hit = new THREE.Raycaster(
      mount.clone().add(normal),
      normal.clone().negate()
    ).intersectObject(body, true)[0];
    expect(hit).toBeDefined();
    expect(mount.clone().sub(hit.point).dot(normal)).toBeGreaterThanOrEqual(-0.002);
    expect(mount.distanceTo(hit.point)).toBeLessThan(0.0125);
    const hardware = new THREE.Mesh(createServiceLampHardware(light.style), material);
    hardware.position.copy(mount);
    hardware.rotation.y = light.yaw;
    hardware.updateMatrixWorld(true);
    const source = serviceEntranceSource(light),
      taskSeed =
        light.id === 'substation-warning'
          ? new THREE.Vector3(4, 2.05, 0)
          : new THREE.Vector3(light.site === 'barn' ? 0.6 : 0.8, 1.55, 7);
    const task = new THREE.Raycaster(taskSeed, normal.clone().negate()).intersectObject(
      body,
      true
    )[0].point;
    for (const [target, minIncident] of [
      [task, 0.5],
      [new THREE.Vector3(...light.pool), 1],
    ] as const) {
      const direction = target.clone().sub(source),
        distance = direction.length();
      direction.normalize();
      expect(distance).toBeLessThan(light.distance);
      expect(-direction.y).toBeGreaterThan(Math.cos(1.24));
      expect(
        new THREE.Raycaster(source, direction, 0, distance - 0.005).intersectObject(hardware)
      ).toHaveLength(0);
      expect(
        new THREE.Raycaster(source, direction, 0, distance - 0.005).intersectObject(body, true)
      ).toHaveLength(0);
      const cutoff = (1 - (distance / light.distance) ** 4) ** 2;
      const cone = THREE.MathUtils.smoothstep(-direction.y, Math.cos(1.24), Math.cos(1.24 * 0.3));
      const incidence = target === task ? normal.dot(direction.clone().negate()) : -direction.y;
      expect((light.intensity * cutoff * cone * incidence) / (distance * distance)).toBeGreaterThan(
        minIncident
      );
    }
    // The lens is just above the real emitter; the opaque shade never seals it.
    const lens = new THREE.Mesh(SERVICE_LAMP_LENSES[light.style], material);
    lens.updateMatrixWorld(true);
    const local = new THREE.Vector3(...SERVICE_LAMP_SOURCE[light.style]);
    const glass = new THREE.Raycaster(local, new THREE.Vector3(0, 1, 0)).intersectObject(lens)[0];
    expect(glass.distance).toBeGreaterThan(0.005);
    expect(glass.distance).toBeLessThan(0.04);
    hardware.geometry.dispose();
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    material.dispose();
  }
);

it('keeps fitted hardware finite, bounded, shared and inside the retained roof/board clearance', () => {
  for (const style of ['gooseneck', 'hood'] as const) {
    const g = createServiceLampHardware(style);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
    for (const key of ['position', 'normal', 'color'])
      expect(Array.from(g.attributes[key].array).every(Number.isFinite)).toBe(true);
    expect(g.attributes.position.count / 3).toBeLessThan(1400);
    expect(g.boundingBox!.max.z).toBeLessThan(0.93);
    g.dispose();
  }
  const front = SERVICE_ENTRANCE_LIGHTS.find((l) => l.id === 'substation-door')!;
  const hood = createServiceLampHardware('hood');
  expect(front.mount[1] + hood.boundingBox!.max.y).toBeLessThan(4.09);
  expect(front.mount[1] + hood.boundingBox!.min.y).toBeGreaterThan(3.75);
  hood.dispose();
  expect(SERVICE_ENTRANCE_STRENGTH.value).toBe(1);
  expect(SERVICE_ENTRANCE_LIGHTS).toHaveLength(4);
});

it('uses the existing clock, optional gain lifecycle, shared lens/pool and exact quality gates without a new frame driver or shadow', () => {
  const source = readFileSync('src/components/exterior/ServiceEntranceLighting.tsx', 'utf8');
  expect(source).toContain("s.graphics.quality !== 'low'");
  expect(source).toContain('!s.graphics.perfDebug.disablePunctualLights');
  expect(source).toContain('!s.graphics.perfDebug.disableLightingPolish');
  expect(source).toContain('material={EXTERIOR_LAMP_LENS_MATERIAL}');
  expect(source).toContain('<ExteriorLampPool');
  expect(source).toContain('gain={SERVICE_ENTRANCE_STRENGTH}');
  expect(source).not.toMatch(/useFrame|TextureLoader|<(?:pointLight|spotLight|directionalLight)/);
  const downlight = readFileSync('src/components/exterior/ExteriorLighting.tsx', 'utf8').split(
    'export const ExteriorDownlight:'
  )[1];
  expect(downlight).toContain('baseIntensity: intensity, gain');
  expect(downlight).toContain('pointLights.delete(registration)');
  expect(downlight).toContain('[intensity, gain]');
  expect(downlight).toContain('castShadow={false}');
  for (const h of [12, 18.25, 22]) expect(getExteriorLampLevel(h, 'clear')).toBe(h === 12 ? 0 : 1);
  const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8'),
    farm = readFileSync('src/components/FarmArea.tsx', 'utf8');
  expect(exterior.match(/<ServiceEntranceLighting site=/g)).toHaveLength(2);
  expect(farm.match(/<ServiceEntranceLighting site=/g)).toHaveLength(1);
});

it('seats opal optics in their real rims instead of floating beneath or inside a gap', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const goose = new THREE.Mesh(createServiceLampHardware('gooseneck'), material);
  goose.updateMatrixWorld(true);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const edge = new THREE.Vector3(Math.cos(a) * 0.261, 0.035, 0.6 + Math.sin(a) * 0.261);
    const hit = new THREE.Raycaster(
      edge.clone().add(new THREE.Vector3(0, -0.02, 0)),
      new THREE.Vector3(0, 1, 0)
    ).intersectObject(goose)[0];
    expect(hit.distance).toBeCloseTo(0.02, 5);
  }
  expect(SERVICE_LAMP_LENSES.gooseneck.boundingBox!.max.x).toBeGreaterThan(0.26);
  expect(SERVICE_LAMP_LENSES.gooseneck.boundingBox!.max.x).toBeLessThan(0.265);
  const hood = new THREE.Mesh(createServiceLampHardware('hood'), material);
  hood.updateMatrixWorld(true);
  const top = SERVICE_LAMP_LENSES.hood.boundingBox!.max.y;
  const hit = new THREE.Raycaster(
    new THREE.Vector3(0, top - 0.002, 0.4),
    new THREE.Vector3(0, 1, 0)
  ).intersectObject(hood)[0];
  expect(hit.distance).toBeLessThan(0.003);
  goose.geometry.dispose();
  hood.geometry.dispose();
  material.dispose();
});
