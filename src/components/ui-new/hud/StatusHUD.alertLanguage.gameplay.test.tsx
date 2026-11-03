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
});
