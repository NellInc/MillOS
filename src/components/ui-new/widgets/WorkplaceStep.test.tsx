import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutonomyPanel } from './AutonomyPanel';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  WORKPLACE_PLANS,
  createWorkplace,
  saveWorkplace,
} from '../../../simulation/bilateralWorkplace';
import { WORKPLACE_CHECKS, requiredChecks } from '../../../simulation/workplaceCampaign';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { executeAgentCommand } from '../../../agent/client/executeAgentCommand';
import type { AgentCommandClientResult } from '../../../agent/client/executeAgentCommand';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { setLocale, type Locale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));
// Behind the plant disclosure either way; its own tests cover it.
vi.mock('./AgentCockpit', () => ({ AgentCockpit: () => null }));
const execute = vi.mocked(executeAgentCommand);

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
  // Approval goes through the agent command; here it runs the store's own.
  execute.mockImplementation(async (request) => {
    const result = useWorkplaceStore
      .getState()
      .activate((request.parameters as { revision: number }).revision);
    // As the runtime handler does: a refused activation throws its reason.
    if (!result.changed) throw new Error(result.reason ?? 'Agreement did not activate.');
    return {
      preview: { status: 'requires-approval', authority: { reasons: [] }, problems: [] },
      approval: null,
      receipt: {
        status: result.changed ? 'verified' : 'rejected',
        receiptId: 'receipt-step',
        problems: [],
      },
    } as unknown as AgentCommandClientResult;
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

/**
 * Words a player can read without opening anything: text nodes, less option
 * lists (closed selects), screen-reader-only text and the bodies of closed
 * disclosures (their summaries count).
 */
function visibleWords(root: Element): number {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return ` ${node.textContent ?? ''} `;
    if (!(node instanceof Element)) return '';
    if (['OPTION', 'SCRIPT', 'STYLE'].includes(node.tagName)) return '';
    if (node.getAttribute('aria-hidden') === 'true' || node.classList.contains('sr-only'))
      return '';
    if (node.tagName === 'DETAILS' && !node.hasAttribute('open'))
      return [...node.children]
        .filter((child) => child.tagName === 'SUMMARY')
        .map(walk)
        .join(' ');
    return [...node.childNodes].map(walk).join(' ');
  };
  return walk(root)
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

const table = () => screen.getByRole('table', { name: 'Who has answered' });
/** Who still has to act, read off the table alone: a "Not yet" cell or a live control. */
function stillToAct(): string[] {
  return within(table())
    .getAllByRole('row')
    .slice(1)
    .filter(
      (row) =>
        within(row)
          .queryAllByRole('cell')
          .some((cell) => cell.textContent === 'Not yet') ||
        within(row)
          .queryAllByRole('button')
          .some((b) => !(b as HTMLButtonElement).disabled)
    )
    .map((row) => within(row).getByRole('rowheader').firstChild?.textContent ?? '');
}

describe('5.1: the Autonomy panel shows the next step only', () => {
  it.each(['en', 'pt-BR'] as Locale[])(
    'opens on under 150 words in every first-open state (%s)',
    (locale) => {
      setLocale(locale);
      fulfilFirstDelivery();
      const counts: Record<string, number> = {};
      const { container } = render(<AutonomyPanel />);
      counts.idle = visibleWords(container);
      act(() => {
        useWorkplaceStore.getState().startMission('toe-dip', 17);
      });
      counts.deliberating = visibleWords(container);
      act(() => {
        const s = useWorkplaceStore.getState();
        for (const id of requiredChecks('packing'))
          s.answerCheck('packing', id, WORKPLACE_CHECKS.find((c) => c.id === id)!.correct);
        s.understand('packing');
        s.vote('packing', true);
        s.simulateResponses({});
        s.activate(s.workplace.revision);
      });
      counts.running = visibleWords(container);
      cleanup();
      // Member governance adds the chair ballot to its first deliberation.
      useWorkplaceStore.setState({ workplace: createWorkplace() });
      useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
      useOperationsCampaignStore.getState().initializeCampaign();
      fulfilFirstDelivery();
      useWorkplaceStore.getState().startMission('cooperative', 17);
      counts.memberGovernance = visibleWords(render(<AutonomyPanel />).container);
      cleanup();
      // Idle again, with one archived season listed.
      const archived = useWorkplaceStore.getState().workplace;
      useWorkplaceStore.setState({
        workplace: createWorkplace(),
        completedCampaigns: [
          saveWorkplace({ ...archived, phase: 'review', minute: 90 }) as typeof archived,
        ],
      });
      counts.idleWithArchive = visibleWords(render(<AutonomyPanel />).container);
      process.stdout.write(`\n@@WORDS ${locale} ${JSON.stringify(counts)}\n`);
      for (const [state, words] of Object.entries(counts))
        expect(words, `${locale} ${state}`).toBeLessThan(150);
    }
  );

  it('says at the Approve button why an approval did not run (RESTART LINE pending)', async () => {
    fulfilFirstDelivery();
    useWorkplaceStore.getState().startMission('toe-dip', 17);
    render(<WorkplaceLab />);
    for (const id of requiredChecks('packing')) {
      const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
      fireEvent.change(screen.getByLabelText(q.prompt), { target: { value: q.correct } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Packing understands the terms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Packing: policy yes' }));
    // CLEAR, with the units still idle: the line waits for RESTART LINE.
    useGameSimulationStore.setState({
      preEmergencyMachineStatuses: new Map([['rm-101', 'running']]),
    });
    const approve = screen.getByRole('button', { name: `Approve ${WORKPLACE_PLANS[0].title}` });
    await act(async () => {
      fireEvent.click(approve);
    });
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('RESTART LINE');
    expect(approve.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('approves a first shift in eight clicks or fewer from first open', async () => {
    // A click is one pointer action: a button press or one choice in a select.
    let clicks = 0;
    const click = (name: string) => {
      clicks += 1;
      fireEvent.click(screen.getByRole('button', { name }));
    };
    const choose = (label: string, value: string) => {
      clicks += 1;
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    fulfilFirstDelivery();
    render(<AutonomyPanel />);
    click('Start 3-shift cooperative season (1x)');
    for (const id of requiredChecks('packing')) {
      const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
      choose(q.prompt, q.correct);
    }
    click('Packing understands the terms');
    click('Packing: policy yes');
    await act(async () => {
      click(`Approve ${WORKPLACE_PLANS[0].title}`);
    });
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    expect(clicks).toBeLessThanOrEqual(8);
    expect(clicks).toBe(7);
  });

  it('shows a start refusal at the button it answers', () => {
    render(<WorkplaceLab />);
    const start = screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' });
    fireEvent.click(start);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The cooperative season starts after the first delivery.');
    expect(start.getAttribute('aria-describedby')).toBe(alert.id);
    expect(start.nextElementSibling).toBe(alert);
  });

  it('puts the facilitator tools, replay and exports behind one closed disclosure', () => {
    fulfilFirstDelivery();
    useWorkplaceStore.getState().startMission('toe-dip', 17);
    const { container } = render(<WorkplaceLab />);
    const tools = screen.getByText('Facilitator tools').closest('details')!;
    expect(tools).not.toHaveAttribute('open');
    for (const name of ['Shift', 'Review', 'Experiment'])
      expect(tools).toContainElement(screen.getByRole('button', { name }));
    expect(container.querySelectorAll('details:not([open]) > summary')).not.toHaveLength(0);
  });
});

describe('5.2: the role table', () => {
  const start = (profile: 'toe-dip' | 'team' = 'toe-dip') => {
    fulfilFirstDelivery();
    useWorkplaceStore.getState().startMission(profile, 17);
    render(<WorkplaceLab />);
  };
  const agree = () => {
    for (const id of requiredChecks('packing')) {
      const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
      fireEvent.change(screen.getByLabelText(q.prompt), {
        target: { value: q.correct },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Packing understands the terms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Packing: policy yes' }));
  };

  it('names who still has to act, from the table alone', () => {
    start();
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Role', 'Understands', 'Policy vote', 'Cover']);
    expect(stillToAct()).toEqual([
      'Packing (you)',
      'Quality',
      'Maintenance',
      'Coordinator',
      'Adviser',
    ]);
    agree();
    expect(stillToAct()).toEqual([]);
  });

  it('only Packing’s row has live controls; the others show their answers, in words', () => {
    start();
    for (const role of ['quality', 'maintenance', 'coordinator', 'mind']) {
      const row = table().querySelector(`[data-role="${role}"]`)!;
      expect(
        within(row as HTMLElement)
          .queryAllByRole('button')
          .every((b) => (b as HTMLButtonElement).disabled)
      ).toBe(true);
    }
    agree();
    // No reason line under a role's name (D-012, review 2): each row's answers
    // are its cells, in words, with no number about the member (D-058).
    for (const role of ['quality', 'maintenance', 'coordinator', 'mind']) {
      const row = table().querySelector(`[data-role="${role}"]`) as HTMLElement;
      expect(within(row).getByRole('rowheader').querySelector('span.block')).toBeNull();
      const cells = within(row).getAllByRole('cell');
      expect(cells[0].textContent, role).toBe('Yes');
      for (const cell of cells) expect(cell.textContent).not.toMatch(/\d/);
    }
  });

  it('puts each objection’s Resolve on its raiser’s row, live only on Packing’s', () => {
    start();
    act(() => {
      useWorkplaceStore.getState().object('packing', 'rest');
      useWorkplaceStore
        .getState()
        .respondToPressure(
          useWorkplaceStore.getState().workplace.campaign!.draw!.pressures[0],
          'accept-demand'
        );
    });
    const objection = useWorkplaceStore
      .getState()
      .workplace.objections.find((o) => o.actorId !== 'packing')!;
    const own = screen.getByRole('button', { name: 'Resolve the rest objection: Packing' });
    expect(own).toBeEnabled();
    expect(table().querySelector('tr')?.parentElement).toBeTruthy();
    const raiserRow = table().querySelector(`[data-role="${objection.actorId}"]`) as HTMLElement;
    const theirs = within(raiserRow).getByRole('button', { name: /^Resolve the / });
    expect(theirs).toBeDisabled();
  });

  it('a refusal moves the camera to the role that said no', () => {
    start('team');
    act(() => {
      useWorkplaceStore.getState().selectPlan('resequence');
      // Books under a shift's wages after the purchase: the Coordinator says no.
      const w = useWorkplaceStore.getState().workplace;
      useWorkplaceStore.setState({
        workplace: { ...w, finance: { ...w.finance, cash: 180, initialCapital: 180 } },
      });
    });
    useCameraStore.setState({ activePreset: null });
    agree();
    expect(
      useWorkplaceStore.getState().workplace.members.find((m) => m.id === 'coordinator')?.ballot
    ).toBe(false);
    expect(useCameraStore.getState().activePreset).toBe(
      CAMERA_PRESETS.findIndex((p) => p.name === 'Milling')
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The Coordinator says no');
  });
});
