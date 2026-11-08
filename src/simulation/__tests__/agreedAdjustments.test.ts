import { describe, expect, it } from 'vitest';
import {
  AGREED_ADJUSTMENTS,
  QUIET_ROOM_BOOKINGS,
  VISUAL_ALERT_PEOPLE,
  mobilityAidFor,
  quietRoomBookingAt,
} from '../agreedAdjustments';
import {
  COMMUNITY_ROSTER,
  WALK_HOURS_PER_METRE,
  routineDuration,
  sampleCommunityPerson,
} from '../communityLife';
import {
  QUIET_ROOM,
  TOWN_HALL_PORTICO,
  TOWN_HALL_RAIL_HALF_WIDTH,
  TOWN_HALL_RAMP,
  TOWN_HALL_RAMP_RAILS,
  TOWN_HALL_STEP_FREE_ROUTE,
  TOWN_HALL_STEP_TACTILE,
  WHEELCHAIR,
  WHEELCHAIR_PUSH,
  LONG_CANE,
  longCanePoints,
  townHallRampHeight,
  wheelchairHandPoint,
} from '../../constants/accessibilityLayout';
import { crossingTactilePads, padNormalY } from '../../components/accessibility/accessGeometry';
import { railwayRoadCrossing } from '../../components/exterior/railwayRoadGeometry';
import { LAKE_APPROACH_PATH } from '../../constants/publicRealmLayout';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';
import { hallDressingSolids } from '../../components/infrastructure/hallDressingLayout';
import { aiEngineMessages } from '../../utils/aiEngine.messages';
import { aiAccommodationMessages } from '../../utils/aiAccommodation.messages';

/** Whole-day sweeps; their run time follows machine load, not the code. */
const SWEEP = { timeout: 60_000 };
const roster = new Map(COMMUNITY_ROSTER.map((person) => [person.id, person]));
const aided = COMMUNITY_ROSTER.filter((person) => person.mobility);
/** Town hall frame from world (accessibilityLayout TOWN_HALL_FRAME, half turn). */
const toHall = (x: number, z: number) => [-190 - x, 20 - z] as const;

describe('agreed adjustments register', () => {
  it('names only roster people, with the aid their routine is drawn with', () => {
    for (const entry of AGREED_ADJUSTMENTS) {
      const person = roster.get(entry.personId);
      expect(person, entry.personId).toBeDefined();
      expect(person!.mobility, entry.personId).toBe(entry.aid);
      expect(entry.adjustments.length, entry.personId).toBeGreaterThan(0);
    }
    for (const person of aided) expect(mobilityAidFor(person.id)).toBe(person.mobility);
    expect(VISUAL_ALERT_PEOPLE).toEqual(['mill-operator-east']);
  });

  it('holds no number about anyone: every field is a word or a list of words', () => {
    for (const entry of AGREED_ADJUSTMENTS)
      for (const value of Object.values(entry)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) expect(typeof item, JSON.stringify(entry)).toBe('string');
      }
    // A booking holds hours of a room, not a measure of its user.
    for (const booking of QUIET_ROOM_BOOKINGS)
      expect(Object.keys(booking).sort()).toEqual(['end', 'personId', 'start']);
  });

  it('describes adjustments, never conditions, in the AI copy of both languages', () => {
    const diagnosis =
      /\b(deaf|blind|disab|impair|handicap|suffer|condition|diagnos|autis|cripple|confined|surd|ceg|deficien|portador|sofre)/i;
    for (const catalogue of [aiEngineMessages, aiAccommodationMessages])
      for (const locale of ['en', 'pt-BR'] as const)
        for (const [key, text] of Object.entries(catalogue[locale]))
          if (catalogue === aiAccommodationMessages || key.startsWith('access'))
            expect(text, `${locale} ${key}`).not.toMatch(diagnosis);
  });
});

describe('the people who use the adjustments', () => {
  it('keeps every wheelchair user seated in their own chair, never on a seat cue', SWEEP, () => {
    for (const person of aided.filter((p) => p.mobility === 'wheelchair')) {
      const span = person.day ? 24 : routineDuration(person);
      for (let h = 0; h < span; h += 0.002) {
        const pose = sampleCommunityPerson(person, h);
        if (!pose.visible) continue;
        expect(pose.seated, `${person.id} at ${h}`).toBe(true);
        expect(pose.seat, `${person.id} at ${h}`).toBeUndefined();
      }
    }
  });

  it(
    'routes every aided person step-free: no rise steeper than 1:12, levels only on the ramp',
    SWEEP,
    () => {
      for (const person of aided) {
        const step = 0.0004;
        let previous = sampleCommunityPerson(person, 0);
        for (let h = step; h < 24; h += step) {
          const pose = sampleCommunityPerson(person, h);
          const run = Math.hypot(
            pose.position[0] - previous.position[0],
            pose.position[2] - previous.position[2]
          );
          const rise = Math.abs(pose.position[1] - previous.position[1]);
          if (pose.visible && previous.visible)
            expect(rise, `${person.id} at ${h}`).toBeLessThanOrEqual(run / 12 + 1e-9);
          // Anywhere off the ground and below the landing is on the ramp itself.
          const y = pose.position[1];
          if (pose.visible && y > 1e-6 && y < TOWN_HALL_RAMP.landingY - 1e-6) {
            const [lx, lz] = toHall(pose.position[0], pose.position[2]);
            const ramp = townHallRampHeight(lx, lz);
            expect(ramp, `${person.id} on the ramp at ${h}`).not.toBeNull();
            expect(Math.abs(ramp! - y), `${person.id} on the ramp surface at ${h}`).toBeLessThan(
              1e-6
            );
          }
          previous = pose;
        }
      }
    }
  );

  it('builds the ramp to 1:12 with a level landing between two flights', () => {
    for (const flight of TOWN_HALL_RAMP.flights) {
      const going = Math.abs(flight.fromZ - flight.toZ);
      expect(Math.abs(flight.fromY - flight.toY) / going).toBeLessThanOrEqual(1 / 12 + 1e-9);
    }
    const landing = TOWN_HALL_RAMP.midLanding;
    expect(Math.abs(landing.fromZ - landing.toZ)).toBeGreaterThanOrEqual(1.5);
    expect(TOWN_HALL_RAMP.flights[0].fromY).toBe(TOWN_HALL_RAMP.landingY);
    expect(TOWN_HALL_RAMP.flights[1].toY).toBe(0);
    // Wide enough for the chair, push rims included, inside the rails.
    expect(TOWN_HALL_RAMP.maxX - TOWN_HALL_RAMP.minX - 0.12).toBeGreaterThan(
      2 * WHEELCHAIR.halfWidth
    );
  });

  it('takes the step-free route round the front of the portico column, clear of the rails', () => {
    const route = TOWN_HALL_STEP_FREE_ROUTE;
    const p = TOWN_HALL_PORTICO;
    const clear = WHEELCHAIR.halfWidth + 0.1;
    const near = (x: number, z: number, a: readonly number[], b: readonly number[]) => {
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    };
    for (let i = 1; i < route.length; i++) {
      const a = [route[i - 1][0], route[i - 1][2]],
        b = [route[i][0], route[i][2]];
      // The east column's base, at the front.
      expect(near(-p.columnX, p.columnZ, a, b) - p.columnRadius, `leg ${i}`).toBeGreaterThan(clear);
      for (let t = 0; t <= 1; t += 0.02) {
        const x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t;
        for (const rail of TOWN_HALL_RAMP_RAILS)
          expect(near(x, z, rail.from, rail.to) - TOWN_HALL_RAIL_HALF_WIDTH).toBeGreaterThan(clear);
        // On the portico landing beside the steps (not where the apron carries
        // on level in front of it), a chair stays between the wall and the nosing.
        if (
          Math.abs(x) <= p.landingHalfX &&
          x > TOWN_HALL_RAMP.apron.maxX &&
          route[i][1] === TOWN_HALL_RAMP.landingY &&
          z < p.nosingZ
        ) {
          expect(z - WHEELCHAIR.halfWidth).toBeGreaterThanOrEqual(p.wallZ);
          expect(z + WHEELCHAIR.halfWidth).toBeLessThanOrEqual(p.nosingZ);
        }
        // Everywhere off the portico it is on the ramp, its landing or apron.
        if (Math.abs(x) > p.landingHalfX && z > TOWN_HALL_RAMP.flights[1].toZ)
          expect(townHallRampHeight(x, z), `${x}, ${z}`).not.toBeNull();
      }
    }
    expect(route[0]).toEqual([0, TOWN_HALL_RAMP.landingY, expect.any(Number)]);
  });

  it('marks the head and the foot of the town hall steps with hazard paving', () => {
    const [foot, head] = TOWN_HALL_STEP_TACTILE;
    expect(foot.y).toBe(0);
    expect(head.y).toBe(TOWN_HALL_RAMP.landingY);
    // The steps run from the landing (z 5.9) out to the bottom nosing (z 7.3).
    expect(foot.minZ).toBeGreaterThan(7.3);
    expect(head.maxZ).toBeLessThan(5.9);
    for (const pad of [foot, head]) expect(pad.maxZ - pad.minZ).toBeCloseTo(0.4, 6);
  });

  it('gives the railway road zebra dropped kerbs with blister paving on both', () => {
    const crossing = railwayRoadCrossing(LAKE_APPROACH_PATH);
    expect(crossing.aprons).toHaveLength(2);
    const pads = crossingTactilePads();
    expect(pads).toHaveLength(2);
    for (const [index, pad] of pads.entries()) {
      const apron = crossing.aprons[index];
      const edge = [apron[1], apron[apron.length - 2]];
      // Two corners on the dropped kerb's road edge, two 0.8 m back along the path.
      const onEdge = pad.filter((corner) =>
        edge.some((point) => point[0] === corner[0] && point[1] === corner[1])
      );
      expect(onEdge).toHaveLength(2);
      const backCorners = pad.filter((corner) => !onEdge.includes(corner));
      for (const corner of backCorners)
        expect(
          Math.min(...edge.map((point) => Math.hypot(corner[0] - point[0], corner[1] - point[1])))
        ).toBeCloseTo(0.8, 6);
      // Both pads face up, so neither renders lit from below.
      expect(padNormalY(pad)).toBeGreaterThan(0);
    }
  });

  it('keeps the seated technician and the quiet-room user on open hall floor', SWEEP, () => {
    const obstacles = [
      ...createMachineObstacles(0.33),
      ...createConveyorObstacles(),
      ...DOCK_PLATFORM_OBSTACLES,
      ...hallDressingSolids().filter((solid) => solid.minY < 1.2),
    ];
    for (const id of ['mill-quality-bench', 'mill-packing-quiet']) {
      const person = roster.get(id)!;
      const margin = person.mobility === 'wheelchair' ? WHEELCHAIR.halfWidth : 0.25;
      for (let h = 0; h < routineDuration(person); h += 0.002) {
        const [x, , z] = sampleCommunityPerson(person, h).position;
        for (const o of obstacles)
          expect(
            x > o.minX - margin &&
              x < o.maxX + margin &&
              z > o.minZ - margin &&
              z < o.maxZ + margin,
            `${id} meets ${o.id} at ${x},${z}`
          ).toBe(false);
      }
    }
  });

  it('takes the quiet-room break in the booked half hours', () => {
    const person = roster.get('mill-packing-quiet')!;
    for (const booking of QUIET_ROOM_BOOKINGS) {
      for (const at of [
        booking.start + 0.01,
        (booking.start + booking.end) / 2,
        booking.end - 0.01,
      ]) {
        const pose = sampleCommunityPerson(person, at);
        expect(pose.task, `${at}`).toBe('Break in the quiet room');
        expect(pose.position).toEqual([...QUIET_ROOM.seat]);
        expect(quietRoomBookingAt(at)).toBe(booking);
      }
      expect(sampleCommunityPerson(person, booking.end + 0.02).task).not.toBe(
        'Break in the quiet room'
      );
    }
    // Walking pace, as everyone else.
    expect(WALK_HOURS_PER_METRE).toBeGreaterThan(0);
  });
});

describe('mobility aid shapes', () => {
  it('keeps the palm on the push rim through the push and lifts it clear to recover', () => {
    const hand = { x: 0, y: 0, z: 0, onRim: true };
    for (let i = 0; i <= 100; i++) {
      const phase = (i / 100) * Math.PI * 2;
      wheelchairHandPoint(1, phase, hand);
      const r = Math.hypot(hand.y - WHEELCHAIR.axleY, hand.z - WHEELCHAIR.axleZ);
      if (i / 100 < WHEELCHAIR_PUSH.contact) {
        expect(r).toBeCloseTo(WHEELCHAIR.rimRadius, 9);
        expect(hand.x).toBeCloseTo(WHEELCHAIR.rimX, 9);
      } else expect(r).toBeGreaterThanOrEqual(WHEELCHAIR.rimRadius - 1e-9);
    }
  });

  it('keeps the cane rigid with its tip on the ground across the sweep', () => {
    const grip = { x: 0, y: 0, z: 0 },
      tip = { x: 0, y: 0, z: 0 };
    for (const sweep of [-1, -0.5, 0, 0.5, 1]) {
      longCanePoints(sweep, grip, tip);
      expect(Math.hypot(tip.x - grip.x, tip.y - grip.y, tip.z - grip.z)).toBeCloseTo(
        LONG_CANE.length,
        9
      );
      expect(tip.y).toBeCloseTo(0.02, 9);
      expect(tip.z).toBeGreaterThan(grip.z);
    }
  });
});
