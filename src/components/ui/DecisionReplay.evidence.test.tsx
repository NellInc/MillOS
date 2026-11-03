import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionReplay } from './DecisionReplay';
import { setLocale } from '../../i18n';
import type { AIDecision } from '../../types';
import { useProductionStore } from '../../stores/productionStore';

const decision: AIDecision = {
  id: 'decision-evidence',
  timestamp: new Date(1_700_000_000_000),
  type: 'optimization',
  action: 'Balance the packing lines',
  reasoning: 'Line 2 is starved',
  confidence: 0.82,
  impact: 'Steadier output',
  status: 'completed',
  priority: 'medium',
  provenance: {
    capturedAt: 1_700_000_000_000,
    observations: [
      {
        label: 'Eficiência',
        value: 87.5,
        unit: '%',
        source: 'simulation',
        quality: 'good',
        capturedAt: 0,
      },
      {
        label: 'Vazão',
        value: 1240,
        unit: 'bags/h',
        source: 'simulation',
        quality: 'good',
        capturedAt: 0,
      },
      {
        label: 'Estado de R.M. 101',
        value: 'running',
        source: 'simulation',
        quality: 'good',
        capturedAt: 0,
      },
    ],
    assumptions: [],
    affectedSystems: [],
    affectedEquipment: [],
    expectedEffect: '',
    alternatives: [],
    inputSnapshot: {},
  },
} as AIDecision;

// productionStore stores the raw metric, unit and machine status; the dialog
// must render them in the player's language like every other number.
describe('DecisionReplay evidence values', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('reads Brazilian decimals, units and machine states in pt-BR', () => {
    setLocale('pt-BR');
    render(<DecisionReplay decision={decision} onClose={() => undefined} />);
    expect(screen.getByRole('row', { name: /Eficiência/ })).toHaveTextContent('87,5 %');
    expect(screen.getByRole('row', { name: /Vazão/ })).toHaveTextContent('1.240 sacos/h');
    expect(screen.getByRole('row', { name: /Estado de R\.M\. 101/ })).toHaveTextContent(
      'em operação'
    );
  });

  it('keeps the English rendering unchanged', () => {
    render(<DecisionReplay decision={decision} onClose={() => undefined} />);
    expect(screen.getByRole('row', { name: /Eficiência/ })).toHaveTextContent('87.5 %');
    expect(screen.getByRole('row', { name: /Vazão/ })).toHaveTextContent('1240 bags/h');
    // The pt-BR label itself reads in English now (DecisionReplay.languageSwitch).
    expect(screen.getByRole('row', { name: /R\.M\. 101 status/ })).toHaveTextContent('running');
  });
});

// The provenance block names equipment by designation; the Affected Machine
// card showed the internal id ('rm-101') for the same machine.
describe('DecisionReplay affected machine', () => {
  afterEach(cleanup);

  it('names the affected machine by its designation, not its internal id', () => {
    const previous = useProductionStore.getState().machines;
    useProductionStore.setState({
      machines: [{ ...previous[0], id: 'rm-101', name: 'R.M. 101' }],
    });
    try {
      render(
        <DecisionReplay decision={{ ...decision, machineId: 'rm-101' }} onClose={() => undefined} />
      );
      const card = screen.getByText('Affected Machine').closest('div')!.parentElement!;
      expect(card).toHaveTextContent('R.M. 101');
      expect(card).not.toHaveTextContent('rm-101');
    } finally {
      useProductionStore.setState({ machines: previous });
    }
  });

  it('falls back to the id when no machine of that id is loaded', () => {
    render(
      <DecisionReplay decision={{ ...decision, machineId: 'ghost-9' }} onClose={() => undefined} />
    );
    const card = screen.getByText('Affected Machine').closest('div')!.parentElement!;
    expect(card).toHaveTextContent('ghost-9');
  });
});

// Opened from a card that now follows the language, the evidence dialog still
// printed the card's filing language. Working if it reads like the card.
describe('DecisionReplay keyed card copy', () => {
  it('shows a keyed card in the language active now', async () => {
    const { decisionCardText } = await import('../../utils/aiEngine');
    const keyed = {
      ...decision,
      action: 'Coordinate R.M. 101',
      copy: { action: { key: 'coordinationAction', params: { machine: 'R.M. 101' } } },
    } as AIDecision;
    setLocale('pt-BR');
    try {
      const portuguese = decisionCardText(keyed, 'pt-BR').action;
      render(<DecisionReplay decision={keyed} onClose={() => {}} />);
      expect(screen.getByText(portuguese)).toBeInTheDocument();
      expect(screen.queryByText('Coordinate R.M. 101')).toBeNull();
    } finally {
      setLocale('en');
    }
  });
});
