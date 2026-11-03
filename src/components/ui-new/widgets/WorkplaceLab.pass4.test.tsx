import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { WorkplaceCompanion } from './WorkplaceCompanion';
import { WorkplacePressureChapter } from './WorkplacePressureChapter';
import { HandoffConduct } from './WorkplacePackingEvidence';
import type { WorkplaceEvent } from '../../../types/workplace';
import { bilateralWorkplaceMessages } from '../../../simulation/bilateralWorkplace.messages';
import { restoreWorkplace, saveWorkplace } from '../../../simulation/bilateralWorkplace';
import { workplaceCampaignMessages as cm } from '../../../simulation/workplaceCampaign.messages';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/** A linked season whose 6,000 kg order was renegotiated to 4,800 kg, then shipped in full. */
function shippedInFull() {
  useWorkplaceStore.getState().startCampaign('cooperative', 17);
  const state = useWorkplaceStore.getState().workplace;
  useWorkplaceStore.setState({
    workplace: {
      ...state,
      campaign: {
        ...state.campaign!,
        mission: {
          orderId: 'o',
          customer: "Riverside Bakers' Cooperative",
          materialSessionId: useMaterialFlowStore.getState().sessionId,
          startingShippedKg: 0,
          originalTargetKg: 6000,
          targetKg: 4800,
          observedShippedKg: 6000,
          creditedKg: 6000,
          manifestIds: ['real'],
          evidence: 'current',
        },
      },
    },
  });
}

beforeEach(() => {
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useGameSimulationStore.setState({ gameSpeed: 180 });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('linked delivery lines, fourth pass', () => {
  it('reads the review delivery against the full order once it shipped in full, grouped', () => {
    shippedInFull();
    render(<WorkplaceLab />);
    open('Review');
    expect(
      screen.getByText("Delivery: met, 6,000.0 of 6,000 kg for Riverside Bakers' Cooperative.")
    ).toBeInTheDocument();
    expect(screen.getByText('Agreed deferral: 1,200 kg.')).toBeInTheDocument();
  });

  it('reads the shift credit line against the full order once it shipped in full', () => {
    shippedInFull();
    render(<WorkplaceLab />);
    expect(
      screen.getByText(
        /Riverside Bakers' Cooperative: 6,000\.0 \/ 6,000 kg qualified dispatch credit\. Agreed deferral: 1,200 kg\./
      )
    ).toBeInTheDocument();
  });

  it('reads the companion receipts against the full order once it shipped in full', () => {
    shippedInFull();
    render(<WorkplaceCompanion onOpen={() => undefined} />);
    expect(screen.getByText('6,000 / 6,000 kg.')).toBeInTheDocument();
    expect(screen.getByText('Customer dispatch receipts:')).toBeInTheDocument();
    // Nothing of the order is still deferred, so the companion drops that row.
    expect(screen.queryByText(/still part of the full commitment/)).not.toBeInTheDocument();
  });

  it('reads the pressure chapter delivery against the full order once it shipped in full', () => {
    shippedInFull();
    render(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={() => undefined}
      />
    );
    document.querySelectorAll('details').forEach((d) => (d.open = true));
    expect(screen.getByText(/Delivery met: 6,000\.0 \/ 6,000 kg\./)).toBeInTheDocument();
  });
});

const events = (): WorkplaceEvent[] => [
  { id: 'e-1', minute: 0, actorId: 'packing', kind: 'objection', detail: 'one' },
  { id: 'e-2', minute: 0, actorId: 'system', kind: 'settled', detail: 'two' },
  { id: 'e-3', minute: 0, actorId: 'mind', kind: 'objection', detail: 'three' },
  { id: 'e-4', minute: 0, actorId: 'members', kind: 'surplus-decided', detail: 'four' },
];

describe('event receipts name who acted, fourth pass', () => {
  it.each([
    ['en', 'Minute 0.0, Packing: one', 'Minute 0.0, System: two', 'Minute 0.0, Adviser: three'],
    [
      'pt-BR',
      'Minuto 0,0, Ensaque: one',
      'Minuto 0,0, Sistema: two',
      'Minuto 0,0, Conselheiro: three',
    ],
  ] as const)('recorded evidence names roles, not ids, in %s', (locale, a, b, c) => {
    useWorkplaceStore.setState({ workplace: { ...createWorkplace(), events: events() } });
    setLocale(locale);
    render(<WorkplaceLab />);
    open(locale === 'en' ? 'Review' : 'Revisão');
    for (const line of [a, b, c]) expect(screen.getByText(line)).toBeInTheDocument();
    expect(
      screen.getByText(
        locale === 'en' ? 'Minute 0.0, Members: four' : 'Minuto 0,0, Cooperados: four'
      )
    ).toBeInTheDocument();
  });

  it('handoff conduct receipts name roles, not ids', () => {
    render(<HandoffConduct state={{ ...createWorkplace(), events: events() }} />);
    expect(screen.getByText('0.0 min, Packing: one')).toBeInTheDocument();
    expect(screen.getByText('0.0 min, Adviser: three')).toBeInTheDocument();
  });
});

describe('recorded copy follows the language chosen, fourth pass', () => {
  const wm = bilateralWorkplaceMessages;
  it('shows an event receipt recorded in English in Portuguese after a switch', () => {
    const recorded = (detail: string, id: string): WorkplaceEvent => ({
      id,
      minute: 0,
      actorId: 'packing',
      kind: 'ballot',
      detail,
    });
    useWorkplaceStore.setState({
      workplace: {
        ...createWorkplace(),
        events: [
          recorded(wm.en.evBallotApproved, 'e-1'),
          recorded(wm.en.evCoverDeclined, 'e-2'),
          recorded(`disclosure: ${cm.en.disclosureRepair}`, 'e-3'),
          recorded(wm.en.evCheckCorrect.replace('{question}', 'refusal'), 'e-4'),
        ],
      },
    });
    setLocale('pt-BR');
    render(<WorkplaceLab />);
    open('Revisão');
    for (const line of [
      wm['pt-BR'].evBallotApproved,
      wm['pt-BR'].evCoverDeclined,
      `disclosure: ${cm['pt-BR'].disclosureRepair}`,
      wm['pt-BR'].evCheckCorrect.replace('{question}', 'refusal'),
    ])
      expect(screen.getByText(`Minuto 0,0, Ensaque: ${line}`)).toBeInTheDocument();
  });

  it('shows an archived reload reason in the language chosen', () => {
    shippedInFull();
    useWorkplaceStore.setState({
      workplace: { ...useWorkplaceStore.getState().workplace, phase: 'review', reviewReason: 'x' },
    });
    const reloaded = restoreWorkplace(saveWorkplace(useWorkplaceStore.getState().workplace));
    expect(reloaded.reviewReason).toBe(wm.en.reasonReloaded);
    setLocale('pt-BR');
    useWorkplaceStore.setState({ workplace: reloaded });
    render(<WorkplaceLab />);
    open('Revisão');
    expect(screen.getAllByText(new RegExp(wm['pt-BR'].reasonReloaded)).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(wm.en.reasonReloaded))).toBeNull();
    // The review's own shipped line reads against the order too.
    expect(screen.getByText(/Expedidos 6\.000,0 de 6\.000 kg\./)).toBeInTheDocument();
  });
});
