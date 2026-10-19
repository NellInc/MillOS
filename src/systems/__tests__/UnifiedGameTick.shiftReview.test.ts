import { beforeEach, describe, expect, it } from 'vitest';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { getShiftWindowKey, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { MAX_GAME_SPEED, STANDARD_GAME_SPEED } from '../../simulation/pace';
import { useUIStore } from '../../stores/uiStore';
import { setLocale } from '../../i18n';

let tickCount = 0;
function tickAt(gameSpeed: number, deltaSeconds = 1) {
  unifiedGameTick({
    deltaSeconds,
    gameSpeed,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: tickCount * deltaSeconds,
    tickCount: ++tickCount,
  });
}

beforeEach(() => {
  resetUnifiedTickState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  tickCount = 0;
});

describe('shift window keys', () => {
  it('keys the night by the day on which it started', () => {
    expect(getShiftWindowKey(3, 23, 'night')).toBe('day-3-night');
    expect(getShiftWindowKey(4, 2, 'night')).toBe('day-3-night');
    expect(getShiftWindowKey(0, 2, 'night')).toBe('day-0-night');
    expect(getShiftWindowKey(4, 7, 'morning')).toBe('day-4-morning');
  });

  it('closes one Night report for 22:00 to 06:00 on the real tick', () => {
    useGameSimulationStore.getState().setGameTime(21.5);
    // The fastest pace, 2 game minutes per tick, across midnight to 06:30.
    for (let i = 0; i < 270; i++) tickAt(MAX_GAME_SPEED);
    expect(useGameSimulationStore.getState().gameDay).toBe(1);
    const nights = useOperationsCampaignStore
      .getState()
      .reports.filter((report) => report.shiftKey.endsWith('night'));
    expect(nights).toHaveLength(1);
    expect(nights[0].shiftKey).toBe('day-0-night');
    expect(nights[0].endedAtMinute - nights[0].startedAtMinute).toBeCloseTo(480, 5);
  });
});

describe('a closed shift is announced (row 21)', () => {
  const reviewAlerts = () =>
    useUIStore.getState().alerts.filter((alert) => alert.id.startsWith('shift-review-'));

  beforeEach(() => {
    useUIStore.setState({ alerts: [] });
    useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
  });

  it('raises one notice when the 14:00 boundary writes the Morning report', () => {
    useGameSimulationStore.getState().setGameTime(13.9);
    // Standard pace: 30 game seconds per tick of one second, across 14:00.
    for (let i = 0; i < 20; i++) tickAt(STANDARD_GAME_SPEED);
    const reports = useOperationsCampaignStore.getState().reports;
    expect(reports).toHaveLength(1);
    expect(reviewAlerts()).toEqual([
      expect.objectContaining({
        id: `shift-review-${reports[0].id}`,
        type: 'info',
        title: expect.stringMatching(/^Morning shift closed: /),
        message: expect.stringContaining('Overview'),
      }),
    ]);
    // The PA caption carries it to where the player is looking.
    expect(
      useAnnouncementsStore
        .getState()
        .announcements.filter((a) => /^Morning shift closed: /.test(a.message))
    ).toHaveLength(1);
    for (let i = 0; i < 20; i++) tickAt(STANDARD_GAME_SPEED);
    expect(reviewAlerts()).toHaveLength(1);
  });

  it('announces in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    try {
      useGameSimulationStore.getState().setGameTime(13.9);
      for (let i = 0; i < 20; i++) tickAt(STANDARD_GAME_SPEED);
      expect(reviewAlerts()[0]?.title).toMatch(/^Turno da manhã encerrado: /);
      expect(reviewAlerts()[0]?.message).toContain('Visão geral');
    } finally {
      setLocale('en');
    }
  });

  it('does not announce reports restored from a save', () => {
    useGameSimulationStore.getState().setGameTime(10);
    tickAt(STANDARD_GAME_SPEED);
    const saved = { ...useOperationsCampaignStore.getState() };
    useOperationsCampaignStore.setState({
      reports: [
        {
          id: 'period-report-0099',
          shiftKey: 'day-0-night',
          shiftLabel: 'Night',
          startedAtMinute: 0,
          endedAtMinute: 480,
          metrics: saved.shiftMetrics,
          completedOrderIds: [],
          openRisks: [],
          grade: 'C',
          summary: 'Saved earlier.',
        },
      ],
    });
    tickAt(STANDARD_GAME_SPEED);
    expect(reviewAlerts()).toHaveLength(0);
  });
});
