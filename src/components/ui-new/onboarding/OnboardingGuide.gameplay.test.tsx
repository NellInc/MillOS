import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OnboardingGuide, type OnboardingStep } from './OnboardingGuide';
import { setLocale } from '../../../i18n';

const detection = vi.hoisted(() => ({ isMobile: false, isTouchDevice: false }));
vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({
    isMobile: detection.isMobile,
    isSmallScreen: detection.isMobile,
    isCompactLayout: detection.isMobile,
    isTouchDevice: detection.isMobile || detection.isTouchDevice,
    isLandscape: true,
  }),
}));

afterEach(() => {
  cleanup();
  detection.isMobile = false;
  detection.isTouchDevice = false;
  setLocale('en');
});

const step: OnboardingStep = { title: 'Look', content: 'Look around.', icon: 'controls' };
const props = {
  step,
  stepCount: 3,
  onNext: vi.fn(),
  onSkip: vi.fn(),
  onClose: vi.fn(),
};

// Back is disabled on the first step. Pressing it from step 2 left keyboard
// focus on a control that had just become disabled, so Enter did nothing and
// Tab resumed from a dead button.
it('moves focus to Next when Back takes the tour to its first step', () => {
  const onBack = vi.fn();
  const { rerender } = render(<OnboardingGuide {...props} stepIndex={1} onBack={onBack} />);
  const back = screen.getByRole('button', { name: 'Back' });
  back.focus();
  fireEvent.click(back);
  expect(onBack).toHaveBeenCalledOnce();
  rerender(<OnboardingGuide {...props} stepIndex={0} onBack={onBack} />);
  expect(back).toBeDisabled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
});

it('leaves focus alone when the first step is reached some other way', () => {
  const { rerender } = render(<OnboardingGuide {...props} stepIndex={1} onBack={vi.fn()} />);
  const skip = screen.getByRole('button', { name: 'Skip tour' });
  skip.focus();
  rerender(<OnboardingGuide {...props} stepIndex={0} onBack={vi.fn()} />);
  expect(document.activeElement).toBe(skip);
});

// A phone has no W A S D; its camera help names the touch controls it has.
it.each([
  ['en', /D-pad/, /W A S D/],
  ['pt-BR', /direcional/, /W A S D/],
] as const)('gives touch players touch camera help (%s)', (locale, touch, keys) => {
  setLocale(locale);
  detection.isMobile = true;
  render(<OnboardingGuide {...props} stepIndex={1} onBack={vi.fn()} />);
  expect(screen.getByText(touch)).toBeInTheDocument();
  expect(screen.queryByText(keys)).not.toBeInTheDocument();
});

it('keeps the keyboard camera help on a desktop', () => {
  render(<OnboardingGuide {...props} stepIndex={1} onBack={vi.fn()} />);
  expect(screen.getByText(/W A S D/)).toBeInTheDocument();
});

// A 1024x768 iPad gets the desktop layout (no D-pad) but has no keyboard: the
// help read 'Use W A S D to move'. Working if a touch screen with no hover
// pointer is told the gestures it has.
it('gives a keyboardless tablet its gestures, not W A S D', () => {
  detection.isTouchDevice = true;
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === '(hover: none)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  try {
    render(<OnboardingGuide {...props} stepIndex={0} />);
    const help = screen.getByText('Camera controls').closest('details')!;
    expect(help).not.toHaveTextContent('W A S D');
    expect(help).not.toHaveTextContent('D-pad');
    expect(help).toHaveTextContent('two fingers');
  } finally {
    window.matchMedia = original;
  }
});
