import { describe, expect, it } from 'vitest';
import type { CampaignLogEntry } from '../../stores/operationsCampaignStore';
import { SAVED_LOGBOOK_TAIL, savedLogbookWindow } from '../physicalSession';

// Plan wave 3c: the save keeps the logbook as a window. The two readers of an
// older line are the shift report built at close (every line after the open
// window's watermark) and the partner's "last accepted by" (the latest
// programme acceptance). Working if both survive and only settled lines go.

const entry = (n: number, extra: Partial<CampaignLogEntry> = {}): CampaignLogEntry =>
  ({
    id: `log-${String(n).padStart(4, '0')}`,
    simulationMinute: n,
    source: 'Controller',
    category: 'production',
    message: `line ${n}`,
    ...extra,
  }) as CampaignLogEntry;

describe('the saved logbook window', () => {
  const logbook = Array.from({ length: 160 }, (_, i) =>
    entry(i + 1, i === 4 ? { wording: { key: 'logProgrammeAccepted' } as never } : {})
  );

  it('keeps the open window, the latest acceptance and the tail, in order', () => {
    // The open window started after the report written at sequence 70.
    const reports = [{ id: 'period-report-0070', endedAtMinute: 70 }];
    const saved = savedLogbookWindow(logbook, reports, 70);
    const ids = saved.map((e) => e.id);
    expect(ids[0]).toBe('log-0005');
    // Every line of the open window (71 to 160) is kept: the next report reads them.
    for (let n = 71; n <= 160; n++) expect(ids).toContain(`log-${String(n).padStart(4, '0')}`);
    expect(ids).not.toContain('log-0070');
    expect(saved).toHaveLength(1 + 90);
    expect([...ids].sort()).toEqual(ids);
  });

  it('keeps only the tail and the acceptance once the open window is short', () => {
    const reports = [{ id: 'period-report-0158', endedAtMinute: 158 }];
    const saved = savedLogbookWindow(logbook, reports, 158);
    expect(saved).toHaveLength(SAVED_LOGBOOK_TAIL + 1);
    expect(saved[0].id).toBe('log-0005');
    expect(saved.at(-1)?.id).toBe('log-0160');
  });

  it('falls back to the window start minute when no report carries a watermark', () => {
    const saved = savedLogbookWindow(logbook, [], 30);
    expect(saved.map((e) => e.id)).toContain('log-0030');
    expect(saved.map((e) => e.id)).not.toContain('log-0029');
  });

  it('leaves a short log whole', () => {
    expect(savedLogbookWindow(logbook.slice(0, 12), [], 1e9)).toEqual(logbook.slice(0, 12));
  });
});
