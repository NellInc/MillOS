import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildProgramme,
  openRush,
  programmeShift,
  PROGRAMME_RUSH,
  type ProgrammeShift,
} from './programmes';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import type { CustomerOrder } from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';
import { setLocale } from '../i18n';

const SHIFTS: ProgrammeShift[] = ['morning', 'afternoon', 'night'];
const templates = () => useOperationsCampaignStore.getInitialState().orders;
const TRUCK_KG = 5000;

/** Activation order the tick uses: priority, then due time. */
const rank = (order: CustomerOrder) =>
  order.priority === 'critical' ? 0 : order.priority === 'high' ? 1 : 2;
const byActivation = (orders: CustomerOrder[]) =>
  [...orders].sort((a, b) => rank(a) - rank(b) || a.dueAtMinute - b.dueAtMinute);

/**
 * The most kilograms per minute any deadline asks for, from acceptance:
 * everything activated up to and including an order must ship by its due.
 */
function peakDemandKgPerMinute(orders: CustomerOrder[], acceptedAt: number) {
  let cumulative = 0;
  let peak = 0;
  for (const order of byActivation(orders)) {
    cumulative += order.requiredKg;
    peak = Math.max(peak, cumulative / (order.dueAtMinute - acceptedAt));
  }
  return peak;
}

beforeEach(() => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
});

describe('later delivery programmes', () => {
  it('rotates the rush customer and varies mass and slack by shift', () => {
    const rushes = [2, 3, 4, 5].map(
      (n) => buildProgramme(templates(), n, 'afternoon', 0)[0].customer
    );
    expect(rushes).toEqual([
      'Community Pasta Works',
      'County School Meals',
      "Riverside Bakers' Cooperative",
      'Community Pasta Works',
    ]);
    const day = buildProgramme(templates(), 2, 'afternoon', 600);
    const night = buildProgramme(templates(), 2, 'night', 600);
    expect(day.map((o) => o.requiredKg)).toEqual([2500, 3000, 6000]);
    expect(night.map((o) => o.requiredKg)).toEqual([2500, 3000, 8000]);
    expect(day.map((o) => o.dueAtMinute - 600)).toEqual([150, 300, 420]);
    expect(night.map((o) => o.dueAtMinute - 600)).toEqual([150, 300, 540]);
    // Deterministic: the same inputs give the same programme.
    expect(buildProgramme(templates(), 7, 'night', 90)).toEqual(
      buildProgramme(templates(), 7, 'night', 90)
    );
    // Not the old clone: no programme is three equal orders of one shape.
    for (const shift of SHIFTS)
      expect(new Set(buildProgramme(templates(), 3, shift, 0).map((o) => o.requiredKg)).size).toBe(
        3
      );
  });

  it('makes the rush a real trade: paid more, due soon, late at double the penalty', () => {
    const base = Object.fromEntries(templates().map((order) => [order.customer, order]));
    for (let n = 2; n <= 4; n++) {
      const [rush, ...rest] = buildProgramme(templates(), n, 'morning', 0);
      const usual = base[rush.customer];
      expect(rush.priority).toBe('critical');
      expect(rush.rushPremiumPercent).toBe(PROGRAMME_RUSH.premiumPercent);
      expect(rush.revenuePerKg).toBeCloseTo(usual.revenuePerKg * 1.3, 3);
      expect(rush.latePenaltyPerKgHour).toBeCloseTo(usual.latePenaltyPerKgHour * 2, 3);
      expect(rush.requiredKg).toBeLessThanOrEqual(TRUCK_KG);
      // Every other order keeps its customer's usual terms.
      for (const order of rest) {
        expect(order.rushPremiumPercent).toBeUndefined();
        expect(order.revenuePerKg).toBe(base[order.customer].revenuePerKg);
      }
    }
    // Programme 2's rush (semolina on corn) is the only order on its grain:
    // running it first means a changeover each way.
    expect(openRush(buildProgramme(templates(), 2, 'morning', 0))).toMatchObject({
      order: { customer: 'Community Pasta Works' },
      onlyOnItsGrain: true,
    });
    expect(openRush(buildProgramme(templates(), 3, 'morning', 0))?.onlyOnItsGrain).toBe(false);
  });

  it('never asks more of any deadline than the guided first programme, for every programme and shift', () => {
    // The guided programme is met on time at pace 30 through real trucks
    // (UnifiedGameTick.playableJourney.test.ts), from a cold start: its first
    // order is 6,000 kg in 240 min, and the whole programme 18,000 kg in 480.
    const guided = templates();
    const guidedFirst = guided[0].requiredKg / guided[0].dueAtMinute;
    const guidedWhole = peakDemandKgPerMinute(guided, 0);
    expect(guidedFirst).toBe(25);
    expect(guidedWhole).toBe(37.5);
    for (let n = 2; n <= 13; n++)
      for (const shift of SHIFTS) {
        const programme = buildProgramme(guided, n, shift, 1000);
        // With margin: the rush asks at most 80% of the first order's rate,
        // and no deadline asks more than 80% of the whole programme's.
        expect(programme[0].requiredKg / PROGRAMME_RUSH.windowMinutes).toBeLessThanOrEqual(
          guidedFirst * 0.8
        );
        expect(peakDemandKgPerMinute(programme, 1000)).toBeLessThanOrEqual(guidedWhole * 0.8);
        // The rush fits one truck and the bulk order at most two.
        expect(programme[0].requiredKg).toBeLessThanOrEqual(TRUCK_KG);
        for (const order of programme)
          expect(Math.ceil(order.requiredKg / TRUCK_KG)).toBeLessThanOrEqual(2);
        // The controller's activation order is the order the card lists.
        expect(byActivation(programme).map((o) => o.id)).toEqual(programme.map((o) => o.id));
      }
  });

  it('reads the shift from a window key', () => {
    expect(programmeShift('day-0-morning')).toBe('morning');
    expect(programmeShift('day-3-afternoon')).toBe('afternoon');
    expect(programmeShift('day-2-night')).toBe('night');
    expect(programmeShift(null)).toBe('morning');
  });
});

describe('accepting the next programme', () => {
  const fulfilAll = () => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      orders: state.orders.map((order) => ({
        ...order,
        status: 'fulfilled' as const,
        shippedKg: order.requiredKg,
        completedAtMinute: state.elapsedMinutes,
      })),
      activeOrderId: null,
    });
  };

  it('counts programmes, rotates them and starts the line on the rush recipe', () => {
    useOperationsCampaignStore.setState({
      elapsedMinutes: 480,
      currentShiftKey: 'day-0-afternoon',
    });
    fulfilAll();
    expect(useOperationsCampaignStore.getState().acceptNextProgramme('operator')).toBe(true);
    let state = useOperationsCampaignStore.getState();
    expect(state.programmeCount).toBe(1);
    const second = state.orders.slice(-3);
    expect(second.map((o) => [o.customer, o.requiredKg, o.dueAtMinute])).toEqual([
      ['Community Pasta Works', 2500, 630],
      ['County School Meals', 3000, 780],
      ["Riverside Bakers' Cooperative", 6000, 900],
    ]);
    expect(state.activeOrderId).toBe(second[0].id);
    expect(state.execution).toMatchObject({
      orderId: second[0].id,
      recipeId: 'fine_semolina',
      sourceMaterial: 'corn_grain',
      finishedMaterial: 'semolina',
      remainingKg: 2500,
    });
    expect(state.logbook.at(-1)?.message).toBe(
      'Accepted programme 2: rush Community Pasta Works 2,500 kg, 11,500 kg in all. Existing material and genealogy remain unchanged.'
    );
    // Accepted on the night shift, the next one carries the larger bulk order.
    useOperationsCampaignStore.setState({ currentShiftKey: 'day-0-night' });
    fulfilAll();
    expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(true);
    state = useOperationsCampaignStore.getState();
    expect(state.programmeCount).toBe(2);
    expect(state.orders.slice(-3).map((o) => [o.customer, o.requiredKg])).toEqual([
      ['County School Meals', 2500],
      ["Riverside Bakers' Cooperative", 3000],
      ['Community Pasta Works', 8000],
    ]);
    // Ids stay unique across programmes.
    expect(new Set(state.orders.map((o) => o.id)).size).toBe(state.orders.length);
  });
});

describe('the programme offer', () => {
  it.each([
    [
      'en',
      'Creates three customer commitments, 11,500 kg in all (13,500 kg on the night shift): a one-truck rush that pays 30% more but is due within 2h 30m and costs double the usual late penalty, a 3,000 kg order and a two-truck bulk order. The rush customer changes with each programme. Existing stock remains available; no goods or revenue are created.',
    ],
    [
      'pt-BR',
      'Cria três compromissos com clientes, 11.500 kg no total (13.500 kg no turno da noite): um pedido urgente de um caminhão, que paga 30% a mais, mas vence em 2h 30min e custa o dobro da multa usual por atraso, um pedido de 3.000 kg e um pedido a granel de dois caminhões. O cliente urgente muda a cada programa. O estoque existente continua disponível; nenhum produto ou faturamento é criado.',
    ],
  ] as const)('describes the programme it creates (%s)', (locale, copy) => {
    setLocale(locale);
    try {
      const state = useOperationsCampaignStore.getState();
      const play = deriveOperationsPlay({
        ...state,
        orders: state.orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
        activeOrderId: null,
      });
      expect(play.nextAction.kind).toBe('programme');
      expect(play.nextAction.consequence).toBe(copy);
    } finally {
      setLocale('en');
    }
  });
});
