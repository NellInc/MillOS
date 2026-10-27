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
// The independent privet texture suspends in jsdom. This check concerns the
// live clock siblings, not the hedge's separately tested asset-loading path.
vi.mock('./scenery/VillageGardens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scenery/VillageGardens')>()),
  TownHallPrivet: () => null,
}));
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
it('keeps the minute hand wholly in front of the hour hand, so no face is shared', () => {
  // Both hand bars start 0.05 m behind the hub. With the minute bar's back
  // inside the hour bar's depth, their tail end faces were coplanar whenever
  // the hands aligned (noon, about 1:05, ...): a probe pair at 0 mm.
  const view = render(<TownHallClock position={[0, 12.08, 2.17]} face={false} />);
  const bar = (hand: string) => {
    const group = view.container.querySelector(`[name="town-hall-clock-${hand}"]`)!;
    const mesh = group.querySelector('mesh')!;
    const z = (element: Element) => Number(element.getAttribute('position')!.split(',')[2]);
    const depth = Number(mesh.querySelector('boxgeometry')!.getAttribute('args')!.split(',')[2]);
    return [z(group) + z(mesh) - depth / 2, z(group) + z(mesh) + depth / 2];
  };
  const hour = bar('hour');
  const minute = bar('minute');
  expect(minute[0] - hour[1]).toBeGreaterThan(0.001);
});
it('mounts four live clocks alongside the delivered town hall, outside its static body', () => {
  const view = render(<TownHall position={[0, 0, 0]} />);
  expect(view.container.querySelectorAll('[name="town-hall-clock-hour"]')).toHaveLength(4);
  expect(view.container.querySelectorAll('[name="town-hall-clock-minute"]')).toHaveLength(4);
});
