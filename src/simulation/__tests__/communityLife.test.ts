import { describe, it, expect } from 'vitest';
import { Group, SkinnedMesh } from 'three';
import {
  COMMUNITY_ROSTER,
  sampleCommunityPerson,
  routineDuration,
  WALK_HOURS_PER_METRE,
  sampleCommunityCyclist,
  communityChimneyLevel,
  sampleCommunityBus,
  sampleCommunityDelivery,
  inspectCommunityPresence,
  advanceCommunityBusClock,
} from '../communityLife';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';

describe('inhabited world routines', () => {
  it('gives every mill role a real, dedicated seated rest and a closed safe route', () => {
    const obstacles = [
      ...createMachineObstacles(0.33),
      ...createConveyorObstacles(),
      ...DOCK_PLATFORM_OBSTACLES,
    ];
    const seats = new Set<string>();
    for (const person of COMMUNITY_ROSTER.filter((p) => p.district === 'mill')) {
      const seat = person.stops.find((s) => s.seated);
      expect(seat, person.id).toBeDefined();
      expect(seats.has(String(seat!.position)), `${person.id} has exclusive seat`).toBe(false);
      seats.add(String(seat!.position));
      const period = routineDuration(person);
      const activities = new Set();
      for (let t = 0; t < period; t += 0.005) {
        const pose = sampleCommunityPerson(person, t);
        activities.add(pose.activity);
        const [x, , z] = pose.position;
        for (const o of obstacles) {
          expect(
            x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ,
            `${person.id} hits ${o.id} at ${x},${z}`
          ).toBe(false);
        }
      }
      expect([...activities]).toEqual(expect.arrayContaining(['walking', 'working', 'break']));
    }
  });
  it('is deterministic, finite and continuous through midnight', () => {
    for (const person of COMMUNITY_ROSTER) {
      for (const h of [NaN, Infinity, -2, 0, 10, 24, 48.2]) {
        const a = sampleCommunityPerson(person, h);
        expect(a).toEqual(sampleCommunityPerson(person, h));
        expect([...a.position, a.rotation].every(Number.isFinite)).toBe(true);
      }
      if (person.district !== 'mill') continue;
      const a = sampleCommunityPerson(person, 23.99999),
        b = sampleCommunityPerson(person, 24.00001);
      expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeLessThan(
        0.01
      );
    }
  });
  it('bounds pedestrian speed rather than sliding at 180 times the walk clip', () => {
    for (const person of COMMUNITY_ROSTER.filter((p) => p.district === 'mill')) {
      for (let h = 0; h < 24; h += 0.037) {
        const a = sampleCommunityPerson(person, h),
          b = sampleCommunityPerson(person, h + 0.0001);
        expect(
          Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) / 0.0001
        ).toBeLessThanOrEqual(1 / WALK_HOURS_PER_METRE + 0.001);
      }
    }
  });
  it('ties passengers to open bus doors and a stopped bus', () => {
    for (let h = 6; h < 22; h += 0.001) {
      const bus = sampleCommunityBus(h);
      if (bus.doorsOpen) expect([bus.x, bus.z, bus.rotation]).toEqual([23, 140, Math.PI]);
      for (const p of COMMUNITY_ROSTER.filter((p) => p.district === 'bus')) {
        const person = sampleCommunityPerson(p, h);
        if (person.visible && person.activity === 'walking')
          expect(bus.doorsOpen, `${p.id} at ${h}`).toBe(true);
      }
    }
    expect(sampleCommunityBus(23).visible).toBe(false);
  });
  it('holds the bus and its passenger clock while a truck uses the turnaround', () => {
    expect(advanceCommunityBusClock(7.85, 0.1, true)).toBeCloseTo(7.86);
    expect(advanceCommunityBusClock(8.2, 0, true)).toBeCloseTo(8.2);
    expect(advanceCommunityBusClock(8.2, 0.1, true)).toBeCloseTo(8.3);
    expect(advanceCommunityBusClock(7.86, 0.1, false)).toBeCloseTo(7.96);
    expect(advanceCommunityBusClock(7.86, 0, true)).toBeCloseTo(7.86);
  });
  it('delivers stock only after unloading, then returns an empty cart', () => {
    expect(sampleCommunityDelivery(9.5)).toMatchObject({
      visible: true,
      loaded: true,
      delivered: false,
    });
    expect(sampleCommunityDelivery(9.85)).toMatchObject({
      visible: true,
      moving: false,
      loaded: true,
      delivered: false,
    });
    expect(sampleCommunityDelivery(9.95)).toMatchObject({
      visible: true,
      moving: false,
      loaded: false,
      delivered: true,
    });
    expect(sampleCommunityDelivery(10.5)).toMatchObject({
      visible: true,
      moving: true,
      loaded: false,
      delivered: true,
    });
    expect(sampleCommunityDelivery(11)).toMatchObject({
      visible: false,
      loaded: false,
      delivered: true,
    });
    expect(sampleCommunityDelivery(8)).toMatchObject({ visible: false, delivered: false });
  });
  it('uses shop and garden hours instead of residents working throughout the night', () => {
    for (const id of [
      'village-baker',
      'village-shopkeeper',
      'village-gardener',
      'village-neighbour',
    ]) {
      const p = COMMUNITY_ROSTER.find((p) => p.id === id)!;
      expect(sampleCommunityPerson(p, 12).visible).toBe(true);
      expect(sampleCommunityPerson(p, 2).visible).toBe(false);
    }
  });
});

describe('positive scene presence evidence', () => {
  const assembly = () => {
    const root = new Group();
    for (const p of COMMUNITY_ROSTER) {
      const g = new Group();
      g.userData = { communityId: p.id, activity: 'idle', task: 'Resting' };
      g.add(new SkinnedMesh());
      root.add(g);
    }
    return root;
  };
  it('requires the actual loaded bodies, not empty named groups', () => {
    const s = assembly();
    expect(inspectCommunityPresence(s).passed).toBe(true);
    s.children[0].clear();
    expect(inspectCommunityPresence(s).passed).toBe(false);
  });
  it('rejects absent and duplicate people and excluded vehicle operators', () => {
    const absent = assembly();
    absent.remove(absent.children[0]);
    expect(inspectCommunityPresence(absent).passed).toBe(false);
    const duplicate = assembly();
    duplicate.add(duplicate.children[0].clone());
    expect(inspectCommunityPresence(duplicate).passed).toBe(false);
    const driver = assembly();
    const d = new Group();
    d.name = 'seated-vehicle-operator';
    driver.add(d);
    expect(inspectCommunityPresence(driver).passed).toBe(false);
  });
  it('reports visibility through the actual ancestor chain', () => {
    const root = new Group(),
      inner = assembly();
    inner.visible = false;
    root.add(inner);
    expect(inspectCommunityPresence(root).people.every((p) => !p.visible)).toBe(true);
  });
});

describe('village daily details', () => {
  it('rides a continuous grounded route inside the existing west street', () => {
    for (let h = 11; h < 18; h += 0.003) {
      const p = sampleCommunityCyclist(h),
        next = sampleCommunityCyclist(h + 0.00001);
      expect(p.x).toBeGreaterThanOrEqual(-203.201);
      expect(p.x).toBeLessThanOrEqual(-200.799);
      expect(p.z).toBeGreaterThanOrEqual(32.799);
      expect(p.z).toBeLessThanOrEqual(56.201);
      expect(Math.hypot(p.x - next.x, p.z - next.z)).toBeLessThan(0.001);
      expect(p.visible).toBe(true);
      const dx = next.x - p.x,
        dz = next.z - p.z;
      expect(dx * Math.sin(p.rotation) + dz * Math.cos(p.rotation)).toBeGreaterThan(0);
    }
    expect(sampleCommunityCyclist(10).visible).toBe(false);
    expect(sampleCommunityCyclist(20).visible).toBe(false);
  });
  it('ties hearth smoke to occupancy with gradual, staggered starts', () => {
    expect(communityChimneyLevel(2)).toBe(0);
    expect(communityChimneyLevel(12)).toBe(0);
    expect(communityChimneyLevel(18)).toBe(1);
    expect(communityChimneyLevel(5.2)).toBeCloseTo(0.5);
    expect(communityChimneyLevel(5.2, 0.8)).toBe(0);
    expect(communityChimneyLevel(12, 0, 'forge')).toBe(1);
    expect(communityChimneyLevel(20, 0, 'forge')).toBe(0);
    expect(communityChimneyLevel(22, 0, 'pub')).toBe(1);
  });
});
