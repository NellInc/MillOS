import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutPlanner } from './LayoutPlanner';
import { useProductionStore } from '../../../stores/productionStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { canonicalProcessMachines } from '../../../simulation/materialTransport';
import type { MachineData } from '../../../types';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
  type LogisticsObservation,
} from '../../../stores/logisticsLayoutStore';
import { setLocale } from '../../../i18n';

// The workspace scores both plans with the real logistics model on render
// (see LayoutPlanner.test.tsx for measured times).
vi.setConfig({ testTimeout: 180_000 });

const priorProduction = useProductionStore.getState();
beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useProductionStore.setState({
    machines: canonicalProcessMachines().map((m) => ({ ...m, status: 'running' })) as MachineData[],
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useGameSimulationStore.getState().setGameSpeed(60);
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useGameSimulationStore.getState().releaseClock('layout');
  useProductionStore.setState(priorProduction, true);
});

// D-012: the planner carried a subtitle and a note under nearly every control
// group. Each line below only explained the screen; what stays is readings,
// results and the one statement that the planning weights change nothing.
const CUT = {
  en: [
    'Plan, pause, apply and run the mill',
    'Vehicle travel and staging distance affect this capacity',
    'Released stock, quality interlocks',
    'Travel estimates use the rounded route',
    'Pickup, dropoff and approach legs are locked',
    'Swept checks use',
    'Transport timing follows',
    'Files download locally',
    'Active seconds are admitted',
    'Run the current mill to collect a baseline',
    'remain fixed',
    'Reserve all 50 pallet spaces',
    'Both drawings show this same observation',
  ],
  'pt-BR': [
    'Planeje, pause, aplique',
    'O deslocamento dos veículos e a distância',
    'O estoque liberado, os intertravamentos',
    'As estimativas de deslocamento',
    'Os trechos de coleta',
    'As verificações de varredura',
    'O tempo de transporte segue',
    'Os arquivos são baixados',
    'Os segundos ativos são',
    'Rode o moinho atual para coletar',
    'permanecem fixos',
    'Reserve todas as 50',
    'Os dois desenhos mostram',
  ],
} as const;

describe('the layout planner without helper text', () => {
  it.each(['en', 'pt-BR'] as const)('renders none of the cut notes in %s', (locale) => {
    setLocale(locale);
    render(<LayoutPlanner onClose={vi.fn()} />);
    const text = document.body.textContent ?? '';
    for (const cut of CUT[locale]) expect(text).not.toContain(cut);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });
});

/**
 * A caption is a paragraph that is neither a live region nor the reason a
 * control points at with aria-describedby. Readouts are dl/table cells, and
 * refusals land in the status line, so a section holding one fails.
 */
function captionsIn(section: HTMLElement): string[] {
  const described = new Set(
    [...document.querySelectorAll('[aria-describedby]')].flatMap((el) =>
      (el.getAttribute('aria-describedby') ?? '').split(/\s+/)
    )
  );
  return [...section.querySelectorAll('p')]
    .filter((p) => !p.getAttribute('role') && !(p.id && described.has(p.id)))
    .map((p) => p.textContent ?? '');
}

const observation = (conditions: string[]): LogisticsObservation => ({
  activeSeconds: 30,
  materialSeconds: 30,
  packedKg: 100,
  shippedKg: 50,
  vehicleMetres: 200,
  completedUnloads: 1,
  conditions,
});

const COPY = {
  en: {
    operate: 'Operate planned layout',
    mill: 'Mill',
    running: 'Running',
    paused: 'Paused',
    revision: 'Layout revision',
    apply: 'Apply to mill',
    pauseFirst: 'Pause the mill before applying or undoing a layout.',
    stagingX: 'shipping staging X (m)',
    loading: /^Dock loading capacity \(kg\/s\)\s*400\s*400$/,
    assumptions: 'Estimate assumptions',
    observed: 'Observed operating results',
    same: /^Pace, line speed, packer and silo status, dispatch release, forklift stop\s*Same before and after$/,
    differ: /forklift stop\s*Changed: not a layout-only result$/,
    pending: /forklift stop\s*Pending$/,
  },
  'pt-BR': {
    operate: 'Operar o layout planejado',
    mill: 'Moinho',
    running: 'Em operação',
    paused: 'Pausado',
    revision: 'Revisão do layout',
    apply: 'Aplicar ao moinho',
    pauseFirst: 'Pause o moinho antes de aplicar ou desfazer um layout.',
    stagingX: 'expedição: área de preparação X (m)',
    loading: /^Capacidade de carregamento da doca \(kg\/s\)\s*400\s*400$/,
    assumptions: 'Premissas das estimativas',
    observed: 'Resultados operacionais observados',
    same: /^Ritmo, velocidade da linha, estado das ensacadeiras e dos silos, liberação da expedição, parada das empilhadeiras\s*Iguais antes e depois$/,
    differ: /parada das empilhadeiras\s*Mudaram: o resultado não é só do layout$/,
    pending: /parada das empilhadeiras\s*Pendente$/,
  },
} as const;

// A readout pair: the definition that follows a term in the operate section.
const readout = (section: HTMLElement, term: string) => {
  const dt = within(section).getByText(term, { selector: 'dt' });
  return dt.nextElementSibling as HTMLElement;
};

describe('the planner facts that were captions now sit in readouts and refusals', () => {
  it.each(['en', 'pt-BR'] as const)(
    'running: the mill state is a readout and Apply refuses with the reason in %s',
    (locale) => {
      setLocale(locale);
      const c = COPY[locale];
      useGameSimulationStore.getState().setGameSpeed(60);
      render(<LayoutPlanner onClose={vi.fn()} />);
      const operate = screen.getByRole('region', { name: c.operate });
      expect(captionsIn(operate)).toEqual([]);
      expect(readout(operate, c.mill)).toHaveTextContent(c.running);
      expect(readout(operate, c.mill).tagName).toBe('DD');
      expect(readout(operate, c.revision)).toHaveTextContent(/^\d+$/);
      fireEvent.change(screen.getByLabelText(c.stagingX), { target: { value: '18' } });
      fireEvent.click(screen.getByRole('button', { name: c.apply }));
      expect(screen.getByRole('status')).toHaveTextContent(c.pauseFirst);
      expect(useLogisticsLayoutStore.getState().layout.staging.shipping[0]).not.toBe(18);
    }
  );

  it.each(['en', 'pt-BR'] as const)('paused: the readout says so in %s', (locale) => {
    setLocale(locale);
    const c = COPY[locale];
    useGameSimulationStore.getState().setGameSpeed(0);
    render(<LayoutPlanner onClose={vi.fn()} />);
    const operate = screen.getByRole('region', { name: c.operate });
    expect(captionsIn(operate)).toEqual([]);
    expect(readout(operate, c.mill)).toHaveTextContent(c.paused);
  });

  it('a hold is the reason the held buttons describe, not a caption', () => {
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
    try {
      render(<LayoutPlanner onClose={vi.fn()} />);
      const operate = screen.getByRole('region', { name: COPY.en.operate });
      expect(captionsIn(operate)).toEqual([]);
      const pause = screen.getByRole('button', { name: 'Pause mill' });
      expect(pause).toBeDisabled();
      expect(pause).toHaveAccessibleDescription('Resolve the site safety hold first.');
    } finally {
      act(() => useSafetyStore.getState().setForkliftEmergencyStop(false));
    }
  });

  it.each(['en', 'pt-BR'] as const)(
    'loading capacity is a comparison row, and the assumptions say they only estimate, in %s',
    (locale) => {
      setLocale(locale);
      const c = COPY[locale];
      render(<LayoutPlanner onClose={vi.fn()} />);
      expect(screen.getByRole('row', { name: c.loading })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: c.assumptions })).toBeInTheDocument();
    }
  );

  it('a conflicted plan reads as a conflict in the loading row, not as a rate', () => {
    const machines = structuredClone(useProductionStore.getState().machines);
    machines[0].position = [-28, 0, -30];
    useProductionStore.setState({ machines });
    render(<LayoutPlanner onClose={vi.fn()} />);
    expect(screen.getByText('receiving: swept route meets silo-0.')).toBeInTheDocument();
    expect(
      screen.getByRole('row', {
        name: /^Dock loading capacity \(kg\/s\)\s*Clearance conflict\s*Clearance conflict$/,
      })
    ).toBeInTheDocument();
  });

  it.each(['en', 'pt-BR'] as const)(
    'the controls comparison is a table row: same, changed, pending in %s',
    (locale) => {
      setLocale(locale);
      const c = COPY[locale];
      const cases: [string[], string[], RegExp][] = [
        [['a'], ['a'], c.same],
        [['a'], ['b'], c.differ],
        [['a'], ['a', 'b'], c.differ],
        [['a'], [], c.pending],
      ];
      for (const [before, after, row] of cases) {
        act(() =>
          useLogisticsLayoutStore.setState({
            before: observation(before),
            observation: observation(after),
            retainedAfter: null,
          })
        );
        const view = render(<LayoutPlanner onClose={vi.fn()} />);
        const observed = screen.getByRole('region', { name: c.observed });
        expect(captionsIn(observed)).toEqual([]);
        expect(within(observed).getByRole('row', { name: row })).toBeInTheDocument();
        view.unmount();
      }
    }
  );
});
