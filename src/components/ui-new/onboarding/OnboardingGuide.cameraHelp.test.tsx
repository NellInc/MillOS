import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OnboardingGuide } from './OnboardingGuide';

afterEach(cleanup);

// The card is its own scroll box with a sticky footer (step dots and buttons).
// Opening Camera controls added its text below the fold, under that footer,
// so the help the player had just asked for could not be read without
// scrolling inside the card.
it('scrolls the opened camera help into view above the pinned footer', () => {
  render(
    <OnboardingGuide
      step={{ title: 'Controls', content: 'Press ? for controls.', icon: 'controls' }}
      stepIndex={2}
      stepCount={3}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      onClose={vi.fn()}
    />
  );
  const card = screen.getByRole('region', { name: 'Getting started, step 3 of 3' });
  Object.defineProperty(card, 'scrollHeight', { configurable: true, value: 640 });
  const details = screen.getByText('Camera controls').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(card.scrollTop).toBe(640);
  // Closing it leaves the card where the player put it.
  card.scrollTop = 120;
  details.open = false;
  fireEvent(details, new Event('toggle'));
  expect(card.scrollTop).toBe(120);
});

// Opening the help leaves the card scrolled to its end, and the card is the
// same box on every step: Next then landed on a step with its heading and
// text scrolled out of view above the fold.
it('starts each new step at the top of the card', () => {
  const props = {
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    onClose: vi.fn(),
    stepCount: 3,
  };
  const view = render(
    <OnboardingGuide
      {...props}
      step={{ title: 'The mill', content: 'Grain in, flour out.', icon: 'factory' }}
      stepIndex={0}
    />
  );
  const card = screen.getByRole('region', { name: 'Getting started, step 1 of 3' });
  Object.defineProperty(card, 'scrollHeight', { configurable: true, value: 640 });
  const details = screen.getByText('Camera controls').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(card.scrollTop).toBe(640);
  view.rerender(
    <OnboardingGuide
      {...props}
      step={{ title: 'Your goal', content: 'Ship the first order.', icon: 'goal' }}
      stepIndex={1}
    />
  );
  expect(card.scrollTop).toBe(0);
});
