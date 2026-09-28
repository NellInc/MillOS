import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TownHall, TownHallClock } from './VillageArea';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

vi.mock('./models/GeneratedModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./models/GeneratedModel')>()),
  GeneratedBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GeneratedModel: () => null,
}));
vi.mock('./scenery/VillageSignage', () => ({ VillageNameboard: () => null }));
const initialTime = useGameSimulationStore.getState().gameTime;
afterEach(() => {
  cleanup();
  useGameSimulationStore.getState().setGameTime(initialTime);
});

it('updates the hour and minute hands from game time, including fractional hours and midnight', () => {
  const view = render(<TownHallClock position={[0, 12.08, 2.17]} face={false} />);
  const angle = (hand: string) =>
    Number(
      view.container
        .querySelector(`[name="town-hall-clock-${hand}"]`)!
        .getAttribute('rotation')!
        .split(',')[2]
    );
  for (const time of [0, 3.25, 9.5, 23.75]) {
    act(() => useGameSimulationStore.getState().setGameTime(time));
    expect(angle('hour')).toBeCloseTo(Math.PI / 2 - (time * Math.PI) / 6, 8);
    expect(angle('minute')).toBeCloseTo(Math.PI / 2 - (time % 1) * 2 * Math.PI, 8);
  }
});
it('mounts four live clocks alongside the delivered town hall, outside its static body', () => {
  const view = render(<TownHall position={[0, 0, 0]} />);
  expect(view.container.querySelectorAll('[name="town-hall-clock-hour"]')).toHaveLength(4);
  expect(view.container.querySelectorAll('[name="town-hall-clock-minute"]')).toHaveLength(4);
});
