import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  productionGetState: vi.fn(),
  gameGetState: vi.fn(),
}));

vi.mock('../../stores/productionStore', () => ({
  useProductionStore: {
    getState: harness.productionGetState,
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../stores/gameSimulationStore', () => ({
  useGameSimulationStore: {
    getState: harness.gameGetState,
    subscribe: vi.fn(() => vi.fn()),
  },
}));

// The strategic prompt reads the workplace shift; the real store's import-time
// clock sync needs a full game-simulation store, which this file mocks.
vi.mock('../../stores/workplaceStore', () => ({
  useWorkplaceStore: { getState: () => ({ workplace: { phase: 'idle', members: [] } }) },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    ai: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

type AIEngine = typeof import('../aiEngine');

const makeMachine = (
  id: string,
  metrics: { temperature: number; vibration: number; load: number; wear?: number }
) => ({
  id,
  name: id,
  type: 'ROLLER_MILL' as const,
  position: [0, 0, 0] as [number, number, number],
  size: [1, 1, 1] as [number, number, number],
  rotation: 0,
  status: 'running' as const,
  metrics,
  lastMaintenance: '2026-01-01',
  nextMaintenance: '2027-01-01',
});

describe('aiEngine populated memory contracts', () => {
  let engine: AIEngine;
  let productionState: Record<string, unknown>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    productionState = {
      machines: [],
      metrics: { throughput: 0, efficiency: 0, uptime: 0, quality: 0 },
      aiDecisions: [],
      addAIDecision: vi.fn(() => true),
    };
    harness.productionGetState.mockImplementation(() => productionState);
    harness.gameGetState.mockReturnValue({
      currentShift: 'morning',
      weather: 'clear',
      emergencyDrillMode: false,
    });
    engine = await import('../aiEngine');
  });

  it('retains exactly the ten newest predicted machines', () => {
    for (let index = 0; index < 11; index += 1) {
      productionState.machines = [
        makeMachine(`risk-${index}`, {
          temperature: 90,
          vibration: 5,
          load: 98,
          wear: 90,
        }),
      ];
      engine.generateContextAwareDecision();
    }

    expect(engine.getPredictedEvents().map((event) => event.machineId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `risk-${index + 1}`)
    );
  });

  it('retains the exact latest 100 anomaly records', () => {
    productionState.machines = [
      makeMachine('anomaly-source', {
        temperature: 90,
        vibration: 5,
        load: 98,
        wear: 90,
      }),
    ];

    for (let index = 0; index < 34; index += 1) {
      engine.generateContextAwareDecision();
    }

    const anomalies = engine.getAnomalyHistory();
    expect(anomalies).toHaveLength(100);
    expect(new Set(anomalies.map((entry) => entry.machineId))).toEqual(new Set(['anomaly-source']));
    expect(
      anomalies.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.metric] = (counts[entry.metric] ?? 0) + 1;
        return counts;
      }, {})
    ).toEqual({ load: 34, temperature: 33, vibration: 33 });
  });

  it('retains 60 metric points and normalizes the latest 20 exactly', () => {
    for (let temperature = 0; temperature <= 60; temperature += 1) {
      productionState.machines = [
        makeMachine('trend-source', { temperature, vibration: 0, load: 0 }),
      ];
      engine.generateContextAwareDecision();
    }

    const temperatureTrend = engine.getMetricTrends().get('trend-source-temperature');
    expect(temperatureTrend?.history).toHaveLength(60);
    expect(temperatureTrend?.history.map((point) => point.value)).toEqual(
      Array.from({ length: 60 }, (_, index) => index + 1)
    );
    const sparkline = engine.getSparklineData('trend-source', 'temperature');
    expect(sparkline).toHaveLength(20);
    expect(sparkline[0]).toBe(0);
    expect(sparkline[10]).toBeCloseTo(10 / 19);
    expect(sparkline[19]).toBe(1);
  });

  it('returns deep copies of populated predictions and anomalies', () => {
    productionState.machines = [
      makeMachine('clone-source', {
        temperature: 90,
        vibration: 5,
        load: 98,
        wear: 90,
      }),
    ];
    engine.generateContextAwareDecision();

    const predictions = engine.getPredictedEvents();
    const anomalies = engine.getAnomalyHistory();
    expect(predictions).toHaveLength(1);
    expect(anomalies).toHaveLength(3);

    predictions[0].confidence = -1;
    predictions[0].evidence[0] = 'mutated';
    anomalies[0].severity = 'warning';
    anomalies[0].expectedRange[0] = -1;

    expect(engine.getPredictedEvents()[0]).toMatchObject({
      confidence: 93,
      evidence: ['Temperature 90.0 C', 'Vibration 5.00 mm/s', 'Wear 90.0 percent'],
    });
    expect(engine.getAnomalyHistory()[0]).toMatchObject({
      severity: 'critical',
      expectedRange: [0, 65],
    });
  });
});
