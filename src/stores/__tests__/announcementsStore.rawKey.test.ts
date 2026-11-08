import { beforeEach, describe, expect, it } from 'vitest';
import { defineMessages } from '../../i18n';
import { keyedText, registerAlertCatalog } from '../../i18n/alertCopy';
import {
  isUnresolvedPALine,
  useAnnouncementsStore,
  type Announcement,
  type AnnouncementsStore,
} from '../announcementsStore';
import { selectAnnouncementForDisplay } from '../../components/game/PAAnnouncementSystem';

/*
 * 2026-11-07: a PA caption read "packingLineVerified". The line was made while
 * its key did not resolve (translate answers a miss with the key itself), so
 * its stored message was the key too, and the fallback showed it. Working if
 * no PA caption, voice line or transcript row is ever a bare catalogue key.
 */
const catalog = defineMessages({
  en: { kept: 'Alarm on R.M. 101.' },
  'pt-BR': { kept: 'Alarme em R.M. 101.' },
});
registerAlertCatalog('rawKeyTest', catalog);

const restored = (rows: unknown[]): Announcement[] => {
  const merge = useAnnouncementsStore.persist.getOptions().merge!;
  return (merge({ announcements: rows }, useAnnouncementsStore.getState()) as AnnouncementsStore)
    .announcements;
};

describe('a PA line that is only its key', () => {
  beforeEach(() => {
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
    });
  });

  it('is never queued', () => {
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'success',
      message: 'packingLineVerified',
      priority: 2,
      copy: { catalog: 'gameSharedPA', key: 'packingLineVerified' },
    });
    useAnnouncementsStore.getState().addAnnouncement({ type: 'info', message: '  ', priority: 2 });
    expect(useAnnouncementsStore.getState().announcements).toEqual([]);
  });

  it('is never chosen for display, even if one is already in the queue', () => {
    const line = (id: string, message: string, key: string): Announcement => ({
      id,
      type: 'success',
      message,
      timestamp: new Date(0),
      dismissed: false,
      priority: 3,
      channel: 'operational',
      tone: 'literal',
      audience: 'all',
      cooldownMs: 0,
      copy: { catalog: 'gameSharedPA', key },
    });
    const raw = line('raw', 'packingLineVerified', 'packingLineVerified');
    expect(isUnresolvedPALine(raw)).toBe(true);
    expect(selectAnnouncementForDisplay([raw], false)).toBeNull();
    const good = line('good', 'Alarm on R.M. 101.', 'machineCritical');
    expect(selectAnnouncementForDisplay([raw, good], false)?.id).toBe('good');
  });

  it('reads as nothing rather than as the key', () => {
    expect(
      keyedText({ catalog: 'gameSharedPA', key: 'packingLineVerified' }, 'packingLineVerified')
    ).toBe('');
    // A key that stopped resolving after the line was made reads its stored words.
    expect(keyedText({ catalog: 'rawKeyTest', key: 'gone' }, 'Packing line verified.')).toBe(
      'Packing line verified.'
    );
    expect(keyedText({ catalog: 'rawKeyTest', key: 'kept' }, 'stale')).toBe('Alarm on R.M. 101.');
  });

  it('is dropped from a restored transcript, with the retired all-is-well lines', () => {
    const row = (message: string, key?: string) => ({
      id: message,
      type: 'info',
      message,
      timestamp: new Date(0).toISOString(),
      ...(key ? { copy: { catalog: 'gameSharedPA', key } } : {}),
    });
    const rows = restored([
      row('packingLineVerified', 'packingLineVerified'),
      row('The mill is calm. Measured, not hoped.', 'millIsCalm'),
      row('Daily target 25% packed.', 'milestone25'),
      row('Alarm on R.M. 101.', 'machineCritical'),
      row('Forklift emergency stop.'),
    ]);
    expect(rows.map((entry) => entry.message)).toEqual([
      'Alarm on R.M. 101.',
      'Forklift emergency stop.',
    ]);
  });
});
