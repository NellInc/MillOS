import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkplace,
  displayEventDetail,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceAlternatives,
} from './bilateralWorkplace';
import { demonstrationBeats } from './workplaceFairness';
import { CAMPAIGN_PRESSURES, requiredChecks, WORKPLACE_CHECKS } from './workplaceCampaign';
import { setLocale } from '../i18n';
import { useWorkplaceStore } from '../stores/workplaceStore';
import type { WorkplaceState } from '../types/workplace';

afterEach(() => setLocale('en'));

const started = () =>
  transitionWorkplace(createWorkplace(), { type: 'start', args: ['game', 17] }).state;

describe('Workplace lane, third pass', () => {
  it('marks the guided reload beat observed once the reload has been rehearsed', () => {
    const reloaded = restoreWorkplace(saveWorkplace(started()));
    expect(reloaded.phase).toBe('review');
    const beat = demonstrationBeats(reloaded)[6];
    expect(beat.section).toBe('Review');
    expect(beat.observed).toBe(true);
  });

  it('treats a reordered practice set as the same terms, keeping recorded consent', () => {
    let s: WorkplaceState = transitionWorkplace(createWorkplace(), {
      type: 'startCampaign',
      args: ['toe-dip', 17],
    }).state;
    for (const id of requiredChecks('packing'))
      s = transitionWorkplace(s, {
        type: 'answerCheck',
        args: ['packing', id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
      }).state;
    const reordered = [...s.practices].reverse();
    const result = transitionWorkplace(s, { type: 'configure', args: [{ practices: reordered }] });
    expect(result.changed).toBe(false);
    expect(result.state.campaign!.checks.packing).toEqual(s.campaign!.checks.packing);
    expect(result.state.revision).toBe(s.revision);
  });

  it('shows a live challenged demand in the current language', () => {
    setLocale('pt-BR');
    const pressure = CAMPAIGN_PRESSURES[0];
    const shown = displayEventDetail(`${pressure.id}: ${pressure.objection}`);
    expect(shown).toBe(
      `${pressure.id}: A Qualidade contesta o compartilhamento obrigatório de explicações. A recusa não exige nenhum motivo particular.`
    );
  });

  it('names the practice an alternative actually lacks', () => {
    const s = started();
    const withoutRest = transitionWorkplace(s, {
      type: 'configure',
      args: [{ practices: s.practices.filter((id) => id !== 'rest') }],
    }).state;
    const cover = workplaceAlternatives(withoutRest).find((plan) => plan.id === 'cover')!;
    expect(cover.available).toBe(false);
    expect(cover.constraint).toBe('Enable Protected rest first.');
    const withoutBudget = transitionWorkplace(s, {
      type: 'configure',
      args: [{ practices: s.practices.filter((id) => id !== 'budget') }],
    }).state;
    expect(
      workplaceAlternatives(withoutBudget).find((p) => p.id === 'resequence')!.constraint
    ).toBe('Enable the shared budget practice first.');
    setLocale('pt-BR');
    expect(workplaceAlternatives(withoutRest).find((p) => p.id === 'cover')!.constraint).toBe(
      'Ative primeiro a prática Descanso protegido.'
    );
  });

  it('rewrites retained season reviews when the language changes', () => {
    const review = { ...createWorkplace(), phase: 'review' as const };
    useWorkplaceStore.setState({ completedCampaigns: [review], leftCampaigns: [review] });
    setLocale('pt-BR');
    const { completedCampaigns, leftCampaigns } = useWorkplaceStore.getState();
    expect(completedCampaigns[0].members[0].role).toBe('Ensaque');
    expect(leftCampaigns[0].members[0].role).toBe('Ensaque');
  });
});
