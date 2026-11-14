/**
 * Customer relationships, after Predynastic Egypt's tribes (hostile, neutral,
 * friendly; trade with a friendly tribe is 20% more efficient). Customers are
 * organisations; the relationship is about the account, never a person.
 */
import type { CustomerId, CustomerRelationship, RelationshipTier } from './types';
import { customerDisplayName } from '../stores/customerNames';

export const CUSTOMERS: ReadonlyArray<{ id: CustomerId; name: string; match: string }> = [
  { id: 'riverside', name: 'Riverside Bakers’ Cooperative', match: 'riverside' },
  { id: 'pasta', name: 'Community Pasta Works', match: 'pasta' },
  { id: 'school', name: 'County School Meals', match: 'school' },
];

export function customerIdForName(name: string): CustomerId | null {
  const lower = name.toLowerCase();
  return CUSTOMERS.find((customer) => lower.includes(customer.match))?.id ?? null;
}

export function relationshipTier(value: number): RelationshipTier {
  return value < 34 ? 'cool' : value >= 67 ? 'warm' : 'neutral';
}

export function clampRelationship(value: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 50)));
}

export function initialRelationships(start: number): CustomerRelationship[] {
  return CUSTOMERS.map((customer) => ({
    id: customer.id,
    name: customer.name,
    value: clampRelationship(start),
  }));
}

/**
 * A customer's name as the player reads it (D17): the plant's one display
 * source (`customerDisplayName`), so the maize-meal buyer stored as "Community
 * Pasta Works" reads "Community Polenta Kitchen" while `match` still finds it.
 */
export function customerDisplayNameOf(id: string): string | undefined {
  const customer = CUSTOMERS.find((c) => c.id === id);
  return customer ? customerDisplayName(customer.name) : undefined;
}

/**
 * Share of a warm customer's recorded revenue paid into the fund. Re-tuned with
 * the fund's move to plant currency (engine.ts, REINVESTMENT_SHARE): was 0.04 at
 * 0.18 fund a unit; a measured shift’s 15,000 of revenue now pays about 27.
 */
export const LOYALTY_PREMIUM_SHARE = 0.0018;

export const RELATIONSHIP_DELTAS = {
  fulfilledOnTime: 8,
  fulfilledLate: 3,
  qualityFailure: -12,
  lateAtClose: -4,
} as const;

/**
 * What an on-time order adds, by where the account stands: a cool account
 * notices the first good delivery most, and goodwill comes slower as it grows.
 * At a flat 8, "Demanding buyers" (30) was warm after five programmes and the
 * hard charter column was gone (report 07, F8); now it takes twelve.
 */
export const ON_TIME_GAIN: Record<RelationshipTier, number> = { cool: 6, neutral: 3, warm: 1 };

/** The change a fulfilled order makes, on time or late, at the account's current value. */
export function fulfilmentGain(value: number, onTime: boolean): number {
  const gain = ON_TIME_GAIN[relationshipTier(value)];
  return onTime ? gain : Math.min(RELATIONSHIP_DELTAS.fulfilledLate, gain);
}

export function getCustomers() {
  return CUSTOMERS.map((customer) => ({ ...customer }));
}
