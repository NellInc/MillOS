import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { WorkplacePressureChapter } from './WorkplacePressureChapter';
import { WorkplaceFairness } from './WorkplaceParticipation';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

const PT_DISCLOSURE =
  'A Qualidade contesta o compartilhamento obrigatório de explicações. A recusa não exige nenhum motivo particular.';

/** A campaign in which Quality has challenged the disclosure demand. */
const challenged = () => {
  const store = useWorkplaceStore.getState();
  fulfilFirstDelivery();
  expect(store.startCampaign('toe-dip', 17).changed).toBe(true);
  // The fixed order a season begun before seeded draws keeps (5.10), so the
  // disclosure demand falls on the first shift.
  const { workplace } = useWorkplaceStore.getState();
  const { draw: _draw, ...campaign } = workplace.campaign!;
  useWorkplaceStore.setState({ workplace: { ...workplace, campaign } });
  expect(store.respondToPressure('disclosure', 'accept-demand').changed).toBe(true);
};

beforeEach(() => {
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useGameSimulationStore.setState({ gameSpeed: 180 });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('Workplace interface, third pass', () => {
  it('lists a challenged demand in the language chosen, in the Agreement objection record', () => {
    challenged();
    setLocale('pt-BR');
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Acordo / Vozes' }));
    const record = screen.getByRole('group', { name: /^Registro de objeção: Qualidade/ });
    expect(within(record).getByText(new RegExp(PT_DISCLOSURE))).toBeInTheDocument();
  });

  it('lists a challenged demand in the language chosen, in the pressure chapter', () => {
    challenged();
    setLocale('pt-BR');
    render(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={() => undefined}
      />
    );
    expect(screen.getByText(`Aberta: ${PT_DISCLOSURE}`)).toBeInTheDocument();
  });

  it('lists a challenged demand in the language chosen, in the fairness receipt', () => {
    challenged();
    setLocale('pt-BR');
    render(<WorkplaceFairness />);
    expect(screen.getByText(new RegExp(PT_DISCLOSURE))).toBeInTheDocument();
  });

  it('offers a restart only where the engine allows one, never inside a season', () => {
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).changed).toBe(true);
    const view = render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Experiment' }));
    expect(
      screen.queryByRole('button', { name: 'Restart discussion with this seed' })
    ).not.toBeInTheDocument();
    view.unmount();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    expect(useWorkplaceStore.getState().start('game', 17).changed).toBe(true);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Experiment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart discussion with this seed' }));
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
  });

  it('keeps an approach shown as applied after a practice is switched off and on again', () => {
    expect(useWorkplaceStore.getState().start('game', 17).changed).toBe(true);
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Practices' }));
    const applied = screen.getByRole('button', { name: 'Apply Member governance' });
    expect(applied).toHaveAttribute('aria-pressed', 'true');
    const information = screen.getByRole('checkbox', { name: /Open information/ });
    fireEvent.click(information);
    expect(applied).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(information);
    expect(useWorkplaceStore.getState().workplace.practices).toContain('information');
    expect(applied).toHaveAttribute('aria-pressed', 'true');
  });
});
