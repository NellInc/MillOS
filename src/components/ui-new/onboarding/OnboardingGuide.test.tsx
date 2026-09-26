import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingGuide, type OnboardingStep } from './OnboardingGuide';

const step: OnboardingStep = {
  title: 'Follow the process',
  content: 'Inspect the grain route before changing production.',
  icon: 'factory',
};

describe('OnboardingGuide', () => {
  it('exposes progress and keeps Back disabled on the first step', () => {
    render(
      <OnboardingGuide
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const guide = screen.getByRole('region', { name: 'Getting started, step 1 of 3' });
    expect(guide).toBeVisible();
    expect(guide).toHaveClass(
      'max-h-[calc(100dvh-15.5rem)]',
      'overflow-y-auto',
      'overscroll-contain'
    );
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    const cameraHelp = screen.getByText('Camera controls').closest('details');
    expect(cameraHelp).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Camera controls'));
    expect(cameraHelp).toHaveAttribute('open');
    expect(screen.getByText(/Drag to orbit; scroll or pinch to zoom/)).toBeVisible();
  });

  it('routes Back, Next, Skip tour, and true Close independently', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onSkip = vi.fn();
    const onClose = vi.fn();

    render(
      <OnboardingGuide
        step={step}
        stepIndex={1}
        stepCount={3}
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    const close = screen.getByRole('button', { name: 'Close getting started for this session' });
    expect(close).toHaveClass('p-3.5', '-m-2.5');
    fireEvent.click(close);

    expect(onBack).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('labels the final action as Start operating', () => {
    render(
      <OnboardingGuide
        step={step}
        stepIndex={2}
        stepCount={3}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Start operating' })).toBeEnabled();
  });

  it('closes on Escape for this session but leaves Escape to an open modal dialog', () => {
    const onClose = vi.fn();
    render(
      <OnboardingGuide
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onClose={onClose}
      />
    );

    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    modal.remove();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
