import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionReplay } from './DecisionReplay';
import { setLocale, translate } from '../../i18n';
import { productionStoreMessages as msg } from '../../stores/productionStore.messages';
import type { AIDecision } from '../../types';

// productionStore writes a decision's evidence (observation labels, the
// assumption, the affected system, the fallback alternative) in the language
// active when the decision was made, and a physical save keeps it. Opened
// after a switch to pt-BR, the evidence read in English inside a Portuguese
// dialog. Working if it reads in the language active now.
const englishDecision = (): AIDecision => {
  setLocale('en');
  const decision = {
    id: 'decision-language-switch',
    timestamp: new Date(1_700_000_000_000),
    type: 'maintenance',
    action: 'Service R.M. 101',
    reasoning: 'Vibration rising',
    confidence: 0.8,
    impact: 'Fewer stoppages',
    status: 'completed',
    priority: 'medium',
    machineId: 'rm-101',
    provenance: {
      capturedAt: 1_700_000_000_000,
      observations: [
        {
          label: translate(msg, 'observationThroughput'),
          value: 1240,
          unit: 'bags/h',
          source: 'simulation',
          quality: 'good',
          capturedAt: 0,
        },
        {
          label: translate(msg, 'observationMachineStatus', { machine: 'R.M. 101' }),
          value: 'running',
          source: 'simulation',
          quality: 'good',
          capturedAt: 0,
        },
      ],
      assumptions: [translate(msg, 'assumptionTelemetryCurrent')],
      affectedSystems: [translate(msg, 'affectedSystemAutonomousControl')],
      affectedEquipment: [translate(msg, 'affectedEquipmentProductionSystem')],
      expectedEffect: '',
      alternatives: [
        {
          action: translate(msg, 'alternativeMaintainAction'),
          tradeoff: translate(msg, 'alternativeMaintainTradeoff'),
        },
      ],
      inputSnapshot: {},
    },
  } as AIDecision;
  return decision;
};

describe('DecisionReplay evidence after a language switch', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('reads evidence written in English in pt-BR', () => {
    const decision = englishDecision();
    setLocale('pt-BR');
    render(<DecisionReplay decision={decision} onClose={() => undefined} />);
    expect(screen.getByText('Vazão de produção')).toBeInTheDocument();
    expect(screen.getByText('Estado de R.M. 101')).toBeInTheDocument();
    expect(
      screen.getByText('A telemetria do simulador está atualizada no momento da captura.')
    ).toBeInTheDocument();
    expect(screen.getByText('Controle autônomo da produção')).toBeInTheDocument();
    expect(screen.getByText('Sistema de produção')).toBeInTheDocument();
    expect(screen.getByText('Manter o estado operacional simulado atual')).toBeInTheDocument();
    expect(
      screen.getByText('Evita a intervenção, mas deixa inalterada a condição observada.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Production throughput')).not.toBeInTheDocument();
  });

  it('leaves text that is not catalogue copy as it was stored', () => {
    const decision = englishDecision();
    decision.provenance!.assumptions = ['Supply timing dominates this forecast.'];
    setLocale('pt-BR');
    render(<DecisionReplay decision={decision} onClose={() => undefined} />);
    expect(screen.getByText('Supply timing dominates this forecast.')).toBeInTheDocument();
  });
});
