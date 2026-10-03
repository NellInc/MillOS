import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceCompanion } from './WorkplaceCompanion';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { campaignRecord } from '../../../simulation/workplaceCampaign';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';

beforeEach(() => useWorkplaceStore.setState({ workplace: createWorkplace() }));
afterEach(cleanup);
const show = () => {
  const onOpen = vi.fn();
  render(<WorkplaceCompanion onOpen={onOpen} />);
  return onOpen;
};

describe('live working agreement companion', () => {
  it('offers optional Thursday scene navigation without changing agreement choices', () => {
    useWorkplaceStore.getState().startCampaign('cooperative', 19);
    const state = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: { ...state, campaign: { ...state.campaign!, shift: 2 } },
    });
    const before = useWorkplaceStore.getState().workplace;
    show();
    fireEvent.click(screen.getByRole('button', { name: 'View packing floor' }));
    expect(useCameraStore.getState().activePreset).toBe(
      CAMERA_PRESETS.findIndex((preset) => preset.name === 'Packing')
    );
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    useCameraStore.getState().cancelAnimation();
  });
  it.each(['idle', 'workshop', 'pilot'] as const)('leaves %s in its dedicated surface', (mode) => {
    if (mode !== 'idle') useWorkplaceStore.getState().start(mode, 19);
    show();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    'shows fresh terms for %s without recording authority',
    (profile) => {
      useWorkplaceStore.getState().startCampaign(profile, 19);
      const before = useWorkplaceStore.getState().workplace;
      const onOpen = show();
      expect(screen.getByText('Earn a fresh agreement')).toBeInTheDocument();
      expect(screen.getByText('These terms still need a fresh agreement.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open agreement controls' }));
      expect(onOpen).toHaveBeenCalledOnce();
      expect(useWorkplaceStore.getState().workplace).toBe(before);
      expect(
        before.members.every((m) => !m.understood && m.ballot === null && m.coverConsent === null)
      ).toBe(true);
    }
  );

  it('does not announce ready terms after a real plan revision', () => {
    useWorkplaceStore.getState().start('game', 19);
    const store = useWorkplaceStore.getState();
    for (const m of store.workplace.members) {
      store.understand(m.id);
      store.vote(m.id, true);
    }
    const { rerender } = render(<WorkplaceCompanion onOpen={vi.fn()} />);
    expect(
      screen.getByText('Current terms are ready for your explicit approval.')
    ).toBeInTheDocument();
    store.selectPlan('cover');
    rerender(<WorkplaceCompanion onOpen={vi.fn()} />);
    expect(
      screen.queryByText('Current terms are ready for your explicit approval.')
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Invite voluntary cover, revision/)).toBeInTheDocument();
  });

  it('keeps paid, delivered and owed amounts separate across a retained shift', () => {
    useWorkplaceStore.getState().startCampaign('team', 19);
    const state = useWorkplaceStore.getState().workplace;
    const past = campaignRecord({
      ...state,
      members: state.members.map((m) => ({
        ...m,
        compensationPaid: m.id === 'packing' ? 8 : 0,
        recoveryMinutes: m.id === 'packing' ? 10 : 0,
      })),
    });
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'review',
        campaign: { ...state.campaign!, shift: 1, history: [past] },
        members: state.members.map((m) => ({
          ...m,
          recoveryOwedMinutes: m.id === 'packing' ? 4 : 0,
        })),
      },
    });
    show();
    expect(screen.getByText('8.00 illustrative credits.')).toBeInTheDocument();
    expect(screen.getByText('10.0 min delivered; 4.0 min owed.')).toBeInTheDocument();
    expect(screen.getByText(/Future authority has ended/)).toBeInTheDocument();
  });

  it.each(['packing', 'mind'] as const)('preserves the %s raiser and open remedy', (actor) => {
    useWorkplaceStore.getState().start('game', 19);
    useWorkplaceStore.getState().object(actor, 'authority');
    const before = useWorkplaceStore.getState().workplace;
    show();
    expect(screen.getByText('An objection needs its raiser')).toBeInTheDocument();
    expect(screen.getByText(/Only its raiser can confirm resolution/)).toHaveTextContent(
      actor === 'mind' ? 'Adviser' : 'Packing'
    );
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    expect(before.objections[0].status).toBe('open');
  });

  it('routes a protected inspection hold using the same live guide as the chapter', () => {
    useWorkplaceStore.getState().startCampaign('team', 19);
    const s = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: { ...s, phase: 'active', minute: 25, campaign: { ...s.campaign!, shift: 1 } },
    });
    show();
    expect(screen.getByText('Quality reviews the line')).toBeInTheDocument();
  });

  it('keeps blocked dispatch and the full deferred commitment explicit', () => {
    useWorkplaceStore.getState().startCampaign('cooperative', 19);
    const s = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: {
        ...s,
        campaign: {
          ...s.campaign!,
          mission: {
            orderId: 'o',
            customer: 'Customer',
            materialSessionId: 'session',
            startingShippedKg: 0,
            originalTargetKg: 1000,
            targetKg: 800,
            observedShippedKg: 800,
            creditedKg: 800,
            manifestIds: ['real'],
            evidence: 'stale',
          },
        },
      },
    });
    show();
    expect(screen.getByText('800 / 800 kg; evidence blocked.')).toBeInTheDocument();
    expect(screen.getByText('200 kg.')).toBeInTheDocument();
  });
});
