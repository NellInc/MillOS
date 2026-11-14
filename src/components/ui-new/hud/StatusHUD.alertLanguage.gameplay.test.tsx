import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { defineMessages, setLocale } from '../../../i18n';
import { registerAlertCatalog } from '../../../i18n/alertCopy';

const catalog = defineMessages({
  en: {
    title: 'Bearing failure',
    message: (p: { machine: string }) => `${p.machine} stopped on a bearing fault.`,
  },
  'pt-BR': {
    title: 'Falha no rolamento',
    message: (p: { machine: string }) => `${p.machine} parou por falha no rolamento.`,
  },
});
registerAlertCatalog('test.alertLanguage', catalog);

// Every alert stored its title and message already translated, so after a
// switch to pt-BR the bell kept English rows (and a reload, which now restores
// the bell, kept them too). Working if a keyed notice reads in the language
// active now, and a notice without keys keeps its stored text.
describe('bell notices follow the language', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({
      alerts: [
        {
          id: 'keyed',
          type: 'critical',
          title: 'Bearing failure',
          message: 'R.M. 101 stopped on a bearing fault.',
          timestamp: new Date(),
          acknowledged: false,
          copy: {
            catalog: 'test.alertLanguage',
            title: 'title',
            message: 'message',
            params: { machine: 'R.M. 101' },
          },
        },
        {
          id: 'plain',
          type: 'info',
          title: 'Stored title',
          message: 'Stored message',
          timestamp: new Date(),
          acknowledged: false,
        },
      ],
    });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useUIStore.setState({ alerts: [] });
  });

  it('re-words a keyed notice after a switch and keeps a plain one as stored', () => {
    render(<StatusHUD />);
    act(() => setLocale('pt-BR'));
    fireEvent.click(screen.getByRole('button', { name: /Notificações|Notifications/ }));
    expect(screen.getByText('Falha no rolamento')).toBeInTheDocument();
    expect(screen.getByText('R.M. 101 parou por falha no rolamento.')).toBeInTheDocument();
    expect(screen.getByText('Stored title')).toBeInTheDocument();
  });

  // Seen by a first-time player at 4x: the asked card had closed (the partner's
  // choice ran) but its bell row still read "You have 24 min to answer." and
  // offered nothing to answer. Once the card is no longer open, the row drops
  // the countdown; while it is open, it keeps it.
  it('drops the answer countdown from an asked card that has closed', async () => {
    await import('../../../systems/partnerProposalRuntime');
    const asked = {
      id: 'partner-proposal-p-closed',
      type: 'info' as const,
      title: 'Partner proposal',
      message: 'stored',
      timestamp: new Date(),
      acknowledged: false,
      copy: {
        catalog: 'partnerProposals',
        title: 'bellProposalTitle',
        message: 'bellAsked',
        params: { asked: 'bellCommitmentProposed', window: 24, number: 2, kg: 11500, late: 25 },
      },
    };
    useUIStore.setState({ alerts: [asked] });
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const row = screen.getByText(/Programme 2 can be taken now/);
    expect(row).not.toHaveTextContent(/You have 24 min/);
  });

  // Seen in a Portuguese capture: "Turno da manhã encerrado: nota D" was cut
  // to "Turno da manhã encerrado:" in the 320 px list. Titles wrap, as messages do.
  it('wraps a long notice title rather than cutting it', () => {
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const title = screen.getByText('Bearing failure');
    expect(title).not.toHaveClass('truncate');
    expect(title).toHaveClass('break-words');
  });
});
