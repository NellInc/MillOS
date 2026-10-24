/**
 * Customer relationships, after Predynastic Egypt's tribes (hostile, neutral,
 * friendly; trade with a friendly tribe is 20% more efficient). Customers are
 * organisations; the relationship is about the account, never a person.
 */
import type { CustomerId, CustomerRelationship, RelationshipTier } from './types';

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

/** Share of a warm customer's recorded revenue paid into the fund. */
export const LOYALTY_PREMIUM_SHARE = 0.04;

export const RELATIONSHIP_DELTAS = {
  fulfilledOnTime: 8,
  fulfilledLate: 3,
  qualityFailure: -12,
  lateAtClose: -4,
} as const;
