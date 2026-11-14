/**
 * Plan 6.9: the mini-map shows the player, the exits and the trucks. It showed
 * forklift dots only, at a scale that left the exits (z +/-52) and the docks
 * off its box.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MINI_MAP, MiniMap } from './MiniMap';
import { useUIStore } from '../../stores/uiStore';
import { positionRegistry } from '../../utils/positionRegistry';
import { SERVICE_EGRESS_POINTS } from '../../stores/gameSimulationStore';
import { clearFirstPersonPose, writeFirstPersonPose } from '../../utils/firstPersonPose';
import { setLocale } from '../../i18n';

afterEach(() => {
  cleanup();
  positionRegistry.unregister('truck-test');
  positionRegistry.unregister('truck-test-trailer');
  positionRegistry.unregister('forklift-test');
  clearFirstPersonPose();
  useUIStore.getState().setShowMiniMap(false);
  setLocale('en');
});

const inside = (el: HTMLElement) => {
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  return left >= 0 && left <= MINI_MAP.width && top >= 0 && top <= MINI_MAP.height;
};

describe('the mini-map', () => {
  it('shows the player, every exit and a docked truck inside its box', () => {
    // A truck at the shipping dock, its trailer behind it, and a forklift.
    positionRegistry.register('truck-test', 0, 61, 0, 1, true, 0, 'truck');
    positionRegistry.register('truck-test-trailer', 0, 68, 0, 1, true, 0, 'truck');
    positionRegistry.register('forklift-test', 10, 30, 1, 0, false);
    writeFirstPersonPose(-20, 10, 0);
    act(() => useUIStore.getState().setShowMiniMap(true));
    render(<MiniMap />);

    const exits = screen.getAllByTestId('mini-map-exit');
    expect(exits).toHaveLength(SERVICE_EGRESS_POINTS.length);
    for (const exit of exits)
      expect(inside(exit), exit.getAttribute('aria-label') ?? '').toBe(true);

    const trucks = screen.getAllByTestId('mini-map-truck');
    expect(trucks).toHaveLength(1);
    expect(inside(trucks[0])).toBe(true);

    expect(screen.getAllByTestId('mini-map-forklift')).toHaveLength(1);
    const player = screen.getByTestId('mini-map-player');
    expect(inside(player)).toBe(true);
    // West of centre and south of it: x -20 is left, z +10 is down.
    expect(parseFloat(player.style.left)).toBeLessThan(MINI_MAP.width / 2);
    expect(parseFloat(player.style.top)).toBeGreaterThan(MINI_MAP.height / 2);
  });

  it('shows no player outside first person, and labels the legend in both languages', () => {
    act(() => useUIStore.getState().setShowMiniMap(true));
    render(<MiniMap />);
    expect(screen.queryByTestId('mini-map-player')).toBeNull();
    expect(screen.getByText('Trucks')).toBeTruthy();
    expect(screen.getByText('Exits')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText('Caminhões')).toBeTruthy();
    expect(screen.getByText('Saídas')).toBeTruthy();
    expect(screen.getByText('Você')).toBeTruthy();
  });
});
