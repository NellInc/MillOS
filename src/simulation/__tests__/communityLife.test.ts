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
  advanceCommunityPeopleClock,
  hasCommunityBakerySupply,
  communityWorkResponse,
  COMMUNITY_AGREEMENT_MEMBERS,
  communityAgreementCue,
  communityAgreementResponse,
  advanceCommunityAgreementClock,
} from '../communityLife';
import { createWorkplace, transitionWorkplace } from '../bilateralWorkplace';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';

describe('fictional campaign worker presentation', () => {
  const workplace = () => {
    const state = transitionWorkplace(createWorkplace(), {
      type: 'startCampaign',
      args: ['cooperative', 1],
    }).state;
    state.phase = 'active';
    return state;
  };
  it('binds four existing residents only while the game campaign is engaged', () => {
    const state = workplace();
    expect(COMMUNITY_AGREEMENT_MEMBERS).toEqual({
      'mill-packer': 'packing',
      'mill-quality': 'quality',
      'mill-engineer': 'maintenance',
      'mill-operator-west': 'coordinator',
    });
    expect(
      COMMUNITY_ROSTER.filter((person) => communityAgreementCue(person.id, state)).length
    ).toBe(4);
    for (const mode of ['pilot', 'workshop'] as const)
      expect(communityAgreementCue('mill-packer', { ...state, mode })).toBeNull();
    for (const phase of ['idle', 'deliberating', 'review'] as const)
      expect(communityAgreementCue('mill-packer', { ...state, phase })).toBeNull();
    expect(communityAgreementCue('mill-packer', { ...state, campaign: null })).toBeNull();
  });
  it('reflects qualified choices without claiming production or quality release', () => {
    const state = workplace();
    const member = state.members.find((m) => m.id === 'quality')!;
    member.chosenTask = 'Sampling';
    expect(communityAgreementCue('mill-quality', state)?.label).toContain('Agreed: Sampling');
    member.chosenTask = 'Quality release';
    expect(communityAgreementCue('mill-quality', state)?.task).toContain('safe observation post');
    member.chosenTask = 'Unqualified forklift operation';
    expect(communityAgreementCue('mill-quality', state)?.label).not.toContain('forklift');
  });
  it('bounds consensual cover and shows recovery, including recovery during review', () => {
    const state = workplace();
    const member = state.members.find((m) => m.id === 'packing')!;
    state.activeCoverMemberId = member.id;
    state.coverRemainingMinutes = 10;
    member.coverConsent = true;
    member.recoveryOwedMinutes = 10;
    expect(communityAgreementCue('mill-packer', state)?.state).toBe('cover');
    member.coverConsent = false;
    expect(communityAgreementCue('mill-packer', state)?.state).toBe('recovery');
    member.coverConsent = true;
    for (const remaining of [0, -1, 11, NaN, Infinity]) {
      state.coverRemainingMinutes = remaining;
      expect(communityAgreementCue('mill-packer', state)?.state).toBe('recovery');
    }
    state.phase = 'review';
    expect(communityAgreementCue('mill-packer', state)?.state).toBe('recovery');
    member.recoveryOwedMinutes = 0;
    expect(communityAgreementCue('mill-packer', state)).toBeNull();
  });
  it('gives protected rest precedence over duties and never changes the model', () => {
    const state = workplace();
    state.minute = 75;
    const before = structuredClone(state);
    const person = COMMUNITY_ROSTER.find((p) => p.id === 'mill-packer')!;
    const pose = sampleCommunityPerson(person, 0);
    const response = { activity: 'working' as const, task: 'Inspecting a fault' };
    const cue = communityAgreementCue(person.id, state);
    expect(cue?.state).toBe('rest');
    communityAgreementResponse(cue, pose, response);
    expect(response.activity).toBe('break');
    expect(response.task).toContain('Protected rest');
    expect(state).toEqual(before);
  });
  it('holds every route phase without teleporting or seating transit, then resumes continuously', () => {
    const state = workplace();
    state.minute = 75;
    for (const person of COMMUNITY_ROSTER.filter((p) => COMMUNITY_AGREEMENT_MEMBERS[p.id])) {
      const cue = communityAgreementCue(person.id, state);
      for (let hour = 0; hour < routineDuration(person); hour += 0.05) {
        const before = sampleCommunityPerson(person, hour);
        const heldHour = advanceCommunityAgreementClock(hour, 2, cue);
        const held = sampleCommunityPerson(person, heldHour);
        expect(held).toEqual(before);
        const response = { activity: held.activity, task: held.task };
        communityAgreementResponse(cue, held, response);
        expect(response.activity).toBe('break');
        expect(held.seated).toBe(before.seated);
        if (held.seated)
          expect(
            person.stops.some((s) => s.seated && String(s.position) === String(held.position))
          ).toBe(true);
        const resumed = sampleCommunityPerson(
          person,
          advanceCommunityAgreementClock(heldHour, 0.00001, null)
        );
        expect(
          Math.hypot(resumed.position[0] - held.position[0], resumed.position[2] - held.position[2])
        ).toBeLessThan(0.001);
        expect(advanceCommunityAgreementClock(heldHour, 0, null)).toBe(heldHour);
        const safetyHour = advanceCommunityPeopleClock(hour, hour + 12, 12, true, true);
        expect(advanceCommunityAgreementClock(hour, safetyHour - hour, null)).toBe(hour);
      }
    }
  });
  it('preserves route walking and existing tea breaks under a duty agreement', () => {
    const state = workplace();
    const person = COMMUNITY_ROSTER.find((p) => p.id === 'mill-packer')!;
    const cue = communityAgreementCue(person.id, state);
    const pose = sampleCommunityPerson(person, 0);
    for (const activity of ['walking', 'break'] as const) {
      pose.activity = activity;
      const response = { activity: pose.activity, task: 'Tea break' };
      communityAgreementResponse(cue, pose, response);
      expect(response.activity).toBe(activity);
      expect(response.task).toContain(
        activity === 'walking' ? 'Walking the safe route' : 'Tea break'
      );
    }
  });
});

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
      let collision: string | null = null;
      for (let t = 0; t < period; t += 0.005) {
        const pose = sampleCommunityPerson(person, t);
        activities.add(pose.activity);
        const [x, , z] = pose.position;
        for (const o of obstacles)
          if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ)
            collision ??= `${person.id} hits ${o.id} at ${x},${z}`;
      }
      expect(collision).toBeNull();
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
  it('never fabricates flour stock from the empty handcart routine', () => {
    for (let hour = 0; hour < 48; hour += 0.01) {
      const cart = sampleCommunityDelivery(hour);
      expect(cart.loaded).toBe(false);
      expect(cart.delivered).toBe(false);
      const person = sampleCommunityPerson(
        COMMUNITY_ROSTER.find((p) => p.id === 'village-courier')!,
        hour
      );
      expect(person.task).not.toMatch(/flour|delivering|unloading/i);
    }
    expect(sampleCommunityDelivery(9.5).visible).toBe(true);
    expect(sampleCommunityDelivery(9.85).moving).toBe(false);
    expect(sampleCommunityDelivery(10.5).moving).toBe(true);
  });
  it('uses fulfilled local flour orders, bounded by real completion time', () => {
    const order = {
      customer: "Riverside Bakers' Cooperative",
      recipe: { finishedMaterial: 'flour' },
      requiredKg: 6000,
      shippedKg: 6000,
      qualityFailureKg: 0,
      status: 'fulfilled',
      manifestIds: ['dispatch-real'],
      completedAtMinute: 100,
    } as Parameters<typeof hasCommunityBakerySupply>[0][number];
    expect(hasCommunityBakerySupply([order], 101)).toBe(true);
    expect(hasCommunityBakerySupply([{ ...order, shippedKg: 5999.999999999998 }], 101)).toBe(true);
    expect(hasCommunityBakerySupply([order], 99)).toBe(false);
    expect(hasCommunityBakerySupply([order], 1540)).toBe(false);
    for (const change of [
      { status: 'active' },
      { customer: 'County School Meals' },
      { manifestIds: [] },
      { completedAtMinute: null },
      { shippedKg: 0 },
      { shippedKg: 5999.99 },
      { shippedKg: 5999.999998 },
      { shippedKg: NaN },
      { qualityFailureKg: 1 },
      { qualityFailureKg: NaN },
      { requiredKg: 0 },
      { recipe: { finishedMaterial: 'semolina' } },
    ])
      expect(hasCommunityBakerySupply([{ ...order, ...change } as typeof order], 101)).toBe(false);
    expect(hasCommunityBakerySupply([], 10)).toBe(false);
    expect(hasCommunityBakerySupply([order], NaN)).toBe(false);
  });
  it('freezes safety stops even across clock jumps and preserves ordinary pause', () => {
    expect(advanceCommunityPeopleClock(8, 20, 12, false, true)).toBe(8);
    expect(advanceCommunityPeopleClock(8, 20, 12, true, true)).toBe(8);
    expect(advanceCommunityPeopleClock(8, 8, 0, false, false)).toBe(8);
    expect(advanceCommunityPeopleClock(8, 20, 12, false, false)).toBe(20);
    expect(advanceCommunityPeopleClock(8, 8.1, 0.1, true, false)).toBeCloseTo(8.1);
    expect(advanceCommunityPeopleClock(8, NaN, NaN, true, false)).toBe(8);
  });
  it('reacts at safe posts to work orders and held batches without stealing breaks', () => {
    const person = COMMUNITY_ROSTER.find((p) => p.id === 'mill-engineer')!;
    const pose = sampleCommunityPerson(person, 0);
    pose.activity = 'working';
    const operations = {
      machines: [{ id: person.machineId!, status: 'critical' as const }],
      workOrders: [{ machineId: person.machineId!, phase: 'awaiting_parts' as const }],
      batches: [{ packerId: 'packer-2', disposition: 'hold' as const, availableKg: 25 }],
      bakeryStocked: false,
    };
    const before = structuredClone(operations);
    const response = { activity: pose.activity, task: '' };
    expect(communityWorkResponse(person, pose, operations, response)).toBe(response);
    expect(response.activity).toBe('idle');
    pose.activity = 'break';
    expect(communityWorkResponse(person, pose, operations, response)).toBe(response);
    expect(response).toEqual({ activity: 'break', task: pose.task });
    pose.activity = 'working';
    expect(communityWorkResponse(person, pose, operations)).toEqual({
      activity: 'idle',
      task: 'Waiting for maintenance parts',
    });
    const quality = COMMUNITY_ROSTER.find((p) => p.role === 'Quality')!;
    expect(communityWorkResponse(quality, pose, operations).task).toContain(
      'quality investigation'
    );
    for (const activity of ['break', 'walking'] as const) {
      pose.activity = activity;
      expect(communityWorkResponse(person, pose, operations)).toEqual({
        activity,
        task: pose.task,
      });
    }
    expect(operations).toEqual(before);
  });
  it('pauses actual garden work in wet weather and resumes without changing its route or inventory', () => {
    const gardener = COMMUNITY_ROSTER.find((person) => person.id === 'village-gardener')!;
    const workingHour = Array.from({ length: 48 }, (_, index) => index / 2).find(
      (hour) =>
        sampleCommunityPerson(gardener, hour).activity === 'working' &&
        sampleCommunityPerson(gardener, hour).visible
    )!;
    expect(workingHour).toBeDefined();
    const pose = sampleCommunityPerson(gardener, workingHour);
    const operations = { machines: [], workOrders: [], batches: [], bakeryStocked: true };
    const before = structuredClone({ pose, operations, gardener });
    const response = { activity: pose.activity, task: pose.task };
    for (const weather of ['rain', 'storm'] as const) {
      expect(communityWorkResponse(gardener, pose, { ...operations, weather }, response)).toBe(
        response
      );
      expect(response.activity).toBe('idle');
      expect(response.task).toBe(
        weather === 'rain'
          ? 'Pausing garden work in the rain'
          : 'Pausing garden work during the storm'
      );
    }
    for (const weather of ['clear', 'cloudy', undefined] as const)
      expect(communityWorkResponse(gardener, pose, { ...operations, weather }, response)).toEqual({
        activity: 'working',
        task: pose.task,
      });
    expect({ pose, operations, gardener }).toEqual(before);
    for (const activity of ['walking', 'break', 'idle'] as const) {
      const resting = { ...pose, activity, seated: activity === 'break' };
      expect(communityWorkResponse(gardener, resting, { ...operations, weather: 'storm' })).toEqual(
        {
          activity,
          task: pose.task,
        }
      );
    }
    const shopkeeper = COMMUNITY_ROSTER.find((person) => person.id === 'village-shopkeeper')!;
    expect(communityWorkResponse(shopkeeper, pose, { ...operations, weather: 'storm' })).toEqual({
      activity: 'working',
      task: pose.task,
    });
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
