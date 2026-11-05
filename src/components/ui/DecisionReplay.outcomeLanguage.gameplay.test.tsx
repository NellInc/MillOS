import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionReplay } from './DecisionReplay';
import { setLocale, translate } from '../../i18n';
import { aiEngineMessages } from '../../utils/aiEngine.messages';
import type { AIDecision } from '../../types';

// The engine closes every accepted or automatic decision with
// updateDecisionStatus(id, 'completed', translate(...)), so the measured
// outcome's summary is stored in the language active then, and a save keeps
// it. Opened after a switch to pt-BR, the "Resultado medido" box read in
// English. Working if it reads in the language active now.
const decisionClosedIn = (key: 'completedAutomatic' | 'completedConfirmed'): AIDecision => {
  setLocale('en');
  return {
    id: `decision-${key}`,
    timestamp: new Date(1_700_000_000_000),
    type: 'optimization',
    action: 'Balance load',
    reasoning: 'Queue rising',
    confidence: 0.8,
    impact: 'Steadier flow',
    status: 'completed',
    priority: 'medium',
    outcome: translate(aiEngineMessages, key),
    measuredOutcome: {
      recordedAt: 1_700_000_000_000,
      summary: translate(aiEngineMessages, key),
      measurements: { throughput: 1200 },
    },
  } as AIDecision;
};

describe('DecisionReplay measured outcome after a language switch', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it.each(['completedAutomatic', 'completedConfirmed'] as const)(
    'reads an outcome summary stored in English (%s) in pt-BR',
    (key) => {
      const decision = decisionClosedIn(key);
      const english = translate(aiEngineMessages, key);
      setLocale('pt-BR');
      const portuguese = translate(aiEngineMessages, key);
      render(<DecisionReplay decision={decision} onClose={() => undefined} />);
      expect(screen.getByText(portuguese)).toBeInTheDocument();
      expect(screen.queryByText(english)).not.toBeInTheDocument();
    }
  );

  it('reads a lapsed deferral filed in English in pt-BR', () => {
    const decision = decisionClosedIn('completedAutomatic');
    // DEFERRAL_RETURN_PLANT_HOURS + DEFERRAL_LAPSE_PLANT_HOURS, as the engine words it.
    const lapsedEn = translate(aiEngineMessages, 'deferralLapsed', { hours: '3' });
    decision.status = 'superseded';
    decision.response = { disposition: 'deferred', recordedAt: 0, note: lapsedEn };
    decision.outcome = lapsedEn;
    decision.measuredOutcome = { ...decision.measuredOutcome!, summary: lapsedEn };
    setLocale('pt-BR');
    const lapsedPt = translate(aiEngineMessages, 'deferralLapsed', { hours: '3' });
    render(<DecisionReplay decision={decision} onClose={() => undefined} />);
    // The response note shows the same keyed lapse, so the summary is one of two.
    expect(screen.getAllByText(lapsedPt).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(lapsedEn)).not.toBeInTheDocument();
  });

  it('leaves a summary that is no engine line as it was stored', () => {
    const decision = decisionClosedIn('completedAutomatic');
    decision.measuredOutcome = { ...decision.measuredOutcome!, summary: 'Operator note' };
    setLocale('pt-BR');
    render(<DecisionReplay decision={decision} onClose={() => undefined} />);
    expect(screen.getByText('Operator note')).toBeInTheDocument();
  });
});
