/**
 * AGREED ADJUSTMENTS: what disabled colleagues and residents asked for, and
 * what the plant and the village changed in return (D-058).
 *
 * The register is written in the social model: it names the barrier that was
 * removed and the adjustment the person asked for, never a diagnosis, and it
 * holds no number about anyone. Each entry is a standing agreement, reviewed
 * with the person; the factory AI reads it as an instruction it was given
 * (src/utils/aiAccommodation.ts), not as something it worked out by watching.
 *
 * People stay anonymous roles, as in the rest of the roster (communityLife.ts).
 * Working if every entry names a roster person, an aid where one is used, and
 * only adjustments the person asked for (agreedAdjustments.test.ts).
 */

/** A mobility aid the person uses; the scene draws it and poses the body for it. */
export type MobilityAid = 'wheelchair' | 'long-cane';

export type AdjustmentId =
  /** Routes without steps, the platform-free hall floor and the town hall ramp. */
  | 'step-free-route'
  /** A bench whose top is set to the height the person works at, seated. */
  | 'adjustable-bench'
  /** Alarms reach the person as light and vibration as well as sound. */
  | 'visual-alerts'
  /** A booked quiet room for breaks, with loud planned work kept out of it. */
  | 'quiet-room'
  /** Tactile paving at crossings and step edges, and a clear line along the route. */
  | 'tactile-wayfinding'
  /** PA lines shown as captions as well as spoken. */
  | 'captions';

/** Who the adjustment was agreed with: a role, never a person. */
export type AgreedWith = 'shift-supervisor' | 'quality-lead' | 'council-office';

export interface AgreedAdjustments {
  readonly personId: string;
  readonly aid?: MobilityAid;
  readonly adjustments: readonly AdjustmentId[];
  readonly agreedWith: AgreedWith;
}

/** Quiet-room bookings, in plant hours of the day. Stored as the booking, not as
 * anything about the person: start and end of each booked break. */
export interface QuietRoomBooking {
  readonly personId: string;
  readonly start: number;
  readonly end: number;
}

export const AGREED_ADJUSTMENTS: readonly AgreedAdjustments[] = Object.freeze([
  {
    personId: 'mill-quality-bench',
    aid: 'wheelchair',
    adjustments: ['step-free-route', 'adjustable-bench'],
    agreedWith: 'quality-lead',
  },
  {
    personId: 'mill-operator-east',
    adjustments: ['visual-alerts', 'captions'],
    agreedWith: 'shift-supervisor',
  },
  {
    personId: 'mill-packing-quiet',
    adjustments: ['quiet-room'],
    agreedWith: 'shift-supervisor',
  },
  {
    personId: 'village-hall-clerk',
    aid: 'wheelchair',
    adjustments: ['step-free-route'],
    agreedWith: 'council-office',
  },
  {
    personId: 'village-hall-officer',
    aid: 'long-cane',
    adjustments: ['tactile-wayfinding', 'step-free-route'],
    agreedWith: 'council-office',
  },
]);

const BY_PERSON = new Map(AGREED_ADJUSTMENTS.map((entry) => [entry.personId, entry]));

export function agreedAdjustmentsFor(personId: string): AgreedAdjustments | undefined {
  return BY_PERSON.get(personId);
}

export function mobilityAidFor(personId: string): MobilityAid | undefined {
  return BY_PERSON.get(personId)?.aid;
}

export function hasAgreedAdjustment(personId: string, adjustment: AdjustmentId): boolean {
  return BY_PERSON.get(personId)?.adjustments.includes(adjustment) ?? false;
}

/** The people whose alarms must also arrive as light and vibration. */
export const VISUAL_ALERT_PEOPLE: readonly string[] = AGREED_ADJUSTMENTS.filter((entry) =>
  entry.adjustments.includes('visual-alerts')
).map((entry) => entry.personId);

/**
 * The quiet room's standing bookings, one per day. Each is the booked half of
 * the person's own break in the room: their routine (communityLife.ts) takes
 * that break on every four-hour loop, and the booking covers the ones in the
 * working day. Loud planned work is moved out of these windows.
 */
export const QUIET_ROOM_BOOKINGS: readonly QuietRoomBooking[] = Object.freeze([
  { personId: 'mill-packing-quiet', start: 10, end: 10.5 },
  { personId: 'mill-packing-quiet', start: 14, end: 14.5 },
]);

/** The booking a plant hour of the day falls in, if any. */
export function quietRoomBookingAt(hourOfDay: number): QuietRoomBooking | undefined {
  const h = Number.isFinite(hourOfDay) ? ((hourOfDay % 24) + 24) % 24 : -1;
  return QUIET_ROOM_BOOKINGS.find((booking) => h >= booking.start && h < booking.end);
}

const clock = (hour: number) =>
  `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;

/**
 * The quiet room's door sign: its standing bookings, as the room's schedule.
 * A booking is a fact about the room, so it is shown on the room and never on
 * the card of the person who books it (WorldCard). Painted signage, so not
 * translated (src/i18n/GLOSSARY.md); it names nobody.
 */
export function quietRoomBookingSign(): string {
  return `BOOKED ${QUIET_ROOM_BOOKINGS.map((b) => `${clock(b.start)}-${clock(b.end)}`).join('  ')}`;
}
