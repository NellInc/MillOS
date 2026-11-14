/**
 * Test helpers for item 4.11: the federation now offers its administrator and
 * the assembly accepts or refuses. Harnesses that close shifts with no deck of
 * their own use this one-event deck, and accept at once where they test what
 * the administrator does once it is there.
 */
import { chooseEventOption, type ChronicleState } from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { FEDERATION_ADMINISTRATOR_EVENT_ID } from '../stewardDeck';

export const OFFER_DECK = EVENT_DECK.filter(
  (event) => event.id === FEDERATION_ADMINISTRATOR_EVENT_ID
);

/** The assembly accepts a pending offer, as a lapse would two closes later. */
export function acceptOffer(state: ChronicleState): ChronicleState {
  const pending = state.pendingEvents.find((p) => p.eventId === FEDERATION_ADMINISTRATOR_EVENT_ID);
  return pending
    ? chooseEventOption(state, pending.instanceId, 'accept', 'player', OFFER_DECK).state
    : state;
}
