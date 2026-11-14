import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { usePartnerProposalStore } from '../../../stores/partnerProposalStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import {
  raiseProposals,
  type PartnerProposal,
  type PlantWorld,
} from '../../../simulation/partnerProposals';
import { pendingProposalFocus, takeProposalFocus } from '../../proposalCardFocus';
import { setLocale } from '../../../i18n';

// An asked card's bell row opens that card (its window runs out, so the bell
// must lead to it), only while the card is still open. On a phone every
// button in the list is at least 44 px (min-h-11 min-w-11), as elsewhere.

const world: PlantWorld = {
  sessionId: 'session-1',
  minute: 0,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [
    {
      machineId: 'rm-101',
      machineName: 'R.M. 101',
      wear: 62,
      breakdownWear: 90,
      wearPerMinute: 0.039,
      servicePart: 'filters',
      failureParts: ['bearings', 'belts'],
      repairMinutes: 44.5,
      workOrderRatePerHour: 90,
      qualityServiced: 99.5,
      qualityAtFailure: 97.5,
      strictestMinimum: 95,
      openWearAlertId: 'alert-00001',
      brokenDown: false,
      minimumServiceWear: 30,
    },
  ],
};
const asked = (id: string) => ({
  id: `partner-proposal-${id}`,
  type: 'info' as const,
  title: 'Partner proposal',
  message: 'R.M. 101 is worn. Partner: service now. You have 30 min to answer.',
  timestamp: new Date(),
  acknowledged: false,
});

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
  usePartnerProposalStore.getState().reset();
  usePartnerProposalStore.getState().setProposals(
    raiseProposals(world, [], () => 'proposal-00001'),
    1
  );
  useUIStore.setState({ alerts: [asked('proposal-00001'), asked('proposal-00009')] });
});
afterEach(() => {
  cleanup();
  takeProposalFocus(pendingProposalFocus() ?? '');
  usePartnerProposalStore.getState().reset();
  useUIStore.setState({ alerts: [] });
});

describe('an asked card’s bell row', () => {
  it('opens its card on the AI workspace while it is open, and offers nothing once it is not', () => {
    const routes: unknown[] = [];
    const listen = (event: Event) => routes.push((event as CustomEvent).detail);
    window.addEventListener('millos:open-operations-workspace', listen);
    try {
      render(<StatusHUD />);
      fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
      const open = screen.getAllByRole('button', { name: 'Open Partner proposal' });
      // proposal-00009 is not open: its row offers no way to a card that is gone.
      expect(open).toHaveLength(1);
      fireEvent.click(open[0]);
      expect(routes).toEqual(['ai']);
      expect(pendingProposalFocus()).toBe('proposal-00001');
      expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
    } finally {
      window.removeEventListener('millos:open-operations-workspace', listen);
    }
  });

  // Seen on a landscape phone: the incident's bell said "You have 15 min to
  // answer." while its card, opened a few seconds later, said 5 min. The bell
  // was worded once, at filing; the card counts down. Working if the row reads
  // the card's minutes left for every asked kind, and none once it has closed.
  it('says the minutes the card says, for every asked kind, and none once it closes', async () => {
    await import('../../../systems/partnerProposalRuntime');
    await import('../../../systems/incidentRuntime');
    const service = usePartnerProposalStore.getState().proposals[0];
    const incident = {
      ...service,
      id: 'proposal-00002',
      kind: 'incident',
      subject: 'incident-i-1',
      windowMinutes: 15,
    } as unknown as PartnerProposal;
    usePartnerProposalStore.getState().setProposals([service, incident], 2);
    const incidentBell = (proposalId: string, title: string) => ({
      id: `partner-proposal-${proposalId}`,
      type: 'info' as const,
      title: 'Incident',
      message: 'stored',
      timestamp: new Date(),
      acknowledged: false,
      copy: {
        catalog: 'floorProposals',
        title: 'kindIncident',
        message: 'bellIncidentProposed',
        params: { kind: 'bearing_overheat', title, option: 'isolate', window: 15 },
      },
    });
    useUIStore.setState({
      alerts: [
        incidentBell('proposal-00002', 'Open incident'),
        incidentBell('proposal-00007', 'Closed incident'),
        {
          id: 'partner-proposal-proposal-00001',
          type: 'info' as const,
          title: 'Partner proposal',
          message: 'stored',
          timestamp: new Date(),
          acknowledged: false,
          copy: {
            catalog: 'partnerProposals',
            title: 'bellProposalTitle',
            message: 'bellAsked',
            params: {
              asked: 'bellServiceProposed',
              window: service.windowMinutes,
              machine: 'R.M. 101',
              minutes: 600,
            },
          },
        },
      ],
    });
    useOperationsCampaignStore.setState({ elapsedMinutes: 10 });
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    // The incident's title is worded from its kind as the row is read.
    const rows = screen
      .getByRole('dialog', { name: 'Notifications' })
      .querySelectorAll('[data-alert-row]');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Partner: Isolate the mill. You have 5 min to answer.');
    expect(rows[1]).toHaveTextContent('Partner: Isolate the mill.');
    expect(rows[1]).not.toHaveTextContent(/min to answer/);
    expect(rows[2]).toHaveTextContent(`You have ${service.windowMinutes - 10} min to answer.`);
  });

  // Seen at 844 x 390 (landscape phone, touch): the list showed one notice per
  // view. Its header and its "Mark all as read" footer each took a 44 px row,
  // and each notice put its actions on a row of their own. On a short, wide
  // viewport the list is wider, "Mark all as read" sits in the header and the
  // actions sit beside the text; upright and desktop keep their layout.
  describe('on a short viewport', () => {
    const size = { width: window.innerWidth, height: window.innerHeight };
    const resize = (width: number, height: number) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    };
    afterEach(() => resize(size.width, size.height));
    const openList = (compact: boolean) => {
      render(<StatusHUD compact={compact} />);
      fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
      return screen.getByRole('dialog', { name: 'Notifications' });
    };

    it('uses the height it has on a landscape phone, keeping 44 px buttons', () => {
      resize(844, 390);
      const list = openList(true);
      const markAll = within(list).getByRole('button', { name: 'Mark all as read' });
      expect(markAll.closest('[data-notifications-header]')).not.toBeNull();
      const actions = list.querySelectorAll('[data-alert-actions]');
      expect(actions.length).toBe(2);
      for (const group of actions) expect(group).not.toHaveClass('w-full');
      expect(list.querySelector('[data-alert-row] > div')).not.toHaveClass('flex-wrap');
      expect(parseFloat(list.style.width)).toBeGreaterThan(320);
      expect(parseFloat(list.style.width)).toBeLessThanOrEqual(844 - 32);
      for (const button of within(list).getAllByRole('button'))
        expect(button).toHaveClass('min-h-11', 'min-w-11');
    });

    it('keeps the upright phone and desktop layouts', () => {
      resize(390, 844);
      let list = openList(true);
      let markAll = within(list).getByRole('button', { name: 'Mark all as read' });
      expect(markAll.closest('[data-notifications-header]')).toBeNull();
      for (const group of list.querySelectorAll('[data-alert-actions]'))
        expect(group).toHaveClass('w-full');
      cleanup();
      resize(1280, 720);
      list = openList(false);
      markAll = within(list).getByRole('button', { name: 'Mark all as read' });
      expect(markAll.closest('[data-notifications-header]')).toBeNull();
    });
  });

  it('gives every button in the list a 44 px target on a phone', () => {
    render(<StatusHUD compact />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const list = screen.getByRole('dialog', { name: 'Notifications' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    for (const button of buttons) expect(button).toHaveClass('min-h-11', 'min-w-11');
  });
});
