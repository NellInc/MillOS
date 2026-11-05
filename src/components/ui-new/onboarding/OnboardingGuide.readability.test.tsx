import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OnboardingGuide } from './OnboardingGuide';

afterEach(cleanup);

const renderStep3 = () =>
  render(
    <OnboardingGuide
      step={{
        title: "Protect the day's flour",
        content: 'Every bag at the packers began as grain in the silos. Press ? for controls.',
        icon: 'goal',
      }}
      stepIndex={2}
      stepCount={3}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      onClose={vi.fn()}
    />
  );

const sizeCard = (card: HTMLElement, scrollHeight: number, clientHeight: number) => {
  Object.defineProperty(card, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(card, 'clientHeight', { configurable: true, value: clientHeight });
};

// Step 3 is the longest step. At 1280x657 the card's max-height (100dvh-20rem,
// 337 px) cut it off at "Press ? for controls" under the pinned footer, with
// nothing to say the rest was there to scroll to.
it('shows a scroll cue while step text runs below the pinned footer, and drops it at the end', () => {
  renderStep3();
  const card = screen.getByRole('region', { name: 'Getting started, step 3 of 3' });
  sizeCard(card, 520, 417);
  act(() => {
    fireEvent(window, new Event('resize'));
  });
  expect(screen.getByTestId('onboarding-more-below')).toBeInTheDocument();
  card.scrollTop = 103;
  fireEvent.scroll(card);
  expect(screen.queryByTestId('onboarding-more-below')).not.toBeInTheDocument();
});

it('shows no scroll cue when the whole step fits', () => {
  renderStep3();
  const card = screen.getByRole('region', { name: 'Getting started, step 3 of 3' });
  sizeCard(card, 400, 400);
  act(() => {
    fireEvent(window, new Event('resize'));
  });
  expect(screen.queryByTestId('onboarding-more-below')).not.toBeInTheDocument();
});

// The desktop HUD above the card is one 3rem bar, but the card reserved 8.5rem
// above itself: 64 px of a 657 px window the step text could have used. Phones
// keep the reserve that clears the top-right walk toggle and its safe-area inset.
it('gives the card the height the desktop HUD leaves free, keeping the phone and short-landscape limits', () => {
  renderStep3();
  const card = screen.getByRole('region', { name: 'Getting started, step 3 of 3' });
  expect(card).toHaveClass(
    'max-h-[calc(100dvh-20rem)]',
    '[@media(min-width:640px)_and_(min-height:501px)]:max-h-[calc(100dvh-16rem)]',
    '[@media(min-width:640px)_and_(max-height:500px)]:max-h-[calc(100dvh-11rem)]',
    'bottom-[11.5rem]'
  );
});
