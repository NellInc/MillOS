import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PolicyTab } from './PolicyTab';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';
import {
  assemblyBallots,
  assemblyCount,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  redLineKey,
  RED_LINES,
  tieCarries,
} from '../../chronicle/governance';
import type { ImprovementProgress, PolicyLadder, PolicyRung } from '../../chronicle/types';
import { setLocale } from '../../i18n';

// Report 08, F4 and P4: a rung's button showed only its effect. The red line
// it crosses, the condition it sets off and how the assembly would vote came
// to light only after adoption, so the middle rung won by default.
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function state(): ChronicleState {
  const base = signCharter(createInitialState(), DEFAULT_CHARTER, 21, baseline).state;
  return {
    ...base,
    shift: 20,
    ledger: { ...base.ledger, knowHow: { ...base.ledger.knowHow, grades: 40 } },
    governance: { ...base.governance, crew: CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][0]) },
  };
}

const rung = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) });

function tally(s: ChronicleState, ladder: PolicyLadder, to: PolicyRung) {
  const proposal = { ladder, from: s.governance.policies[ladder], to, concessions: [] };
  return assemblyCount(assemblyBallots(s.governance, proposal), tieCarries(s.governance, proposal));
}

describe('A policy rung says what it sets off', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('prints Lean’s red line, its condition and the projected vote', () => {
    const s = state();
    render(<PolicyTab state={s} />);
    const lean = rung('Lean');
    expect(lean).toHaveTextContent(
      'red line for Village committee: relationship -15 unless it moves off within 3 shifts'
    );
    expect(lean).toHaveTextContent('Thin stocks when a road works forecast strikes');
    const vote = tally(s, 'stock', 0);
    expect(lean).toHaveTextContent(
      `vote ${vote.for} for, ${vote.against} against${vote.abstain ? `, ${vote.abstain} abstaining` : ''}: ${vote.carried ? 'carries' : 'falls'}`
    );
    // The definition still reads as one run, as the localisation test pins it.
    expect(lean).toHaveTextContent('Lean: upkeep x0.9, road works +8 points');
  });

  it('prints worn rolls on run to failure, until the regrinding shop makes it impossible', () => {
    const s = state();
    const { unmount } = render(<PolicyTab state={s} />);
    expect(rung('Run to failure')).toHaveTextContent('Worn roll surfaces after 4 shifts');
    unmount();
    const shop: ImprovementProgress = {
      id: 'roll-regrinding-shop',
      phase: 'installed',
      contractorId: null,
      startedShift: 0,
      completesShift: 1,
      paidFund: 0,
      effectScale: 1,
      initiatedBy: 'player',
    };
    render(<PolicyTab state={{ ...s, improvements: [shop] }} />);
    expect(rung('Run to failure')).not.toHaveTextContent('Worn roll');
  });

  it('prints no red line the party has already acted on', () => {
    const s = state();
    const village = RED_LINES.find((line) => line.party === 'village')!;
    render(
      <PolicyTab
        state={{ ...s, governance: { ...s.governance, brokenOff: [redLineKey(village)] } }}
      />
    );
    expect(rung('Lean')).not.toHaveTextContent('red line');
  });

  it('prints no vote on a step more than one away', () => {
    const s = state();
    render(
      <PolicyTab
        state={{
          ...s,
          governance: { ...s.governance, policies: { ...s.governance.policies, stock: 2 } },
        }}
      />
    );
    expect(rung('Lean')).toHaveTextContent('red line');
    expect(rung('Lean')).not.toHaveTextContent('vote');
  });

  it('says it in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<PolicyTab state={state()} />);
    const lean = rung('Enxuto');
    expect(lean).toHaveTextContent('linha vermelha');
    expect(lean).toHaveTextContent('votação');
    expect(lean).not.toHaveTextContent(/red line|vote|strikes/);
  });
});
