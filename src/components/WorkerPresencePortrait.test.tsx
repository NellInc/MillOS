import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AVATAR_DATA_URI } from '../utils/workerPortraits';
import { WorkerPresencePortrait } from './WorkerPresencePortrait';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

describe('WorkerPresencePortrait', () => {
  beforeEach(() => {
    motionPreference.reduced = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('loads only the selected worker animation in normal motion mode', () => {
    render(<WorkerPresencePortrait workerId="w1" workerName="Marcus Chen" />);

    const image = screen.getByTestId('worker-presence-portrait');
    expect(image).toHaveAttribute('src', '/assets/workers/idle/w1_marcus_chen_idle.webp');
    expect(image).toHaveAttribute('data-portrait-source', 'animation');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width', '192');
    expect(image).toHaveAttribute('height', '256');
    expect(image).toHaveAttribute('alt', '');
  });

  it('loads the static reviewed rest frame when reduced motion is requested', () => {
    motionPreference.reduced = true;
    render(<WorkerPresencePortrait workerId="w5" workerName="David Kim" />);

    const image = screen.getByTestId('worker-presence-portrait');
    expect(image).toHaveAttribute('src', '/assets/workers/idle/w5_david_kim_idle_rest.webp');
    expect(image).toHaveAttribute('data-portrait-source', 'rest');
  });

  it('falls back through the canonical portrait to the embedded neutral avatar', () => {
    render(<WorkerPresencePortrait workerId="w7" workerName="Robert Garcia" />);
    const image = screen.getByTestId('worker-presence-portrait');

    fireEvent.error(image);
    const portraitFallback = screen.getByTestId('worker-presence-portrait');
    expect(portraitFallback).toHaveAttribute('src', '/assets/workers/w7_robert_garcia.webp');
    expect(portraitFallback).toHaveAttribute('data-portrait-source', 'portrait');

    fireEvent.error(portraitFallback);
    const neutralFallback = screen.getByTestId('worker-presence-portrait');
    expect(neutralFallback).toHaveAttribute('src', DEFAULT_AVATAR_DATA_URI);
    expect(neutralFallback).toHaveAttribute('data-portrait-source', 'default');
  });

  it('resets the preferred source when the selected worker changes', () => {
    const { rerender } = render(<WorkerPresencePortrait workerId="w1" workerName="Marcus Chen" />);
    fireEvent.error(screen.getByTestId('worker-presence-portrait'));
    expect(screen.getByTestId('worker-presence-portrait')).toHaveAttribute(
      'data-portrait-source',
      'portrait'
    );

    rerender(<WorkerPresencePortrait workerId="w8" workerName="Anna Kowalski" />);
    expect(screen.getByTestId('worker-presence-portrait')).toHaveAttribute(
      'src',
      '/assets/workers/idle/w8_anna_kowalski_idle.webp'
    );
    expect(screen.getByTestId('worker-presence-portrait')).toHaveAttribute(
      'data-portrait-source',
      'animation'
    );
  });

  it('uses the neutral avatar immediately for an unknown worker', () => {
    render(<WorkerPresencePortrait workerId="unknown" workerName="Unknown worker" />);

    const image = screen.getByTestId('worker-presence-portrait');
    expect(image).toHaveAttribute('src', DEFAULT_AVATAR_DATA_URI);
    expect(image).toHaveAttribute('data-portrait-source', 'default');
  });
});
