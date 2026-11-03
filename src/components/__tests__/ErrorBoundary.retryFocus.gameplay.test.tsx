import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoverableFeatureBoundary } from '../ErrorBoundary';

const nextFrame = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

// Retry replaces the error card, button and all, so the keyboard focus that
// pressed it fell to <body>, where the next Space stops every forklift.
// Working if focus lands in the recovered feature, or on the new Retry when
// the feature fails again.
describe('RecoverableFeatureBoundary keeps focus through Retry', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('moves focus into the recovered feature', async () => {
    let available = false;
    const Feature = () => {
      if (!available) throw new Error('Chunk unavailable');
      return <button type="button">Trend history</button>;
    };
    render(
      <RecoverableFeatureBoundary featureName="SCADA">
        <Feature />
      </RecoverableFeatureBoundary>
    );
    const retry = screen.getByRole('button', { name: 'Retry feature' });
    retry.focus();
    available = true;
    fireEvent.click(retry);
    await nextFrame();
    expect(screen.getByRole('button', { name: 'Trend history' })).toHaveFocus();
  });

  it('moves focus to the new Retry when the feature fails again', async () => {
    const Feature = () => {
      throw new Error('Chunk unavailable');
    };
    render(
      <RecoverableFeatureBoundary featureName="SCADA">
        <Feature />
      </RecoverableFeatureBoundary>
    );
    const retry = screen.getByRole('button', { name: 'Retry feature' });
    retry.focus();
    fireEvent.click(retry);
    await nextFrame();
    expect(screen.getByRole('button', { name: 'Retry feature' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });
});
