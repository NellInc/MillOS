import { describe, expect, it } from 'vitest';
import { assemblyCount, type CrewBallot } from '../governance';
import { EVENT_DECK } from '../eventDeck';
import { FEDERATION_ADMINISTRATOR_EVENT_ID } from '../stewardDeck';

// Review 2, items checked: D-107's tie rule with nobody voting, and D-092's
// administrator offer left to a delegated partner.

const ballot = (vote: CrewBallot['vote']) => ({ vote }) as CrewBallot;

describe('D-107: a tie carries only when someone voted', () => {
  it('an all-abstain 0-0 vote does not carry, even on a move a tie carries', () => {
    const none = [ballot('abstain'), ballot('abstain'), ballot('abstain')];
    expect(assemblyCount(none, true).carried).toBe(false);
    expect(assemblyCount([ballot('for'), ballot('against'), ballot('abstain')], true).carried).toBe(
      true
    );
  });
});

describe('D-092: the administrator offer is the assembly’s, never the partner’s', () => {
  it('is not a routine event, so a delegated partner never answers it', () => {
    const offer = EVENT_DECK.find((event) => event.id === FEDERATION_ADMINISTRATOR_EVENT_ID);
    expect(offer).toBeDefined();
    expect(offer!.routine).toBe(false);
    expect(offer!.choices.map((choice) => choice.id)).toContain('refuse');
    expect(offer!.choices.some((choice) => choice.delegates)).toBe(false);
  });
});
