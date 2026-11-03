import { afterEach, describe, expect, it } from 'vitest';
import { defineMessages, setLocale } from '../index';
import { keyedText, registerAlertCatalog } from '../alertCopy';
import { useAnnouncementsStore } from '../../stores/announcementsStore';

const catalog = defineMessages({
  en: { line: (p: { n: number }) => `Line ${p.n} restarted` },
  'pt-BR': { line: (p: { n: number }) => `Linha ${p.n} reiniciada` },
});
registerAlertCatalog('keyedLineTest', catalog);

describe('keyedText (PA captions and other single keyed lines)', () => {
  afterEach(() => setLocale('en'));

  it('reads a keyed line in the language active now, falling back to the stored text', () => {
    const copy = { catalog: 'keyedLineTest', key: 'line', params: { n: 2 } };
    expect(keyedText(copy, 'stored')).toBe('Line 2 restarted');
    setLocale('pt-BR');
    expect(keyedText(copy, 'stored')).toBe('Linha 2 reiniciada');
    expect(keyedText({ catalog: 'nope', key: 'line' }, 'stored')).toBe('stored');
    expect(keyedText({ catalog: 'keyedLineTest', key: 'missing' }, 'stored')).toBe('stored');
    expect(keyedText(undefined, 'stored')).toBe('stored');
  });

  it('a PA line keeps its keyed copy through the queue and a reload', () => {
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
    });
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Line 2 restarted',
      priority: 2,
      copy: { catalog: 'keyedLineTest', key: 'line', params: { n: 2 } },
    });
    const [line] = useAnnouncementsStore.getState().announcements;
    expect(line.copy).toEqual({ catalog: 'keyedLineTest', key: 'line', params: { n: 2 } });

    const persist = (
      useAnnouncementsStore as unknown as {
        persist: { getOptions: () => { merge?: (p: unknown, c: unknown) => unknown } };
      }
    ).persist;
    const merge = persist.getOptions().merge;
    expect(merge).toBeTypeOf('function');
    const merged = merge!(
      JSON.parse(JSON.stringify({ announcements: [line] })),
      useAnnouncementsStore.getState()
    ) as { announcements: Array<{ copy?: unknown }> };
    expect(merged.announcements[0].copy).toEqual({
      catalog: 'keyedLineTest',
      key: 'line',
      params: { n: 2 },
    });
  });

  it('a keyed line repeated after a language switch is still held by its cooldown', () => {
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
    });
    const copy = { catalog: 'keyedLineTest', key: 'line', params: { n: 3 } };
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Line 3 restarted',
      priority: 2,
      topic: 'machine:line-3',
      copy,
    });
    setLocale('pt-BR');
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Linha 3 reiniciada',
      priority: 2,
      topic: 'machine:line-3',
      copy,
    });
    expect(useAnnouncementsStore.getState().announcements).toHaveLength(1);
  });
});
