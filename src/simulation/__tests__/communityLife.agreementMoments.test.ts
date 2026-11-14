import { describe, expect, it } from 'vitest';
import {
  AGREEMENT_GATHER_MINUTES,
  AGREEMENT_GATHER_SPOTS,
  COMMUNITY_AGREEMENT_MEMBERS,
  COMMUNITY_ROSTER,
  communityAgreementCue,
  placeCommunityAgreement,
  routineDuration,
  sampleCommunityPerson,
} from '../communityLife';
import { createWorkplace, transitionWorkplace } from '../bilateralWorkplace';
import { COMMUNITY_ANCHORS } from '../../constants/communityLayout';
import {
  FACILITY_DOOR_APPROACHES,
  FACILITY_FITTINGS,
  FACILITY_PLANTERS,
} from '../../components/facilities/facilityLayout';
import type { WorkplaceState } from '../../types/workplace';

// Plan item 5.11. The season carried state on four people's billboards and no
// events. Working if, as an agreement starts, the four mapped people stand
// together outside the staff room (D-057), on Monday's hold Quality stands at
// the packer with the sample, and nobody on a break is moved (D-058).

/** A season shift just activated at minute 0: its `activated` receipt is the start. */
function activated(): WorkplaceState {
  const s = transitionWorkplace(createWorkplace(), {
    type: 'startCampaign',
    args: ['cooperative', 1],
  }).state;
  s.phase = 'active';
  s.events = [
    ...s.events,
    { id: 'e-x', minute: 0, actorId: 'team', kind: 'activated', detail: '' },
  ];
  return s;
}

const mapped = COMMUNITY_ROSTER.filter((person) => COMMUNITY_AGREEMENT_MEMBERS[person.id]);
/** An hour in the person's routine where they are on their feet, not on a break. */
const onFoot = (person: (typeof COMMUNITY_ROSTER)[number]) => {
  for (let hour = 0; hour < routineDuration(person); hour += 0.01) {
    const pose = sampleCommunityPerson(person, hour);
    if (pose.activity !== 'break' && !pose.seated) return hour;
  }
  throw new Error(`${person.id} is never on foot`);
};

describe('5.11: the season in the scene', () => {
  it('as an agreement starts, the four stand together outside the staff room, a place each', () => {
    const s = activated();
    const door = FACILITY_DOOR_APPROACHES.find((a) => a.door === 'staff-room-door')!.outside;
    const placed = mapped.map((person) => {
      const pose = sampleCommunityPerson(person, onFoot(person));
      placeCommunityAgreement(communityAgreementCue(person.id, s), pose);
      return { person, pose };
    });
    for (const { person, pose } of placed) {
      const spot = AGREEMENT_GATHER_SPOTS[COMMUNITY_AGREEMENT_MEMBERS[person.id]];
      expect(pose.position).toEqual(spot);
      expect(pose.activity).toBe('idle');
      expect(Math.hypot(pose.position[0] - door[0], pose.position[2] - door[2])).toBeLessThan(2.5);
    }
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(
          Math.hypot(
            placed[i].pose.position[0] - placed[j].pose.position[0],
            placed[i].pose.position[2] - placed[j].pose.position[2]
          )
        ).toBeGreaterThanOrEqual(0.6);
    // Each place is on open floor: clear of the planters and fittings by a body's width.
    for (const spot of Object.values(AGREEMENT_GATHER_SPOTS))
      for (const box of [...FACILITY_PLANTERS, ...FACILITY_FITTINGS])
        expect(
          spot[0] < box.minX - 0.3 ||
            spot[0] > box.maxX + 0.3 ||
            spot[2] < box.minZ - 0.3 ||
            spot[2] > box.maxZ + 0.3
        ).toBe(true);
    // A moment only: once its minutes have run, everyone is back on their routine.
    s.minute = AGREEMENT_GATHER_MINUTES;
    for (const person of mapped)
      expect(communityAgreementCue(person.id, s)?.placement).toBeUndefined();
  });

  it('nobody on a break is pulled out to gather, and no one outside the four is moved', () => {
    const s = activated();
    const packer = COMMUNITY_ROSTER.find((p) => p.id === 'mill-packer')!;
    let hour = 0;
    while (sampleCommunityPerson(packer, hour).activity !== 'break') hour += 0.01;
    const before = sampleCommunityPerson(packer, hour);
    const pose = sampleCommunityPerson(packer, hour);
    placeCommunityAgreement(communityAgreementCue(packer.id, s), pose);
    expect(pose).toEqual(before);
    for (const id of ['mill-packing-quiet', 'mill-quality-bench', 'mill-supervisor'])
      expect(communityAgreementCue(id, s)).toBeNull();
  });

  it('on Monday’s hold, Quality stands at the packer with the sample', () => {
    const s = activated();
    s.minute = 31;
    s.campaign = {
      ...s.campaign!,
      shift: 1,
      decision: 'inspect',
      inspectionUntilMinute: 36,
      inspectionComplete: false,
      mondaySample: { batchId: 'batch-00042', heldAtMinute: 31 },
    };
    const quality = COMMUNITY_ROSTER.find((p) => p.id === 'mill-quality')!;
    const pose = sampleCommunityPerson(quality, onFoot(quality));
    const cue = communityAgreementCue(quality.id, s);
    placeCommunityAgreement(cue, pose);
    expect(pose.position).toEqual([...COMMUNITY_ANCHORS.millInspection.position]);
    expect(pose.rotation).toBe(COMMUNITY_ANCHORS.millInspection.rotation);
    // The hold over, Quality goes back to its routine.
    s.campaign.inspectionComplete = true;
    expect(communityAgreementCue(quality.id, s)?.placement).toBeUndefined();
  });
});
