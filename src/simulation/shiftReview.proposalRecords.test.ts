import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildShiftReport,
  type CampaignLogEntry,
  type ShiftCampaignMetrics,
} from '../stores/operationsCampaignStore';
import { setLocale } from '../i18n';
import * as review from './shiftReview';
import type { PartnerProposal } from './partnerProposals';

// Plan 3.0 left this open (carried to 3.2 and 3.4): a partner proposal's
// record line was written to the campaign log as a controller line, and a
// report keeps only the last eight controller lines, so over ten shifts 6 of
// 23 records reached a review. It was also stored in the language active when
// it was written. Working if every record compared in a window reaches that
// window's report through its own field, worded at read time, and a report
// saved before the field reads as having none.

const proposal = (id: string, optionId: string): PartnerProposal =>
  ({
    id,
    kind: 'service',
    subject: `service-${id}`,
    raisedAtMinute: 10,
    windowMinutes: 30,
    options: [],
    defaultOptionId: 'service',
    facts: {
      machineId: 'rm-101',
      machineName: 'R.M. 101',
      alertId: `alert-${id}`,
      wear: 61,
      breakdownWear: 90,
      wearPerMinute: 0.03,
      servicePart: 'bearings',
      failureParts: ['bearings', 'belts'],
      repairMinutes: 44.5,
      workOrderRatePerHour: 90,
      qualityServiced: 99,
      qualityAtFailure: 94,
      strictestMinimum: 95,
    },
    sessionId: 'flow-1',
    status: 'resolved',
    resolution: { optionId, decidedBy: 'partner', atMinute: 40, ran: true },
    comparison: {
      atMinute: 100,
      prices: [
        {
          id: 'service',
          price: {
            currency: 0,
            parts: { bearings: 1 },
            kg: 0,
            minutes: null,
            quality: 99,
            gradeRisk: false,
          },
        },
        {
          id: 'run-on',
          price: {
            currency: 66.75,
            parts: { bearings: 1, belts: 1 },
            kg: 0,
            minutes: null,
            quality: 94,
            gradeRisk: true,
          },
        },
      ],
      chosenOptionId: optionId,
      bestOptionId: 'service',
    },
  }) as PartnerProposal;

const recordWording = (p: PartnerProposal) =>
  (
    review as unknown as { proposalRecordWording: (p: PartnerProposal) => unknown }
  ).proposalRecordWording(p);

let sequence = 0;
const line = (minute: number, message: string, wording?: unknown): CampaignLogEntry =>
  ({
    id: `log-${String(++sequence).padStart(4, '0')}`,
    simulationMinute: minute,
    source: 'AI partner',
    category: 'maintenance',
    message,
    relatedId: null,
    actor: 'controller',
    ...(wording ? { wording } : {}),
  }) as CampaignLogEntry;

const metrics = { commitmentMinutes: 0, dispatchedKg: 0, revenue: 0 } as ShiftCampaignMetrics;

const report = (logbook: CampaignLogEntry[]) =>
  buildShiftReport({
    id: 'period-report-0100',
    shiftKey: 'day-0-afternoon',
    shiftLabel: 'Afternoon',
    startedAtMinute: 0,
    endedAtMinute: 480,
    metrics,
    orders: [],
    logbook,
    risks: [],
    incidents: [],
  });

beforeEach(() => {
  sequence = 0;
  setLocale('en');
});

describe('partner records in the shift review', () => {
  it('keeps every record compared in the window, however much the plant narrated after', () => {
    const records = ['proposal-00001', 'proposal-00002', 'proposal-00003'].map((id) =>
      proposal(id, 'run-on')
    );
    const logbook = [
      ...records.map((p, i) =>
        line(100 + i, review.describeProposalRecord(p, 'en')!, recordWording(p))
      ),
      ...Array.from({ length: 12 }, (_, i) => line(200 + i, `Narration ${i}`)),
    ];
    const built = report(logbook);
    // The narration's tail is eight lines of the latest narration: none of them.
    expect(built.narration?.some((text) => / chose .+ would have cost /.test(text))).toBe(false);
    const lines = review.describeShiftProposals(built, 'en');
    expect(lines).toHaveLength(3);
    // Saved with a verdict, a "run on" record reads without one: its
    // comparison is fixed by arithmetic (review 2, finding 5).
    for (const text of lines) {
      expect(text).toMatch(/ chose .+ would have cost .+\.$/);
      expect(text).not.toMatch(/better\./);
    }
  });

  it('words a record written in English in the reader’s language', () => {
    const p = proposal('proposal-00004', 'run-on');
    const built = report([line(100, review.describeProposalRecord(p, 'en')!, recordWording(p))]);
    const [pt] = review.describeShiftProposals(built, 'pt-BR');
    expect(pt).toBe(review.describeProposalRecord(p, 'pt-BR'));
    expect(pt).toMatch(/teria custado .+\.$/);
    expect(pt).not.toMatch(/A outra resposta era melhor/);
  });

  it('reads a report saved before the field, or with a malformed record, as having none', () => {
    const built = report([]);
    expect(review.describeShiftProposals({ ...built, proposals: undefined }, 'en')).toEqual([]);
    expect(
      review.describeShiftProposals(
        { ...built, proposals: [{ kind: 'unknown' }, null] as never },
        'en'
      )
    ).toEqual([]);
  });
});
