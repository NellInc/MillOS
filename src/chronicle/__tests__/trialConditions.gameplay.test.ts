/**
 * Item 4.5 (report 07, F2, P7, D6): a trial's failure says which condition
 * broke it, in both languages, and Grid Winter is announced six shifts ahead.
 * The floor line each announcement carried was cut as advice (D14).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { localizedNotice } from '../presentation';
import {
  advanceTrial,
  emptyTrialProgress,
  getTrials,
  TRIALS,
  type TrialShiftEvidence,
} from '../trials';
import { SHORT_TRIALS } from '../trials';
import { trialTelegraphShifts } from '../schedule';
import { improvementById } from '../plans';
import type { ChronicleNotice, TrialDefinition, TrialId, TrialProgress } from '../types';
import { playChronicle } from './chronicleRun';

const trial = (id: TrialId, list: readonly TrialDefinition[] = TRIALS) =>
  list.find((t) => t.id === id)!;

const good: TrialShiftEvidence = {
  dispatchedKg: 0,
  qualityFailureKg: 0,
  energyCost: 0,
  grade: 'A',
  qcPassedThisShift: true,
  unresolvedHighIncident: false,
};

/** Run a trial from its start, one evidence a close, until it settles. */
function run(
  definition: TrialDefinition,
  closes: Array<Partial<TrialShiftEvidence>>
): TrialProgress {
  let progress: TrialProgress = {
    ...emptyTrialProgress(definition.id),
    phase: 'active',
    startedShift: definition.startShift,
  };
  for (const evidence of closes)
    progress = advanceTrial(definition, progress, { ...good, ...evidence });
  return progress;
}

function failureNotice(definition: TrialDefinition, body: string): ChronicleNotice {
  return {
    id: 'notice-1',
    shift: 20,
    kind: 'trial',
    title: `${definition.title}: trial failed`,
    body,
    relatedId: definition.id,
  };
}

/** The failure in Portuguese: re-rendered whole, with no English left. */
function portuguese(definition: TrialDefinition, body: string): string {
  setLocale('pt-BR');
  try {
    return localizedNotice(failureNotice(definition, body)).body;
  } finally {
    setLocale('en');
  }
}

afterEach(() => setLocale('en'));

describe('trials test the player (4.5)', () => {
  // D14 cut the floor line (item 4.5's "On the floor it tests...") as advice:
  // an announcement is the briefing alone, and one saved with the line still
  // reads in both languages.
  it('still translates an announcement saved with the floor line, in both languages', () => {
    setLocale('pt-BR');
    const local = getTrials();
    TRIALS.forEach((definition, i) => {
      expect(local[i].floor, definition.id).not.toBe(definition.floor);
      const saved: ChronicleNotice = {
        id: 'notice-1',
        shift: definition.startShift - 2,
        kind: 'trial',
        title: `${definition.title} begins in 2 shifts`,
        body: `${definition.briefing} ${definition.floor}`,
        relatedId: definition.id,
      };
      expect(localizedNotice(saved).body, definition.id).toBe(
        `${local[i].briefing} ${local[i].floor}`
      );
    });
  });

  it('announces Grid Winter six shifts ahead with its briefing alone', () => {
    const grid = trial('grid_winter');
    expect(trialTelegraphShifts(grid)).toBe(6);
    // The short form too (review 2, finding 8), inside its schedule. There it
    // buys notice, not an install: wind and heat recovery are Regional plans.
    const short = trial('grid_winter', SHORT_TRIALS);
    expect(trialTelegraphShifts(short)).toBe(6);
    expect(short.startShift - trialTelegraphShifts(short)).toBeGreaterThanOrEqual(1);
    expect(improvementById('wind-turbine')!.era).toBe('regional');
    let announced: ChronicleNotice | undefined;
    playChronicle(3, 'lapse', {}, 3000, (state) => {
      announced ??= state.notices.find((n) => n.title === 'Grid Winter begins in 6 shifts');
    });
    expect(announced?.shift).toBe(grid.startShift - 6);
    expect(announced?.body).toBe(grid.briefing);
  });

  it('says dispatch broke a trial that fell short', () => {
    const wet = trial('wet_harvest');
    const kg = wet.goal.kind === 'dispatch' ? wet.goal.kg : 0;
    const failed = run(
      wet,
      Array.from({ length: wet.durationShifts }, (_, i) => (i === 0 ? { dispatchedKg: 100 } : {}))
    );
    expect(failed.phase).toBe('failed');
    expect(failed.failureReason).toBe(
      `Dispatch broke it: 100 of ${kg.toLocaleString('en-GB')} kg dispatched.`
    );
    expect(portuguese(wet, failed.failureReason!)).toBe(
      `O despacho a fez falhar: 100 de ${kg.toLocaleString('de-DE')} kg expedidos.`
    );
  });

  it('says quality broke a trial with a quality failure', () => {
    const wet = trial('wet_harvest');
    const failed = run(wet, [{ dispatchedKg: 1000, qualityFailureKg: 120 }]);
    expect(failed.failureReason).toBe(
      'Quality broke it: 120 kg failed its recipe quality threshold.'
    );
    expect(portuguese(wet, failed.failureReason!)).toBe(
      'A qualidade a fez falhar: 120 kg ficaram abaixo do limite de qualidade da receita.'
    );
  });

  it('says energy, not dispatch, broke a Grid Winter that shipped its tonnes', () => {
    const grid = trial('grid_winter');
    const kg = grid.goal.kind === 'dispatch' ? grid.goal.kg : 0;
    // Every shift ships its share of the goal at 0.0091 a kg, over the 0.008 cap.
    const failed = run(
      grid,
      Array.from({ length: grid.durationShifts }, () => ({
        dispatchedKg: kg / grid.durationShifts,
        energyCost: (kg / grid.durationShifts) * 0.0091,
      }))
    );
    expect(failed.failureReason).toBe('Energy broke it: 0.0091 per kg against 0.008.');
    expect(portuguese(grid, failed.failureReason!)).toBe(
      'A energia a fez falhar: 0,0091 por kg frente a 0,008.'
    );
  });

  it('says which close and which condition broke the Inspection’s run', () => {
    const inspection = trial('inspection');
    const failed = run(inspection, [
      {},
      { qcPassedThisShift: false },
      {},
      { unresolvedHighIncident: true },
    ]);
    expect(failed.phase).toBe('failed');
    expect(failed.failureReason).toBe(
      `An incident broke it at the shift ${inspection.startShift + 4} close: a high-severity incident was still open. 0 of 3 consecutive clean shift closes.`
    );
    expect(portuguese(inspection, failed.failureReason!)).toBe(
      `Uma ocorrência a fez falhar no fechamento do turno ${inspection.startShift + 4}: uma ocorrência de alta gravidade continuava aberta. 0 de 3 encerramentos de turno consecutivos sem falhas.`
    );
    const noQc = run(inspection, [
      { qcPassedThisShift: false },
      {},
      { qcPassedThisShift: false },
      {},
    ]);
    expect(noQc.failureReason).toMatch(
      new RegExp(
        `^QC broke it at the shift ${inspection.startShift + 3} close: no batch passed QC\\.`
      )
    );
    expect(portuguese(inspection, noQc.failureReason!)).toMatch(/^O CQ a fez falhar/);
  });

  it('still reads a failure saved before the conditions were named', () => {
    const wet = trial('wet_harvest');
    expect(portuguese(wet, '40 kg failed its recipe quality threshold.')).toBe(
      '40 kg ficaram abaixo do limite de qualidade da receita.'
    );
    expect(portuguese(wet, '400 of 6,000 kg dispatched.')).toBe('400 de 6.000 kg expedidos.');
  });
});
