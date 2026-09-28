import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CONTINUOUS_WORLD_LAYER_IDS,
  PRESENT_WORLD_LAYER_IDS,
  inspectWorldIntegrity,
} from '../worldContract';

function createCompleteWorld(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'world-root';
  for (const id of CONTINUOUS_WORLD_LAYER_IDS) {
    if (id === 'world-root') continue;
    const layer = new THREE.Group();
    layer.name = id;
    root.add(layer);
  }
  for (const id of PRESENT_WORLD_LAYER_IDS) {
    const layer = new THREE.Group();
    layer.name = id;
    root.add(layer);
  }
  return root;
}

describe('continuous authored world contract', () => {
  it('keeps the inhabited world and its activity props present at every quality', () => {
    expect(CONTINUOUS_WORLD_LAYER_IDS).toContain('world-personnel');
    expect(CONTINUOUS_WORLD_LAYER_IDS).toContain('world-community-details');
  });

  it('passes when every required layer is present and continuous layers are visible', () => {
    const report = inspectWorldIntegrity(createCompleteWorld());

    expect(report.passed).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.hidden).toEqual([]);
    expect(report.visible).toHaveLength(CONTINUOUS_WORLD_LAYER_IDS.length);
  });

  it('reports missing layers separately from hidden layers', () => {
    const world = createCompleteWorld();
    world.remove(world.getObjectByName('authored-village')!);
    world.getObjectByName('world-logistics')!.visible = false;

    const report = inspectWorldIntegrity(world);

    expect(report.passed).toBe(false);
    expect(report.missing).toContain('authored-village');
    expect(report.hidden).toContain('world-logistics');
  });

  it('allows the time-dependent sun or moon disk to be hidden', () => {
    const world = createCompleteWorld();
    world.getObjectByName('moon-visual')!.visible = false;

    const report = inspectWorldIntegrity(world);

    expect(report.passed).toBe(true);
    expect(report.present).toContain('moon-visual');
  });

  it('detects a visible layer hidden by an ancestor', () => {
    const world = createCompleteWorld();
    const landscape = new THREE.Group();
    landscape.visible = false;
    const farm = world.getObjectByName('authored-farm')!;
    world.remove(farm);
    landscape.add(farm);
    world.add(landscape);

    expect(inspectWorldIntegrity(world).hidden).toContain('authored-farm');
  });
});
