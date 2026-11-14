/**
 * The right answer's place in a cutaway lesson is seeded (report 03 P8, 10 F6).
 * Before this, the right answer was always the first button at the first
 * question and the second at the other, so the lesson could be passed blind.
 * Working if the right answer's position varies by seed and is stable for one.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessInspectionCard } from './ProcessInspectionCard';
import { useProcessInspectionStore as store } from '../../../stores/processInspectionStore';
import { setLocale } from '../../../i18n';

const releases: (() => void)[] = [];
beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  releases.splice(0).forEach((release) => release());
  store.getState().close();
});

/** Where the right answer sits (0 = first button) at one question, for one seed. */
function rightAnswerPosition(seed: number, stage: 0 | 2): number {
  releases.push(store.getState().register({ id: 'rm-101', kind: 'mill', name: 'R.M. 101' }));
  // A fresh run each time: the seed and the subject's run count pick the order.
  store.setState({ seed, runs: {} } as never);
  const view = render(<ProcessInspectionCard subjectId="rm-101" />);
  fireEvent.click(screen.getByRole('button', { name: 'View inside' }));
  const walk = (target: 0 | 2): number => {
    const buttons = within(screen.getByRole('group')).getAllByRole('button');
    for (let i = 0; i < buttons.length; i++) {
      fireEvent.click(buttons[i]);
      if (store.getState().feedback === 'correct') {
        if (store.getState().stage === target) return i;
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        return walk(target);
      }
    }
    throw new Error('no right answer offered');
  };
  const position = walk(stage);
  view.unmount();
  releases.splice(0).forEach((release) => release());
  store.getState().close();
  return position;
}

describe('cutaway lesson answer position', () => {
  it.each([0, 2] as const)('varies by seed at question %i and is stable for a seed', (stage) => {
    const positions = Array.from({ length: 24 }, (_, seed) => rightAnswerPosition(seed, stage));
    expect(new Set(positions)).toEqual(new Set([0, 1]));
    for (const seed of [3, 11, 19]) expect(rightAnswerPosition(seed, stage)).toBe(positions[seed]);
  });
});

describe('cutaway lesson record and live reading', () => {
  it('records a finished lesson once, however often it is finished', () => {
    store.setState({ completed: [] });
    releases.push(store.getState().register({ id: 'rm-101', kind: 'mill', name: 'R.M. 101' }));
    for (let i = 0; i < 2; i++) {
      store.getState().start('rm-101');
      store.getState().answer('a');
      store.getState().next();
      store.getState().next();
      store.getState().answer('b');
      store.getState().next();
      store.getState().next();
    }
    expect(store.getState().completed).toEqual(['rm-101']);
    render(<ProcessInspectionCard subjectId="rm-101" />);
    expect(screen.getByRole('img', { name: 'Lesson completed' })).toBeInTheDocument();
  });

  it('asks how full the silo is from the level its cutaway draws', () => {
    releases.push(store.getState().register({ id: 'silo-0', kind: 'silo', name: 'Alpha' }));
    render(<ProcessInspectionCard subjectId="silo-0" />);
    fireEvent.click(screen.getByRole('button', { name: 'View inside' }));
    act(() => store.getState().setLiveFillPercent(70));
    fireEvent.click(screen.getByRole('button', { name: 'About 20% full' }));
    expect(store.getState().feedback).toBe('retry');
    fireEvent.click(screen.getByRole('button', { name: 'About 70% full' }));
    expect(store.getState().feedback).toBe('correct');
  });
});
