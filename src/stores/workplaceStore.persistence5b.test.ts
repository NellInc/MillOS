import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { createWorkplace, restoreWorkplace, saveWorkplace } from '../simulation/bilateralWorkplace';
import {
  MANAGEMENT_APPROACHES,
  WORKPLACE_CHECKS,
  WORKPLACE_PROFILES,
  requiredChecks,
} from '../simulation/workplaceCampaign';
import { charterTitle } from '../simulation/workplaceCampaign.messages';
import { improvementCost } from '../simulation/workplaceImprovement';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { workplaceReplayMessages } from '../components/ui-new/widgets/WorkplaceReplay.messages';
import { workplaceLabMessages } from '../components/ui-new/widgets/WorkplaceLab.messages';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { LOCALES, setLocale, translate } from '../i18n';
import type { WorkplaceState } from '../types/workplace';

const FIXTURES = join(__dirname, '../simulation/__tests__/fixtures/workplace-saves');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const must = (result: { changed: boolean; reason: string | null }) =>
  expect(result.changed, result.reason ?? '').toBe(true);

/** Packing's part of a shift, then the shift to its end. */
function playShift(shippedPerTick = 600 / 18) {
  for (const id of requiredChecks('packing')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.packing?.[id] !== q.correct)
      must(store().answerCheck('packing', id, q.correct));
  }
  if (!workplace().members[0].understood) must(store().understand('packing'));
  if (workplace().members[0].ballot !== true) must(store().vote('packing', true));
  store().simulateResponses({});
  must(store().activate(workplace().revision));
  for (let i = 0; i < 200 && workplace().phase === 'active'; i++)
    store().tick(5, shippedPerTick, false);
  expect(workplace().minute).toBe(90);
}

describe('5b saves: the new optional fields', () => {
  it('a save written by this build, with both fields, restores and finishes its season', () => {
    const saved = fixture('2026-11-13-5b-mid-shift-both-fields.json');
    const restored = restoreWorkplace(saved);
    expect(restored.arrangementsInPlace).toEqual(['briefing']);
    expect(restored.campaign?.understoodChecks?.packing).toHaveLength(3);
    useWorkplaceStore.setState({ workplace: restored });
    must(store().resumeShift(workplace().revision));
    // Unchanged terms: the checks are not asked again after the reload.
    expect(workplace().campaign?.checks.packing?.refusal).toBe('individual');
    playShift();
    must(store().nextCampaignShift());
    playShift(0);
    must(store().nextCampaignShift());
    playShift();
    must(store().voteSurplus('packing', 'members'));
    must(store().distributeSurplus());
    must(store().archiveCampaign(workplace().revision));
    expect(store().completedCampaigns).toHaveLength(1);
    // The adopted arrangement outlived the season too.
    expect(workplace().arrangementsInPlace).toEqual(['briefing']);
  });

  it('drops a malformed field without losing the save', () => {
    const saved = fixture('2026-11-13-5b-mid-shift-both-fields.json') as WorkplaceState;
    const bad = structuredClone(saved);
    bad.arrangementsInPlace = ['nope'] as never;
    bad.campaign!.understoodChecks = { packing: ['authority'], ghost: ['refusal'] } as never;
    const restored = restoreWorkplace(bad);
    expect(restored.campaign?.shift).toBe(0);
    expect(restored.minute).toBe(saved.minute);
    expect(restored.finance).toEqual(restoreWorkplace(saved).finance);
    expect(restored.arrangementsInPlace).toBeUndefined();
    expect(restored.campaign?.understoodChecks).toBeUndefined();
  });

  it('a final review saved before 5b settles its sobras and archives', () => {
    useWorkplaceStore.setState({
      workplace: restoreWorkplace(fixture('2026-11-13-pre-5b-final-review-ballots-cast.json')),
    });
    // Its Packing ballot stands ("members"); the player's next ballot is
    // Packing's, after which the others not yet heard vote from their values.
    must(store().voteSurplus('packing', 'reserve'));
    must(store().distributeSurplus());
    expect(workplace().sobras?.destination).toBe('members');
    must(store().archiveCampaign(workplace().revision));
    expect(store().completedCampaigns).toHaveLength(1);
  });

  it('a handoff saved before 5b keeps nothing in place, and prices as before', () => {
    const restored = restoreWorkplace(
      fixture('2026-11-13-pre-5b-handoff-episode-smaller-delivery.json')
    );
    expect(restored.arrangementsInPlace).toBeUndefined();
    expect(improvementCost(restored)).toBe(8);
  });
});

describe('5.8: one name each', () => {
  it('names each charter once, in both languages, wherever it is shown', () => {
    for (const locale of LOCALES) {
      setLocale(locale);
      for (const profile of WORKPLACE_PROFILES) {
        const title = charterTitle(locale, profile);
        expect(MANAGEMENT_APPROACHES.find((a) => a.id === profile)!.title).toBe(title);
        expect(translate(workplaceReplayMessages, 'profileLabel', { profile })).toBe(title);
      }
    }
    // The elected chair is the Presidência; the role stays the Coordenação (D20).
    expect(workplaceLabMessages['pt-BR'].chairLine).toContain('Presidência');
    expect(workplaceLabMessages['pt-BR'].chairCandidate).toBe('Candidato à presidência');
  });

  it('a grep of the cooperative catalogues finds no second name for the place, season or a charter', () => {
    const dirs = [
      join(__dirname, '../components/ui-new/widgets'),
      join(__dirname, '../simulation'),
      __dirname,
    ];
    const text = dirs
      .flatMap((dir) =>
        readdirSync(dir)
          .filter((f) => /^(Workplace|workplace|bilateralWorkplace).*\.messages\.ts$/.test(f))
          .map((f) => readFileSync(join(dir, f), 'utf8'))
      )
      .join('\n');
    for (const retired of [
      'Living Cooperative',
      'Cooperativa Viva',
      'Toe dip',
      'Toe-dip',
      'Conduzido pela coordenação',
      'Workplace laboratory',
      'Laboratório do local de trabalho',
      'idle laboratory',
      'laboratório ocioso',
    ])
      expect(text, retired).not.toContain(retired);
    // One string per charter in each language: defined once, read everywhere.
    for (const title of ['Coordinator-led', 'Team agreement', 'Liderado pela coordenação'])
      expect(text.split(`'${title}'`).length - 1, title).toBe(1);
  });
});
