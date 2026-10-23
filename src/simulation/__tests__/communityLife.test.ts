import { describe, it, expect } from 'vitest';
import { Group, SkinnedMesh } from 'three';
import {
  COMMUNITY_ROSTER,
  createCommunityGreeting,
  communityPassengerAttention,
  communityBusNotice,
  sampleCommunityGreeting,
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
  advanceCommunityPresentationClock,
  hasCommunityBakerySupply,
  communityWorkResponse,
  COMMUNITY_AGREEMENT_MEMBERS,
  communityAgreementCue,
  communityAgreementResponse,
  advanceCommunityAgreementClock,
  COMMUNITY_WALK_SPEED_MPS,
  COMMUNITY_CYCLE_SPEED_MPS,
  COMMUNITY_SEAT_RAMP,
  STANDARD_HOURS_PER_REAL_SECOND,
  communityPassengerWalkHours,
  COMMUNITY_COURIER_SCHEDULE,
  COMMUNITY_STREET_END_Z,
  MILL_ROUTINE_HOURS,
  communityRootYaw,
  communityStillHour,
  type CommunityPose,
} from '../communityLife';
import { STANDARD_GAME_SPEED } from '../pace';
import { COMMUNITY_ANCHORS } from '../../constants/communityLayout';
import { createWorkplace, transitionWorkplace } from '../bilateralWorkplace';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';

/** Whole-day deterministic sweeps; their run time follows machine load, not the code. */
const SWEEP = { timeout: 60_000 };

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
        // Resuming continues from the held point: one walking step of 0.00001 h at most.
        expect(
          Math.hypot(resumed.position[0] - held.position[0], resumed.position[2] - held.position[2])
        ).toBeLessThanOrEqual(0.00001 / WALK_HOURS_PER_METRE + 1e-9);
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
  it('gives every mill resident a lane of their own: no shared line, no stop on a route', () => {
    type P = readonly [number, number];
    const mill = COMMUNITY_ROSTER.filter((p) => p.district === 'mill');
    const segments = (person: (typeof mill)[number]) =>
      person.stops
        .map((s, i) => {
          const n = person.stops[(i + 1) % person.stops.length];
          return [
            [s.position[0], s.position[2]],
            [n.position[0], n.position[2]],
          ] as const;
        })
        .filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
    const toSegment = (p: P, [a, b]: readonly [P, P]) => {
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz))
      );
      return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
    };
    for (const a of mill)
      for (const b of mill) {
        if (a === b) continue;
        for (const s of a.stops.filter((s) => s.hours > 0))
          for (const segment of segments(b))
            expect(
              toSegment([s.position[0], s.position[2]], segment),
              `${a.id} ${s.task} on ${b.id}'s route`
            ).toBeGreaterThanOrEqual(0.6);
        for (const [p, q] of segments(a))
          for (const [r, s] of segments(b)) {
            const u = [q[0] - p[0], q[1] - p[1]],
              v = [s[0] - r[0], s[1] - r[1]];
            if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 1e-9) continue; // crossings are timed
            const close =
              [r, s].some((x) => toSegment(x, [p, q]) < 0.6) ||
              [p, q].some((x) => toSegment(x, [r, s]) < 0.6);
            expect(close, `${a.id} shares a line with ${b.id}`).toBe(false);
          }
      }
  });
  it('keeps mill residents apart where their routes cross, for every day', SWEEP, () => {
    const mill = COMMUNITY_ROSTER.filter((p) => p.district === 'mill');
    // One shared period means one period of checks holds for all time.
    for (const person of mill)
      expect(routineDuration(person), person.id).toBeCloseTo(MILL_ROUTINE_HOURS, 9);
    let closest = Infinity,
      pair = '';
    for (let h = 0; h < MILL_ROUTINE_HOURS; h += 0.0005) {
      const poses = mill.map((p) => sampleCommunityPerson(p, h));
      for (let i = 0; i < mill.length; i++)
        for (let j = i + 1; j < mill.length; j++) {
          const d = Math.hypot(
            poses[i].position[0] - poses[j].position[0],
            poses[i].position[2] - poses[j].position[2]
          );
          if (d < closest) [closest, pair] = [d, `${mill[i].id}|${mill[j].id} at ${h}`];
        }
    }
    expect(closest, pair).toBeGreaterThanOrEqual(0.6);
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
  // Metres per REAL second when the clock runs at standard pace. Every other pace
  // scales this together with the trucks and forklifts (pace.ts).
  const realSpeed = (
    sample: (hour: number) => { position?: number[]; x?: number; z?: number },
    hour: number,
    step = 0.00002
  ) => {
    const at = (h: number) => {
      const s = sample(h);
      return s.position ? [s.position[0], s.position[2]] : [s.x!, s.z!];
    };
    const [ax, az] = at(hour),
      [bx, bz] = at(hour + step);
    return (Math.hypot(bx - ax, bz - az) / step) * STANDARD_HOURS_PER_REAL_SECOND;
  };
  it('walks residents at a believable real-time speed at standard pace', SWEEP, () => {
    expect(STANDARD_HOURS_PER_REAL_SECOND).toBe(STANDARD_GAME_SPEED / 3600);
    expect(COMMUNITY_WALK_SPEED_MPS).toBeGreaterThanOrEqual(1.2);
    expect(COMMUNITY_WALK_SPEED_MPS).toBeLessThanOrEqual(1.4);
    expect((1 / WALK_HOURS_PER_METRE) * STANDARD_HOURS_PER_REAL_SECOND).toBeCloseTo(
      COMMUNITY_WALK_SPEED_MPS,
      9
    );
    const fastest = new Map<string, number>(),
      walking = new Map<string, number>();
    const people = COMMUNITY_ROSTER.filter((p) => p.stops.length > 0);
    for (const person of people)
      for (let h = 0; h < 24; h += 0.002) {
        const pose = sampleCommunityPerson(person, h);
        const speed = realSpeed((hour) => sampleCommunityPerson(person, hour), h);
        fastest.set(person.id, Math.max(fastest.get(person.id) ?? 0, speed));
        if (pose.activity === 'walking')
          walking.set(person.id, Math.max(walking.get(person.id) ?? 0, speed));
      }
    for (const person of people) {
      expect(fastest.get(person.id), person.id).toBeLessThanOrEqual(1.4);
      expect(walking.get(person.id), person.id).toBeGreaterThanOrEqual(1.2);
    }
  });
  it('rides, boards and drives at real-time speeds at standard pace', () => {
    let cyclist = 0;
    for (let h = 11.5; h < 12; h += 0.001)
      cyclist = Math.max(cyclist, realSpeed(sampleCommunityCyclist, h));
    // A leisurely village cyclist, roughly 8 to 10 km/h.
    expect(COMMUNITY_CYCLE_SPEED_MPS).toBeGreaterThan(2);
    expect(COMMUNITY_CYCLE_SPEED_MPS).toBeLessThan(3);
    expect(cyclist).toBeCloseTo(COMMUNITY_CYCLE_SPEED_MPS, 3);
    for (const id of ['bus-arriving', 'bus-departing']) {
      const person = COMMUNITY_ROSTER.find((p) => p.id === id)!;
      let fastest = 0;
      // A passenger who is out of sight may be re-placed for the next run.
      for (let h = 6; h < 22; h += 0.0002)
        if (
          sampleCommunityPerson(person, h).visible &&
          sampleCommunityPerson(person, h + 0.00002).visible
        )
          fastest = Math.max(
            fastest,
            realSpeed((hour) => sampleCommunityPerson(person, hour), h)
          );
      expect(fastest, id).toBeGreaterThanOrEqual(1.2);
      expect(fastest, id).toBeLessThanOrEqual(1.4);
    }
    // The shuttle covers its 115 m tunnel approach at road speed, not 3 km/h.
    let approach = 0;
    for (let h = 6; h < 7.1; h += 0.0005)
      if (sampleCommunityBus(h).visible)
        approach = Math.max(approach, realSpeed(sampleCommunityBus, h));
    expect(approach).toBeGreaterThan(8);
    expect(approach).toBeLessThan(16);
  });
  it('lowers people onto seats in about a second of real time at standard pace', () => {
    const person = COMMUNITY_ROSTER.find((p) => p.id === 'mill-operator-west')!;
    let first = NaN,
      settled = NaN;
    for (let h = 0; h < routineDuration(person) * 2 && Number.isNaN(settled); h += 0.00002) {
      const amount = sampleCommunityPerson(person, h).seat?.amount ?? 0;
      if (Number.isNaN(first) && amount > 0.01) first = h;
      if (!Number.isNaN(first) && amount > 0.99) settled = h;
    }
    const seconds = (settled - first) / STANDARD_HOURS_PER_REAL_SECOND;
    expect(seconds).toBeGreaterThan(0.6);
    expect(seconds).toBeLessThan(1.6);
  });
  it('ties passengers to open bus doors and a stopped bus', () => {
    for (let h = 6; h < 22; h += 0.001) {
      const bus = sampleCommunityBus(h);
      if (bus.doorsOpen) expect([bus.x, bus.z, bus.rotation]).toEqual([23, 140, Math.PI]);
      for (const p of COMMUNITY_ROSTER.filter((p) => p.district === 'bus')) {
        const person = sampleCommunityPerson(p, h);
        // Stepping up from the bench to the kerb is not boarding; crossing to the bus is.
        if (person.visible && /bus$/.test(person.task))
          expect(bus.doorsOpen, `${p.id} at ${h}`).toBe(true);
      }
    }
    expect(sampleCommunityBus(23).visible).toBe(false);
  });
  it(
    'seats both commuters with ramps and only shows or hides them at the open bus door',
    SWEEP,
    () => {
      const door = [24.1, 0.36, 137.6];
      const step = 0.0002;
      const amount = (pose: CommunityPose) => (pose.seat ? pose.seat.amount : pose.seated ? 1 : 0);
      const seen = new Set<string>();
      // Finely around each stop (the shuttle leaves the tunnel at phase ~0.94 and is
      // gone by 1.9); between stops a commuter is either seated or away, unchanged.
      const hours: number[] = [];
      for (let h = 5; h < 23; h += 0.01) {
        const phase = (((h - 6) % 4) + 4) % 4;
        if (phase > 0.9 && phase < 1.95) for (let f = h; f < h + 0.01; f += step) hours.push(f);
        else hours.push(h);
      }
      for (const p of COMMUNITY_ROSTER.filter((p) => p.district === 'bus')) {
        for (let k = 0; k + 1 < hours.length; k++) {
          const h = hours[k];
          const a = sampleCommunityPerson(p, h),
            b = sampleCommunityPerson(p, hours[k + 1]);
          if (hours[k + 1] - h > step * 1.5) {
            expect(b.visible, `${p.id} unchanged between stops at ${h}`).toBe(a.visible);
            continue;
          }
          if (a.visible !== b.visible) {
            const shown = a.visible ? a : b;
            seen.add(`${p.id} ${a.visible ? 'boards' : 'alights'}`);
            expect(sampleCommunityBus(h).doorsOpen, `${p.id} at ${h}`).toBe(true);
            expect(
              Math.hypot(shown.position[0] - door[0], shown.position[2] - door[2]),
              `${p.id} at the door at ${h}`
            ).toBeLessThanOrEqual(step / WALK_HOURS_PER_METRE + 1e-9);
          }
          if (!a.visible || !b.visible) continue;
          // No posture pop: sitting and rising ramp, and the body never jumps.
          expect(Math.abs(amount(b) - amount(a)), `${p.id} seat at ${h}`).toBeLessThan(0.05);
          expect(Math.abs(b.position[1] - a.position[1]), `${p.id} height at ${h}`).toBeLessThan(
            0.03
          );
          if (a.seated || a.seat) expect(a.seat, `${p.id} seat cue at ${h}`).toBeDefined();
        }
      }
      expect([...seen].sort()).toEqual([
        'bus-arriving alights',
        'bus-arriving boards',
        'bus-departing alights',
        'bus-departing boards',
      ]);
      // The two commuters sit at their own places on the bench.
      const arriving = sampleCommunityPerson(
        COMMUNITY_ROSTER.find((p) => p.id === 'bus-arriving')!,
        8
      );
      const departing = sampleCommunityPerson(
        COMMUNITY_ROSTER.find((p) => p.id === 'bus-departing')!,
        12
      );
      expect(arriving.seat?.amount).toBe(1);
      expect(departing.seat?.amount).toBe(1);
      expect(
        Math.hypot(
          arriving.position[0] - departing.position[0],
          arriving.position[2] - departing.position[2]
        )
      ).toBeGreaterThan(1);
    }
  );
  it('eases passenger starts and arrivals without moving anchors, times or the path', () => {
    for (const [id, start, leg] of [
      ['bus-arriving', 7.16, 'alight'],
      ['bus-arriving', 11.52, 'board'],
      ['bus-departing', 11.16, 'alight'],
      ['bus-departing', 15.52, 'board'],
    ] as const) {
      const person = COMMUNITY_ROSTER.find((p) => p.id === id)!;
      // The walk lasts as long as its authored distance takes at walking pace,
      // with the brief starting and stopping ramps added.
      const walk = communityPassengerWalkHours(id, leg);
      const from = sampleCommunityPerson(person, start),
        to = sampleCommunityPerson(person, start + walk);
      const distance = (a: typeof from, b: typeof from) =>
        Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
      const total = distance(from, to);
      expect(walk).toBeGreaterThan(total * WALK_HOURS_PER_METRE);
      expect(walk).toBeLessThan((total * WALK_HOURS_PER_METRE) / 0.85);
      expect(distance(sampleCommunityPerson(person, start - walk * 0.01), from)).toBe(0);
      expect(distance(sampleCommunityPerson(person, start + walk * 1.01), to)).toBe(0);
      const early = sampleCommunityPerson(person, start + walk * 0.01);
      const late = sampleCommunityPerson(person, start + walk * 0.99);
      expect(distance(from, early) / total).toBeLessThan(0.001);
      expect(distance(late, to) / total).toBeLessThan(0.001);
      expect(distance(from, sampleCommunityPerson(person, start + walk / 2)) / total).toBeCloseTo(
        0.5,
        6
      );
      for (let step = 0; step <= 30; step++) {
        const hour = start + (step * walk) / 30,
          pose = sampleCommunityPerson(person, hour);
        expect(distance(from, pose) + distance(pose, to)).toBeCloseTo(total, 6);
        expect(sampleCommunityPerson(person, hour)).toEqual(pose);
      }
    }
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
    const s = COMMUNITY_COURIER_SCHEDULE;
    const inspecting = (s.inspect + s.returning) / 2;
    expect(sampleCommunityDelivery(inspecting).visible).toBe(true);
    expect(sampleCommunityDelivery(inspecting).moving).toBe(false);
    expect(sampleCommunityDelivery((s.pull + s.gone) / 2).moving).toBe(true);
  });
  it('walks the courier forwards at walking pace and turns before taking the cart', () => {
    const s = COMMUNITY_COURIER_SCHEDULE;
    expect(s.start).toBeGreaterThanOrEqual(9);
    expect(s.gone).toBeLessThanOrEqual(11);
    const step = 0.00005;
    let previous = sampleCommunityDelivery(s.start - step);
    let turnStart = NaN;
    for (let h = s.start; h < s.gone + 0.01; h += step) {
      const now = sampleCommunityDelivery(h),
        ahead = sampleCommunityDelivery(h + 1e-7);
      const dx = ahead.x - now.x,
        dz = ahead.z - now.z,
        moved = Math.hypot(dx, dz);
      if (moved > 0 && ahead.rotation === now.rotation) {
        // Every step goes the way the courier faces: no backing up, no crabbing.
        const off = Math.atan2(dx, dz) - now.rotation;
        expect(Math.abs(Math.atan2(Math.sin(off), Math.cos(off))), `heading at ${h}`).toBeLessThan(
          0.6
        );
        expect(moved / 1e-7, `pace at ${h}`).toBeLessThanOrEqual(1 / WALK_HOURS_PER_METRE + 1e-3);
      }
      if (now.rotation !== previous.rotation) turnStart = h;
      // A held grip couples the body to the cart, so the turn must already be done.
      if (now.cartGrip && !previous.cartGrip) {
        expect(now.rotation, `grip at ${h}`).toBe(previous.rotation);
        expect(h - turnStart, `turn time before the grip at ${h}`).toBeGreaterThanOrEqual(
          (0.6 * STANDARD_GAME_SPEED) / 3600
        );
      }
      if (now.cartGrip && previous.cartGrip) expect(now.rotation).toBe(previous.rotation);
      previous = now;
    }
  });
  it('brings the courier and the cart in and out at the street end, never mid-street', () => {
    for (let h = 0; h < 24; h += 0.0005) {
      const a = sampleCommunityDelivery(h),
        b = sampleCommunityDelivery(h + 0.0005);
      // Half a step of walking either side of the street end at most.
      const reach = 0.0005 / WALK_HOURS_PER_METRE;
      if (a.visible !== b.visible)
        expect(Math.abs(b.z - COMMUNITY_STREET_END_Z), `courier at ${h}`).toBeLessThanOrEqual(
          reach
        );
      if (a.cartVisible !== b.cartVisible)
        expect(Math.abs(b.cartZ - COMMUNITY_STREET_END_Z), `cart at ${h}`).toBeLessThanOrEqual(
          reach
        );
    }
    expect(sampleCommunityDelivery(12).cartVisible).toBe(false);
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
  it('shows reduced-motion residents where a trip began, then cuts to where it ends', SWEEP, () => {
    // Several samples inside even the shortest walking leg (about 0.008 h).
    const step = 0.002;
    for (const person of COMMUNITY_ROSTER) {
      let previous = sampleCommunityPerson(person, 0),
        previousStill = communityStillHour(person, 0),
        cuts = 0;
      for (let h = step; h < 24; h += step) {
        const now = sampleCommunityPerson(person, h);
        const still = communityStillHour(person, h);
        expect(still, `${person.id} at ${h}`).toBeLessThanOrEqual(h);
        if (now.activity !== 'walking') expect(still, `${person.id} at ${h}`).toBe(h);
        // Mid-trip the shown moment does not move, so neither does the body.
        if (
          now.visible &&
          previous.visible &&
          now.activity === 'walking' &&
          previous.activity === 'walking'
        ) {
          if (Math.abs(still - previousStill) > 1e-9) cuts++;
        }
        // What is shown is a stop, or the very start of a trip from a doorway (a
        // village door, the bus door) or the street end: never part-way along.
        const shown = sampleCommunityPerson(person, still);
        if (shown.activity === 'walking') {
          const [x, , z] = shown.position;
          const origins = [
            [24.1, 137.6],
            ...(person.day ? [[person.day.door[0], person.day.door[2]]] : []),
          ];
          expect(
            origins.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < 1e-6) ||
              Math.abs(z - COMMUNITY_STREET_END_Z) < 1e-6,
            `${person.id} shown part-way along a trip at ${h}`
          ).toBe(true);
        }
        previous = now;
        previousStill = still;
      }
      // Consecutive legs through a waypoint are one trip; only an arrival cuts.
      expect(cuts, `${person.id} restarted a trip mid-walk`).toBe(0);
    }
    // The cyclist waits at the street end, where the ride begins.
    const cyclist = COMMUNITY_ROSTER.find((p) => p.role === 'Cyclist')!;
    const parked = sampleCommunityPerson(cyclist, communityStillHour(cyclist, 14));
    expect(parked.position[2]).toBeCloseTo(COMMUNITY_STREET_END_Z, 9);
    expect(parked.visible).toBe(true);
  });
  it('keeps an unfinished turn where it is while held, and only snaps on a cut', () => {
    const quarter = Math.PI / 2;
    // Held (paused, drill, hidden tab): the eased yaw stays put mid-turn.
    expect(communityRootYaw(0.4, quarter, 1 / 60, { moving: false })).toBe(0.4);
    // Moving: eases towards the route's heading by the existing rate.
    expect(communityRootYaw(0.4, quarter, 1 / 60, { moving: true })).toBeCloseTo(
      0.4 + (quarter - 0.4) * (1 - Math.exp(-8 / 60)),
      12
    );
    // The short way round, across the wrap.
    expect(communityRootYaw(3, -3, 1 / 60, { moving: true })).toBeGreaterThan(3);
    // A deliberate cut (jump, reframe, reduced motion) or a coupled prop takes the heading.
    for (const flags of [{ cut: true }, { coupled: true }])
      for (const moving of [false, true])
        expect(communityRootYaw(0.4, quarter, 1 / 60, { moving, ...flags })).toBe(quarter);
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
  it('waits for actual sample stock and distinguishes recalled batches without changing the ledger', () => {
    const person = COMMUNITY_ROSTER.find((p) => p.role === 'Quality')!;
    const pose = { ...sampleCommunityPerson(person, 12), activity: 'working' as const };
    const operations = { machines: [], workOrders: [], batches: [], bakeryStocked: false };
    expect(communityWorkResponse(person, pose, operations)).toEqual({
      activity: 'idle',
      task: 'Waiting for a production batch to sample',
    });
    const recalled = {
      ...operations,
      batches: [{ packerId: 'packer-2', disposition: 'recalled' as const, availableKg: 25 }],
    };
    const before = structuredClone(recalled);
    expect(communityWorkResponse(person, pose, recalled)).toEqual({
      activity: 'working',
      task: 'Reviewing recalled stock from the quality inspection post',
    });
    expect(recalled).toEqual(before);
  });

  it('reviews a recall while its lot is still being worked off, though every batch is scrapped', () => {
    const person = COMMUNITY_ROSTER.find((p) => p.role === 'Quality')!;
    const pose = { ...sampleCommunityPerson(person, 12), activity: 'working' as const };
    // Recalled batches are written off as they form, so they never hold stock;
    // what the plant is dealing with is the recalled lot still upstream.
    const scrapped = {
      machines: [],
      workOrders: [],
      batches: [{ packerId: 'packer-2', disposition: 'recalled' as const, availableKg: 0 }],
      bakeryStocked: false,
    };
    expect(communityWorkResponse(person, pose, { ...scrapped, recalledStockKg: 300 })).toEqual({
      activity: 'working',
      task: 'Reviewing recalled stock from the quality inspection post',
    });
    expect(communityWorkResponse(person, pose, { ...scrapped, recalledStockKg: 0 })).toEqual({
      activity: 'idle',
      task: 'Waiting for a production batch to sample',
    });
  });

  it('keeps quality maintenance, fault, released-stock and protected-break priorities', () => {
    const person = COMMUNITY_ROSTER.find((p) => p.role === 'Quality')!;
    const pose = { ...sampleCommunityPerson(person, 12), activity: 'working' as const };
    const empty = { machines: [], workOrders: [], batches: [], bakeryStocked: false };
    for (const activity of ['walking', 'break', 'idle'] as const)
      expect(communityWorkResponse(person, { ...pose, activity }, empty)).toEqual({
        activity,
        task: pose.task,
      });
    expect(
      communityWorkResponse(person, pose, {
        ...empty,
        workOrders: [{ machineId: person.machineId!, phase: 'awaiting_parts' }],
      }).task
    ).toBe('Waiting for maintenance parts');
    expect(
      communityWorkResponse(person, pose, {
        ...empty,
        machines: [{ id: person.machineId!, status: 'critical' }],
      }).task
    ).toBe('Inspecting a reported equipment fault');
    expect(
      communityWorkResponse(person, pose, {
        ...empty,
        batches: [{ packerId: 'packer-2', availableKg: 25, disposition: 'released' }],
      })
    ).toEqual({ activity: pose.activity, task: pose.task });
    for (const stock of [0, Number.NaN, Number.POSITIVE_INFINITY])
      expect(
        communityWorkResponse(person, pose, {
          ...empty,
          batches: [{ packerId: 'packer-2', availableKg: stock, disposition: 'recalled' }],
        }).activity
      ).toBe('idle');
    expect(
      communityWorkResponse(person, pose, {
        ...empty,
        batches: [{ packerId: 'packer-2', availableKg: 25, disposition: 'shipped' }],
      }).activity
    ).toBe('idle');
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
  it('brings village residents out of and back into their own doors, standing', SWEEP, () => {
    const step = 0.0002;
    const village = COMMUNITY_ROSTER.filter((p) => p.district === 'village' && p.stops.length);
    expect(village.map((p) => p.id).sort()).toEqual([
      'village-baker',
      'village-gardener',
      'village-neighbour',
      'village-shopkeeper',
    ]);
    for (const person of village) {
      const door = person.day!.door;
      let transitions = 0;
      for (let h = 0; h < 24; h += 0.01) {
        let lo = h,
          hi = h + 0.01;
        const before = sampleCommunityPerson(person, lo).visible;
        if (sampleCommunityPerson(person, hi).visible === before) continue;
        // Find the moment of the change, then look at the visible side of it.
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (sampleCommunityPerson(person, mid).visible === before) lo = mid;
          else hi = mid;
        }
        transitions++;
        const shown = sampleCommunityPerson(person, before ? lo : hi);
        expect(
          Math.hypot(shown.position[0] - door[0], shown.position[2] - door[2]),
          `${person.id} at its door at ${h}`
        ).toBeLessThan(1e-6);
        expect(shown.seated || !!shown.seat, `${person.id} standing at ${h}`).toBe(false);
      }
      expect(transitions, person.id).toBe(2);
    }
    // The pub seat ramps through the stretched last dwell; it never pops.
    const neighbour = village.find((p) => p.id === 'village-neighbour')!;
    const amount = (p: CommunityPose) => p.seat?.amount ?? (p.seated ? 1 : 0);
    let previous = sampleCommunityPerson(neighbour, 11);
    for (let h = 11 + step; h < 23; h += step) {
      const now = sampleCommunityPerson(neighbour, h);
      expect(Math.abs(amount(now) - amount(previous)), `seat at ${h}`).toBeLessThanOrEqual(
        (1.5 * step) / COMMUNITY_SEAT_RAMP.down + 1e-9
      );
      previous = now;
    }
  });
  it('walks the baker and shopkeeper around their opening boards, never through them', () => {
    for (const [id, board] of [
      ['village-baker', COMMUNITY_ANCHORS.bakeryBoard],
      ['village-shopkeeper', COMMUNITY_ANCHORS.shopBoard],
    ] as const) {
      const person = COMMUNITY_ROSTER.find((p) => p.id === id)!;
      // Board footprint 0.71 x 0.075 m, turned a quarter: long along world z.
      for (let h = 6.9; h < 18.1; h += 0.0005) {
        const shown = sampleCommunityPerson(person, h);
        if (!shown.visible) continue;
        const dx = Math.max(0, Math.abs(shown.position[0] - board.position[0]) - 0.0375);
        const dz = Math.max(0, Math.abs(shown.position[2] - board.position[2]) - 0.355);
        expect(Math.hypot(dx, dz), `${id} at its board at ${h}`).toBeGreaterThan(0.35);
      }
    }
  });
  it('keeps the shopkeeper clear of the courier and the parked handcart', () => {
    const shopkeeper = COMMUNITY_ROSTER.find((p) => p.id === 'village-shopkeeper')!;
    const courier = COMMUNITY_ROSTER.find((p) => p.id === 'village-courier')!;
    for (let h = 8.5; h < 11.5; h += 0.0005) {
      const cart = sampleCommunityDelivery(h),
        person = sampleCommunityPerson(shopkeeper, h);
      if (!person.visible) continue;
      // Cart body x +-0.43 and from 0.47 ahead of its root to the handle ends
      // 1.2 behind; a body needs another 0.3 m.
      const [x, , z] = person.position;
      if (cart.cartVisible)
        expect(
          Math.abs(x - cart.cartX) > 0.73 || z < cart.cartZ - 0.77 || z > cart.cartZ + 1.5,
          `shopkeeper in the cart at ${h}`
        ).toBe(true);
      const walker = sampleCommunityPerson(courier, h);
      if (walker.visible)
        expect(
          Math.hypot(x - walker.position[0], z - walker.position[2]),
          `shopkeeper and courier at ${h}`
        ).toBeGreaterThanOrEqual(0.6);
    }
  });
  it('brings the cyclist in from and back out to the street end', () => {
    let transitions = 0;
    for (let h = 0; h < 24; h += 0.0002) {
      const a = sampleCommunityCyclist(h),
        b = sampleCommunityCyclist(h + 0.0002);
      if (a.visible === b.visible) continue;
      transitions++;
      const shown = a.visible ? a : b;
      expect(Math.abs(shown.z - COMMUNITY_STREET_END_Z), `cyclist at ${h}`).toBeLessThanOrEqual(
        (0.0002 * COMMUNITY_CYCLE_SPEED_MPS) / STANDARD_HOURS_PER_REAL_SECOND + 1e-9
      );
    }
    expect(transitions).toBe(2);
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
      // The loop, plus the ride in from and back out to the street end.
      expect(p.z).toBeLessThanOrEqual(COMMUNITY_STREET_END_Z + 0.001);
      // One 0.00001 h step at riding speed, never a jump.
      expect(Math.hypot(p.x - next.x, p.z - next.z)).toBeLessThanOrEqual(
        (0.00001 * COMMUNITY_CYCLE_SPEED_MPS) / STANDARD_HOURS_PER_REAL_SECOND + 1e-9
      );
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

describe('bounded personnel presentation between actual simulation ticks', () => {
  const step = advanceCommunityPresentationClock;
  it('reframes a missing or non-finite presentation clock from an older save to world time', () => {
    for (const stale of [Number.NaN, undefined as unknown as number, Infinity]) {
      expect(step(stale, 10.25, 0, 1 / 60, 180, true, false)).toBe(10.25);
    }
  });
  it('consumes a stepped target evenly without overshooting or inventing time', () => {
    for (const speed of [30, 180]) {
      const start = 12,
        target = start + (speed * 0.5) / 3600;
      let hour = start;
      for (let i = 0; i < 30; i++) {
        const next = step(hour, target, i ? 0 : target - start, 1 / 60, speed, true, false);
        expect(next - hour).toBeCloseTo(speed / 3600 / 60, 9);
        expect(next).toBeLessThanOrEqual(target);
        hour = next;
      }
      expect(hour).toBeCloseTo(target, 9);
      expect(step(hour, target, 0, 1 / 60, speed, true, false)).toBeCloseTo(target, 9);
    }
  });
  it('keeps interpolated routes grounded and their rider, courier and prop schedules aligned', () => {
    // Half a second of standard-pace clock, presented over 30 display frames.
    let hour = 12;
    const admitted = (STANDARD_GAME_SPEED * 0.5) / 3600;
    const target = hour + admitted;
    const previous = COMMUNITY_ROSTER.map((p) => sampleCommunityPerson(p, hour));
    for (let i = 0; i < 30; i++) {
      const next = step(hour, target, i ? 0 : admitted, 1 / 60, STANDARD_GAME_SPEED, true, false);
      COMMUNITY_ROSTER.forEach((person, index) => {
        const pose = sampleCommunityPerson(person, next);
        if (
          pose.activity === 'walking' &&
          previous[index].activity === 'walking' &&
          person.role !== 'Cyclist'
        ) {
          expect(
            Math.hypot(
              pose.position[0] - previous[index].position[0],
              pose.position[2] - previous[index].position[2]
            )
          ).toBeLessThanOrEqual(COMMUNITY_WALK_SPEED_MPS / 60 + 1e-8);
        }
        previous[index] = pose;
      });
      const courier = sampleCommunityPerson(
        COMMUNITY_ROSTER.find((p) => p.id === 'village-courier')!,
        next
      );
      const cart = sampleCommunityDelivery(next);
      expect(courier.position).toEqual([cart.x, 0, cart.z]);
      const cyclist = sampleCommunityPerson(
        COMMUNITY_ROSTER.find((p) => p.id === 'village-cyclist')!,
        next
      );
      const cycle = sampleCommunityCyclist(next);
      expect(cyclist.position).toEqual([cycle.x, 0, cycle.z]);
      hour = next;
    }
  });
  it('reframes a small live rewind rather than freezing until the plant clock catches up', () => {
    expect(step(12, 11.9, -0.1, 1 / 60, 180, true, false)).toBe(11.9);
  });
  it('freezes partial pause, respects deliberate time reframes, and rebases hidden/safety holds', () => {
    expect(step(12, 12.025, 0, 1 / 60, 0, true, false)).toBe(12);
    expect(step(12, 8, -4, 1 / 60, 0, true, false)).toBe(8);
    for (const [visible, emergency] of [
      [false, false],
      [true, true],
    ]) {
      const cursor = step(12, 20, 8, 1 / 60, 180, visible, emergency);
      expect(cursor).toBe(20);
      expect(advanceCommunityPeopleClock(12, cursor, 0, false, true)).toBe(12);
      expect(step(cursor, 20, 0, 1 / 60, 180, true, false)).toBe(20);
    }
    expect(step(12, 12.1, 0, NaN, 180, true, false)).toBe(12);
    expect(step(12, 12.1, 0, 100, 180, true, false) - 12).toBeCloseTo((180 * 0.075) / 3600, 9);
  });
});

describe('greetings acknowledge actual passing company', () => {
  const shop = COMMUNITY_ROSTER.find((p) => p.id === 'village-shopkeeper')!;
  const neighbour = COMMUNITY_ROSTER.find((p) => p.id === 'village-neighbour')!;
  const pose = {
    position: [0, 0, 0] as [number, number, number],
    rotation: 0,
    activity: 'idle' as const,
    task: 'Greeting a neighbour',
    seated: false,
    visible: true,
  };
  it('selects only a visible nearby forward recipient and bounds the head turn', () => {
    const target = { ...pose, position: [1, 0, 2] as [number, number, number] };
    const actors = [
      { person: shop, pose },
      { person: neighbour, pose: target },
    ];
    const out = createCommunityGreeting();
    expect(sampleCommunityGreeting(shop, pose, actors, out)).toBe(out);
    expect(out).toEqual({ targetId: neighbour.id, yaw: 0.3 });
    for (const position of [
      [0, 0, -2],
      [7, 0, 0],
      [0, 0, 0.1],
    ] as [number, number, number][]) {
      target.position = position;
      sampleCommunityGreeting(shop, pose, actors, out);
      expect(out.targetId).toBe(null);
      expect(out.yaw).toBe(0);
    }
    target.position = [0, 0, 2];
    target.visible = false;
    expect(sampleCommunityGreeting(shop, pose, actors, out).targetId).toBe(null);
  });
  it('never greets during a work, seat or non-authored idle stop', () => {
    const actors = [
      { person: neighbour, pose: { ...pose, position: [0, 0, 2] as [number, number, number] } },
    ];
    for (const changed of [
      { activity: 'working' as const },
      { seated: true },
      { task: 'Checking a delivery' },
      { visible: false },
    ])
      expect(
        sampleCommunityGreeting(shop, { ...pose, ...changed }, actors, createCommunityGreeting())
          .targetId
      ).toBe(null);
    expect(
      sampleCommunityGreeting(neighbour, pose, actors, createCommunityGreeting()).targetId
    ).toBe(null);
  });
});

describe('actual transit attention and service notice', () => {
  const passenger = COMMUNITY_ROSTER.find((p) => p.id === 'bus-departing')!;
  it('acknowledges only a nearby visible shuttle while waiting, with bounded attention', () => {
    // The moment the 14:00 run, braking into the stop, is 7 m short of it; this
    // commuter has stood up from the bench to catch it.
    let hour = 14;
    while (sampleCommunityBus(hour).z > 147) hour += 0.00001;
    const pose = sampleCommunityPerson(passenger, hour),
      bus = sampleCommunityBus(hour);
    expect(bus.doorsOpen).toBe(false);
    expect(pose.activity).toBe('idle');
    expect(pose.seated).toBe(false);
    expect(communityPassengerAttention(passenger, pose, bus)).toBeCloseTo(0.26);
    for (const changed of [{ visible: false }, { x: 1000 }, { phase: 2 }])
      expect(communityPassengerAttention(passenger, pose, { ...bus, ...changed })).toBe(0);
    for (const changed of [{ visible: false }, { seated: true }, { activity: 'walking' as const }])
      expect(communityPassengerAttention(passenger, { ...pose, ...changed }, bus)).toBe(0);
    expect(communityPassengerAttention(COMMUNITY_ROSTER[0], pose, bus)).toBe(0);
    expect(communityPassengerAttention(passenger, pose, { ...bus, x: NaN })).toBe(0);
  });
  it('follows real service hours and stop state without inventing an arrival', () => {
    expect(communityBusNotice(sampleCommunityBus(7.03))).toBe('BUS ON ROUTE');
    expect(communityBusNotice(sampleCommunityBus(7.3))).toBe('BUS AT THE STOP');
    const between = sampleCommunityBus(9.9);
    expect(between.visible).toBe(false);
    expect(communityBusNotice(between)).toBe('BUS ON ROUTE');
    for (const hour of [0, 5.9, 22, 23])
      expect(communityBusNotice(sampleCommunityBus(hour))).toBe('SERVICE HOURS\n06:00 TO 22:00');
    const held = sampleCommunityBus(advanceCommunityBusClock(7.85, 0.1, true));
    expect(communityBusNotice(held)).toBe('BUS AT THE STOP');
    expect(communityBusNotice(null)).toBe('ROUTE INFORMATION');
    expect(communityBusNotice({})).toBe('ROUTE INFORMATION');
  });
});

it('rests ordinary operators on stopped lines without overriding fault, maintenance or quality duties', () => {
  const person = COMMUNITY_ROSTER.find((p) => p.id === 'mill-operator-west')!;
  const pose = { ...sampleCommunityPerson(person, 12), activity: 'working' as const };
  const operations = {
    machines: [{ id: person.machineId!, status: 'idle' as const }],
    workOrders: [],
    batches: [],
    bakeryStocked: false,
  };
  const before = structuredClone({ pose, operations });
  expect(communityWorkResponse(person, pose, operations)).toEqual({
    activity: 'idle',
    task: 'Line stopped: waiting for production to resume',
  });
  expect(
    communityWorkResponse(person, pose, {
      ...operations,
      machines: [{ id: person.machineId!, status: 'running' }],
    })
  ).toEqual({ activity: 'working', task: pose.task });
  expect(
    communityWorkResponse(person, pose, {
      ...operations,
      machines: [{ id: person.machineId!, status: 'warning' }],
    }).activity
  ).toBe('working');
  expect(
    communityWorkResponse(person, pose, {
      ...operations,
      workOrders: [{ machineId: person.machineId!, phase: 'verification' }],
    }).task
  ).toBe('Reviewing post-repair verification');
  const quality = COMMUNITY_ROSTER.find((p) => p.role === 'Quality')!;
  expect(
    communityWorkResponse(quality, pose, {
      ...operations,
      machines: [{ id: quality.machineId!, status: 'idle' }],
      batches: [{ packerId: 'packer-2', disposition: 'hold', availableKg: 20 }],
    }).activity
  ).toBe('working');
  for (const activity of ['break', 'walking'] as const)
    expect(communityWorkResponse(person, { ...pose, activity }, operations).activity).toBe(
      activity
    );
  expect({ pose, operations }).toEqual(before);
});

it('holds a greeting through centimetre-scale nearest-neighbour jitter and releases absent recipients', () => {
  const shop = COMMUNITY_ROSTER.find((p) => p.id === 'village-shopkeeper')!;
  const a = COMMUNITY_ROSTER.find((p) => p.id === 'village-neighbour')!;
  const b = { ...a, id: 'second-neighbour' };
  const pose = {
    position: [0, 0, 0] as [number, number, number],
    rotation: 0,
    activity: 'idle' as const,
    task: 'Greeting a neighbour',
    seated: false,
    visible: true,
  };
  const first = { ...pose, position: [-0.05, 0, 2] as [number, number, number] };
  const second = { ...pose, position: [0.05, 0, 2.01] as [number, number, number] };
  const actors = [
    { person: a, pose: first },
    { person: b, pose: second },
  ];
  const out = createCommunityGreeting();
  expect(sampleCommunityGreeting(shop, pose, actors, out).targetId).toBe(a.id);
  for (const z of [1.99, 2.01, 1.98, 2.02]) {
    second.position[2] = z;
    expect(sampleCommunityGreeting(shop, pose, actors, out).targetId).toBe(a.id);
  }
  second.position[2] = 1.2;
  expect(sampleCommunityGreeting(shop, pose, actors, out).targetId).toBe(b.id);
  second.visible = false;
  expect(sampleCommunityGreeting(shop, pose, actors, out).targetId).toBe(a.id);
  // CommunityLife re-seeds this scratch object from the replayed motion field.
  second.visible = true;
  second.position[2] = 1.99;
  out.targetId = null;
  expect(sampleCommunityGreeting(shop, pose, actors, out).targetId).toBe(b.id);
  second.visible = false;
  first.position[2] = -2;
  expect(sampleCommunityGreeting(shop, pose, actors, out)).toEqual({ targetId: null, yaw: 0 });
});

describe('analytic seat arrival and departure support', () => {
  it('places, lowers, rises and releases on every unchanged authored seat route', () => {
    // Looping routines; a village day (door to door) is checked in its own test.
    for (const person of COMMUNITY_ROSTER.filter((p) => !p.day)) {
      let start = -person.phase;
      for (let i = 0; i < person.stops.length; i++) {
        const node = person.stops[i],
          next = person.stops[(i + 1) % person.stops.length];
        if (node.seated) {
          const sample = (at: number) => sampleCommunityPerson(person, start + at);
          const beginning = sample(1e-7),
            settled = sample(node.hours * 0.5),
            standing = sample(node.hours - COMMUNITY_SEAT_RAMP.standing / 2),
            outgoing = sample(node.hours + 0.00001),
            incoming = sample(-0.00001);
          expect(beginning.seat?.amount, person.id).toBeLessThan(0.001);
          expect(settled.seat).toMatchObject({
            amount: 1,
            support: 1,
            position: node.position,
            rotation: node.rotation,
          });
          expect(standing.seated).toBe(true);
          expect(standing.seat?.amount).toBe(0);
          expect(standing.position).toEqual(node.position);
          expect(outgoing.seated).toBe(false);
          expect(outgoing.seat).toMatchObject({ amount: 0, support: 1 });
          expect(incoming.seat).toMatchObject({ amount: 0, support: 1 });
          for (let j = 0; j <= 60; j++) {
            const at = (node.hours * j) / 60,
              p = sample(Math.min(node.hours - 1e-7, at + 1e-7));
            expect(p.position).toEqual(node.position);
            expect(p.seat!.amount).toBeGreaterThanOrEqual(0);
            expect(p.seat!.amount).toBeLessThanOrEqual(1);
            expect(p.seat!.support).toBe(1);
          }
        }
        start +=
          node.hours +
          Math.hypot(node.position[0] - next.position[0], node.position[2] - next.position[2]) *
            WALK_HOURS_PER_METRE;
      }
    }
  });
  it('resets reused cue output on special branches and bounds short route windows', () => {
    const person = {
      id: 'short-seat',
      role: 'Resident',
      district: 'mill' as const,
      phase: 0,
      stops: [
        {
          position: [0, 0, 0] as [number, number, number],
          rotation: 0,
          hours: 0.03,
          activity: 'break' as const,
          task: 'Rest',
          seated: true,
        },
        {
          position: [0.1, 0, 0] as [number, number, number],
          rotation: 0,
          hours: 0.02,
          activity: 'idle' as const,
          task: 'Stand',
        },
      ],
    };
    const out = sampleCommunityPerson(person, 0.015);
    for (let t = 0; t < routineDuration(person); t += 0.0002) {
      sampleCommunityPerson(person, t, out);
      if (out.seat) {
        expect(
          Object.values({ amount: out.seat.amount, support: out.seat.support }).every(
            (v) => Number.isFinite(v) && v >= 0 && v <= 1
          )
        ).toBe(true);
        if (out.seat.amount > 0) expect(out.seat.support).toBe(1);
      }
    }
    // Hours when each special-route person has no seat (the commuters are riding).
    for (const [id, hour] of [
      ['village-cyclist', 12],
      ['village-courier', 12],
      ['bus-arriving', 12],
      ['bus-departing', 8],
    ] as const) {
      sampleCommunityPerson(person, 0.015, out);
      expect(out.seat).toBeDefined();
      sampleCommunityPerson(COMMUNITY_ROSTER.find((p) => p.id === id)!, hour, out);
      expect(out.seat, id).toBeUndefined();
    }
    // A seated commuter replaces a reused cue with its own bench place.
    sampleCommunityPerson(person, 0.015, out);
    sampleCommunityPerson(COMMUNITY_ROSTER.find((p) => p.id === 'bus-departing')!, 12, out);
    expect(out.seat?.position).not.toEqual(person.stops[0].position);
    expect(out.seat?.rotation).toBe(-Math.PI / 2);
    sampleCommunityPerson(person, NaN, out);
    expect(out.seat?.amount ?? 0).not.toBeNaN();
  });
});

function activeHandoffFixture() {
  let state = createWorkplace('game', 17);
  const run = (command: Parameters<typeof transitionWorkplace>[1]) => {
    const result = transitionWorkplace(state, command);
    expect(result.changed).toBe(true);
    state = result.state;
  };
  run({ type: 'beginImprovement', args: ['cooperative', state.revision] });
  run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
  run({ type: 'acknowledgeImprovement', args: [] });
  for (const member of state.members) {
    run({ type: 'understand', args: [member.id] });
    run({ type: 'vote', args: [member.id, true] });
  }
  run({ type: 'activate', args: [state.revision] });
  return state;
}

it('shows a paid briefing for mapped residents in an active handoff trial', () => {
  const active = activeHandoffFixture();
  const before = JSON.stringify(active);
  for (const person of COMMUNITY_ROSTER) {
    const cue = communityAgreementCue(person.id, active);
    if (!Object.hasOwn(COMMUNITY_AGREEMENT_MEMBERS, person.id)) {
      expect(cue).toBeNull();
      continue;
    }
    expect(cue?.state).toBe('briefing');
    expect(cue?.offDuty).toBe(false);
    expect(cue?.label).toContain('Paid handoff briefing');
    const pose = sampleCommunityPerson(person, 12);
    const position = [...pose.position];
    const response = { activity: pose.activity, task: pose.task };
    communityAgreementResponse(cue, pose, response);
    expect(response.activity).toBe('idle');
    expect(response.task).toContain('paid handoff briefing');
    expect(advanceCommunityAgreementClock(12, 0.2, cue)).toBe(12);
    expect(pose.position).toEqual(position);
  }
  expect(JSON.stringify(active)).toBe(before);
});

it('ends the briefing cue at its real boundary or stop, without losing protected recovery', () => {
  const active = activeHandoffFixture();
  for (const minute of [0, 4.999, 5, 75]) {
    const cue = communityAgreementCue('mill-packer', { ...active, minute });
    expect(cue?.state).toBe(minute < 5 ? 'briefing' : minute < 75 ? 'duty' : 'rest');
  }
  for (const change of [{ stopped: true }, { funded: false }, { proposalId: 'buffer' as const }])
    expect(
      communityAgreementCue('mill-packer', {
        ...active,
        improvement: { ...active.improvement!, ...change },
      })?.state
    ).toBe('duty');
  const review = { ...active, phase: 'review' as const };
  expect(communityAgreementCue('mill-packer', review)).toBeNull();
  review.members.find((member) => member.id === 'packing')!.recoveryOwedMinutes = 3;
  expect(communityAgreementCue('mill-packer', review)?.state).toBe('recovery');
  expect(communityAgreementCue('mill-packer', active)?.state).toBe('recovery');
  for (const mode of ['pilot', 'workshop'] as const)
    expect(communityAgreementCue('mill-packer', { ...active, mode })).toBeNull();
});
