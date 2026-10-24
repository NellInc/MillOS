/**
 * Desks of attention (docs/CHRONICLE.md, system 24), after Castles II's
 * administrative, military and political points: separate pools, a limited
 * number of things in hand at once, and room that grows with use (`C2:` save
 * format, "Progress toward next Adm point").
 */
import type { Cost, Desk, DeskState } from './types';

export const DESKS: ReadonlyArray<{ id: Desk; label: string }> = [
  { id: 'works', label: 'Works' },
  { id: 'trade', label: 'Trade' },
  { id: 'council', label: 'Council' },
];

export const DESK_START_ROOM = 2;
export const DESK_MAX_ROOM = 4;
/** Points spent at a desk for each point of extra room. */
export const DESK_SPEND_PER_ROOM = 4;
/** Points every desk refills at each shift close. */
export const DESK_REFILL = 1;

export type Desks = Record<Desk, DeskState>;

export function initialDesks(): Desks {
  const desk = (): DeskState => ({
    points: DESK_START_ROOM,
    room: DESK_START_ROOM,
    spent: 0,
  });
  return { works: desk(), trade: desk(), council: desk() };
}

export function deskLabel(id: Desk): string {
  return DESKS.find((desk) => desk.id === id)?.label ?? id;
}

export function canAffordAttention(desks: Desks, cost: Cost | undefined): boolean {
  const attention = cost?.attention;
  if (!attention) return true;
  return DESKS.every(({ id }) => (desks[id]?.points ?? 0) >= (attention[id] ?? 0));
}

/** Spend points; every few spent at a desk widen its room. */
export function spendAttention(desks: Desks, cost: Cost | undefined): Desks {
  const attention = cost?.attention;
  if (!attention) return desks;
  const next = { ...desks };
  for (const { id } of DESKS) {
    const amount = attention[id] ?? 0;
    if (amount <= 0) continue;
    const spent = next[id].spent + amount;
    next[id] = {
      points: Math.max(0, next[id].points - amount),
      spent,
      room: Math.min(DESK_MAX_ROOM, DESK_START_ROOM + Math.floor(spent / DESK_SPEND_PER_ROOM)),
    };
  }
  return next;
}

export function refillDesks(desks: Desks): Desks {
  const next = { ...desks };
  for (const { id } of DESKS)
    next[id] = { ...next[id], points: Math.min(next[id].room, next[id].points + DESK_REFILL) };
  return next;
}
