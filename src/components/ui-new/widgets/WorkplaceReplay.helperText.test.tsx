import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceReplay, WorkplaceReplayGuide } from './WorkplaceReplay';
import { workplaceReplayMessages } from './WorkplaceReplay.messages';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';
import type { WorkplaceReplayRun } from '../../../types/workplaceReplay';

const replay = vi.hoisted(() => ({
  checkpoint: null as unknown,
  runs: [] as unknown[],
  guided: false,
  activeRunId: null as string | null,
  capture: vi.fn(),
  begin: vi.fn(),
  record: vi.fn(),
  forget: vi.fn(),
  setGuided: vi.fn(),
}));
vi.mock('../../../stores/workplaceReplayStore', () => ({
  useWorkplaceReplayStore: Object.assign(
    (selector?: (state: typeof replay) => unknown) => (selector ? selector(replay) : replay),
    { getState: () => replay }
  ),
  exportWorkplaceReplayReport: () => '{"runs":[]}',
  selectReplayRunLive: (state: { activeRunId: string | null; runs: Array<{ id: string }> }) =>
    state.activeRunId !== null && !state.runs.some((run) => run.id === state.activeRunId),
}));

const originalCreateURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
beforeEach(() => {
  setLocale('en');
  replay.checkpoint = null;
  replay.runs = [];
  replay.guided = false;
  replay.activeRunId = null;
  vi.clearAllMocks();
  useGameSimulationStore.setState({ gameSpeed: 0, clockHolds: [], emergencyActive: false });
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ['createObjectURL', originalCreateURL],
    ['revokeObjectURL', originalRevokeURL],
  ] as const) {
    if (descriptor) Object.defineProperty(URL, name, descriptor);
    else Reflect.deleteProperty(URL, name);
  }
});

// D14: the replay keeps its readouts and refusals; the narration goes.
const CUT = {
  en: [
    'Pause the plant, capture',
    'Capture requires a paused',
    'Replays remain paused',
    'Capture a paused plant to compare',
    'Dispatch totals alone',
    'Hear Packing, Quality',
    'Plant checkpoint stays in memory',
    'Starting conditions match',
    'Illustrative workplace credits',
    'illustrative credits',
    'Start with protected rest',
    'Coordinator-led starts with',
    'Quality may refuse without explaining',
    'Check actual dispatch, protected',
    'this guide never advances',
    'Optional navigation only',
  ],
  'pt-BR': [
    'Pause a planta, capture',
    'A captura exige',
    'As reproduções ficam pausadas',
    'Capture uma planta pausada para comparar',
    'Os totais de expedição, sozinhos',
    'Ouça o Ensaque',
    'O ponto de controle da planta continua',
    'As condições de partida coincidem',
    'Créditos ilustrativos do local',
    'créditos ilustrativos',
    'Comece com descanso protegido',
    'O estatuto Liderado pela coordenação',
    'A Qualidade pode recusar sem explicar',
    'Confira a expedição real',
    'este guia nunca avança',
    'Somente navegação opcional',
  ],
} as const;

const REMOVED_KEYS = [
  'intro',
  'captureRequires',
  'replayNote',
  'hearRoles',
  'closingNote',
  'optionalNavigation',
];

const COPY = {
  en: {
    noCheckpoint: 'No checkpoint yet.',
    unequal: 'Unequal horizons: elapsed time, agreement time or shifts differ.',
    credits: 'Workplace credits',
    downloaded: 'Redacted run report downloaded locally.',
    active: 'The agreement is active.',
    download: 'Download redacted replay report',
  },
  'pt-BR': {
    noCheckpoint: 'Nenhum ponto de controle ainda.',
    unequal: 'Horizontes desiguais: o tempo decorrido, o tempo de acordo ou os turnos diferem.',
    credits: 'Créditos do local de trabalho',
    downloaded: 'Relatório da execução com dados ocultados baixado localmente.',
    active: 'O acordo está ativo.',
    download: 'Baixar o relatório da reprodução com dados ocultados',
  },
} as const;

const run = {
  id: 'run1',
  checkpointId: 'checkpoint',
  profile: 'team',
  planId: 'steady',
  shiftPlans: [{ shift: 0, planId: 'steady' }],
  charter: {
    practices: ['rest'],
    workerAutonomy: 'team',
    governance: 'team-consent',
    aiAuthority: 'advice',
  },
  objectionsRaised: 0,
  objectionsResolved: 0,
  shiftCount: 1,
  elapsedMinutes: 90,
  agreementMinutes: 90,
  targetKg: 600,
  deferredKg: 0,
  dispatchedKg: 123,
  remainingKg: 477,
  manifestIds: ['manifest'],
  materialErrorKg: 0,
  genealogyErrorKg: 0,
  financial: {
    plantRevenue: 200,
    plantCosts: 50,
    workplaceWages: 32,
    compensation: 8,
    improvements: 40,
  },
  members: [],
  receipts: [],
  objections: [],
  refusalsRespected: 0,
  promisesKept: 0,
} satisfies WorkplaceReplayRun;

const text = () => document.body.textContent ?? '';
const navigate = vi.fn();

describe('the matched replay without narration', () => {
  it.each(['en', 'pt-BR'] as const)('the catalogue has no cut key in %s', (locale) => {
    for (const key of REMOVED_KEYS)
      expect(Object.keys(workplaceReplayMessages[locale])).not.toContain(key);
  });

  it.each(['en', 'pt-BR'] as const)('empty, then with runs, reads only state in %s', (locale) => {
    setLocale(locale);
    const c = COPY[locale];
    const view = render(<WorkplaceReplay seed={17} validSeed navigate={navigate} />);
    expect(screen.getByText(c.noCheckpoint, { exact: true })).toBeInTheDocument();
    for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
    replay.checkpoint = {
      customer: 'Local customer',
      remainingKg: 600,
      sourceKg: 800,
      gameDay: 0,
      gameTime: 10,
      seed: 17,
      faults: [],
    };
    replay.runs = [run, { ...run, id: 'run2', profile: 'cooperative', elapsedMinutes: 180 }];
    view.rerender(<WorkplaceReplay seed={17} validSeed navigate={navigate} />);
    expect(screen.getByText(c.unequal, { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText(c.credits, { exact: true })).toHaveLength(2);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:r' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: c.download }));
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`^${c.downloaded}$`));
    for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
  });

  it.each(['en', 'pt-BR'] as const)(
    'each guide card is one next-step line, and the active note one clause, in %s',
    (locale) => {
      setLocale(locale);
      replay.guided = true;
      useWorkplaceStore.setState({ workplace: { ...createWorkplace(), phase: 'active' } });
      for (const section of ['Shift', 'Practices', 'Agreement / Voices', 'Review'] as const) {
        const view = render(<WorkplaceReplayGuide section={section} navigate={navigate} />);
        const card = screen.getByRole('complementary');
        const lines = [...card.querySelectorAll(':scope > p')].map((p) => p.textContent ?? '');
        expect(lines).toHaveLength(2);
        expect(lines[0].match(/\.\s/g)).toBeNull();
        expect(lines[1]).toBe(COPY[locale].active);
        for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
        view.unmount();
      }
    }
  );
});
