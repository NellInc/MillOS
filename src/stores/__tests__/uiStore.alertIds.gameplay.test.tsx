import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';
import { StatusHUD } from '../../components/ui-new/hud/StatusHUD';
import type { AlertData } from '../../types';

const notice = (title: string): AlertData => ({
  // The shipping hold files one id per truck cycle, and files it again when
  // its reason text changes, a language switch included.
  id: 'dispatch-supply-wait-cycle-3',
  type: 'info',
  title,
  message: `${title} message`,
  timestamp: new Date(),
  acknowledged: false,
});

// The bell is keyed by alert id: Acknowledge and Dismiss act on every entry
// with the id, and React keys its rows by it. A producer that raises the same
// id again (a truck hold whose reason changed) added a second row, and
// Dismiss on one removed both. A re-raised id now replaces its entry at the top.
// Working if each id is listed once, newest wording first, and Dismiss removes
// only the row pressed.
describe('uiStore keeps one entry per alert id', () => {
  beforeEach(() => useUIStore.setState({ alerts: [] }));
  afterEach(cleanup);

  it('replaces an alert raised again under the same id', () => {
    const { addAlert, acknowledgeAlert } = useUIStore.getState();
    addAlert(notice('Awaiting flour'));
    acknowledgeAlert('dispatch-supply-wait-cycle-3');
    addAlert({ ...notice('Other'), id: 'shift-review-1' });
    addAlert(notice('Aguardando farinha'));

    const { alerts } = useUIStore.getState();
    expect(alerts.map((entry) => entry.id)).toEqual([
      'dispatch-supply-wait-cycle-3',
      'shift-review-1',
    ]);
    expect(alerts[0].title).toBe('Aguardando farinha');
    expect(alerts[0].acknowledged).toBe(false);
  });

  it('lists a re-raised notice once in the bell, so Dismiss leaves the others', () => {
    const { addAlert } = useUIStore.getState();
    addAlert({ ...notice('Shift closed'), id: 'shift-review-1' });
    addAlert(notice('Awaiting flour'));
    addAlert(notice('Awaiting flour, 2 t'));
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    expect(screen.queryByText('Awaiting flour')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Dismiss/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Awaiting flour, 2 t' }));
    expect(screen.getByText('Shift closed')).toBeInTheDocument();
    expect(useUIStore.getState().alerts).toHaveLength(1);
  });
});
