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
      'max-h-[calc(100dvh-20rem)]',
      'overflow-y-auto',
      'overscroll-contain'
    );
    // A landscape phone (844x390) left 100dvh-20rem = 70 px: the step text and
    // language buttons sat under the card's own sticky footer. Short, wide
    // screens use the guided-delivery card's placement (PlayableShift JOURNEY_FRAME).
    expect(guide).toHaveClass(
      '[@media(min-width:640px)_and_(max-height:500px)]:left-auto',
      '[@media(min-width:640px)_and_(max-height:500px)]:right-5',
      '[@media(min-width:640px)_and_(max-height:500px)]:bottom-28',
      '[@media(min-width:640px)_and_(max-height:500px)]:max-h-[calc(100dvh-11rem)]'
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

  // Escape dismisses the tour for good; the X closes it for this session. The
  // guide says which one closed it, so the host need not watch the keyboard.
  it('tells its X and Escape apart in the close it reports', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Close getting started for this session' }));
    expect(onClose).toHaveBeenLastCalledWith();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenLastCalledWith('escape');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('leaves Escape to an open context sidebar so the topmost panel closes first', () => {
    const onClose = vi.fn();
    const sidebarEscape = vi.fn();
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

    // Mirrors ContextSidebar: role="complementary" aside, bubble-phase document listener.
    const sidebar = document.createElement('aside');
    sidebar.id = 'context-sidebar';
    sidebar.setAttribute('role', 'complementary');
    document.body.appendChild(sidebar);
    document.addEventListener('keydown', sidebarEscape);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(sidebarEscape).toHaveBeenCalledOnce();
      sidebar.remove();

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
      expect(sidebarEscape).toHaveBeenCalledOnce();
    } finally {
      sidebar.remove();
      document.removeEventListener('keydown', sidebarEscape);
    }
  });

  // The U and Y dashboards open over the guide; in the built app Escape closed
  // the guide behind them first. Working if Escape leaves the guide to the
  // open dashboard (data-escape-layer) and closes the guide once it is gone.
  it('leaves Escape to an open U or Y dashboard', () => {
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
    const dashboard = document.createElement('div');
    dashboard.setAttribute('data-escape-layer', '');
    document.body.appendChild(dashboard);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      dashboard.remove();
    }
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // The forklift inspector (DeferredOperationalUI) is a plain aside: Escape
  // clears the selected forklift before it dismisses the guide.
  it('leaves Escape to an open forklift inspector', () => {
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
    const inspector = document.createElement('aside');
    inspector.id = 'forklift-inspector';
    document.body.appendChild(inspector);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      inspector.remove();
    }
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pins Back, Skip tour and Start operating in a sticky footer of the card scroll box', () => {
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

    const guide = screen.getByRole('region', { name: 'Getting started, step 3 of 3' });
    const footer = screen.getByRole('button', { name: 'Start operating' }).closest('.sticky');
    expect(footer).not.toBeNull();
    // Sticky resolves against the nearest scroll box, which must be the card itself.
    expect(footer?.parentElement).toBe(guide);
    // -bottom-4 meets the card's p-4: at bottom-0 it stuck 16 px above the edge
    // and the step's text showed beneath it (seen on a phone at 844x390).
    expect(footer).toHaveClass('-bottom-4', '-mx-4', '-mb-4', 'px-4', 'bg-slate-950');
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Back' }));
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Skip tour' }));
    expect(guide.lastElementChild).toBe(footer);
  });
});
