/**
 * Where each forklift's operator changes over: the crew point the forklift
 * parks at, the spot beside its cab the operator steps on and off from, and the
 * bench they take their break on.
 *
 * Both crew points sit on a straight leg of their forklift's own lane, clear of
 * every pickup, dropoff, dock door lane and egress approach, so a forklift
 * parked for a break holds nothing up but itself. The shipping lane lies
 * wholly inside the shipping-dock crossing zone, which only FLT01 ever
 * reserves. The stand is on the driver's (left) side; the bench is reached
 * along a strip no other resident and no other vehicle uses.
 * Working if `forkliftCrew.test.ts` finds every one of those clearances.
 */
import type { Vec3Tuple } from './siteLayout';

export interface ForkliftCrewSite {
  readonly forkliftId: 'forklift-1' | 'forklift-2';
  readonly dock: 'shipping' | 'receiving';
  readonly operatorId: string;
  /** The fleet tag, as painted on the vehicle (FLT01, FLT02). */
  readonly tag: string;
  /** Where the forklift stands while it waits for its operator. */
  readonly crewPoint: Vec3Tuple;
  /** The direction of travel along the lane at the crew point. */
  readonly crewHeading: number;
  /** Beside the cab on the driver's side, facing it. */
  readonly stand: Vec3Tuple;
  readonly standRotation: number;
  /** A single-seat bench: its seat centre, facing out. */
  readonly bench: Vec3Tuple;
  readonly benchRotation: number;
  /** Routine phase, game hours: the two breaks fall two hours apart. */
  readonly phase: number;
}

const PI = Math.PI;

export const FORKLIFT_CREW_SITES: readonly ForkliftCrewSite[] = [
  {
    forkliftId: 'forklift-1',
    dock: 'shipping',
    operatorId: 'mill-forklift-shipping',
    tag: 'FLT01',
    // Outbound along z 42, four metres past the pickup at (-16, 42).
    crewPoint: [-12, 0, 42],
    crewHeading: PI / 2,
    // Between the cab and the shipping conveyor (z 39.8).
    stand: [-12, 0, 40.85],
    standRotation: 0,
    bench: [-20.6, 0, 40.85],
    benchRotation: PI / 2,
    phase: 0.9,
  },
  {
    forkliftId: 'forklift-2',
    dock: 'receiving',
    operatorId: 'mill-forklift-receiving',
    tag: 'FLT02',
    // On the x -35 return leg, south of the west service egress (z -22 to -18).
    crewPoint: [-35, 0, -34],
    crewHeading: PI,
    stand: [-36.15, 0, -34],
    standRotation: PI / 2,
    bench: [-38.6, 0, -34],
    benchRotation: PI / 2,
    phase: 2.9,
  },
];

export const forkliftCrewSite = (forkliftId: string): ForkliftCrewSite | undefined =>
  FORKLIFT_CREW_SITES.find((site) => site.forkliftId === forkliftId);
