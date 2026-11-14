import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { LINE_RESTART_ALERT_ID } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';

// "Line ready to restart" waits on RESTART LINE in the Safety panel (D13), so
// its bell row opens Safety, as a fault's row opens the work orders.
// Working if the row's button sends the operations route to 'safety'.
describe('the restart notice opens Safety', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({
      alerts: [
        {
          id: LINE_RESTART_ALERT_ID,
          type: 'warning',
          title: 'Line ready to restart',
          message: 'The stop is clear.',
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
  });
  afterEach(() => {
    cleanup();
    useUIStore.setState({ alerts: [] });
  });

  it('routes its row to the Safety workspace', () => {
    const routes: unknown[] = [];
    const listen = (event: Event) => routes.push((event as CustomEvent).detail);
    window.addEventListener('millos:open-operations-workspace', listen);
    try {
      render(<StatusHUD />);
      fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Safety for Line ready to restart' })
      );
      expect(routes).toEqual(['safety']);
    } finally {
      window.removeEventListener('millos:open-operations-workspace', listen);
    }
  });
});
