import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WindmillLearningCard } from './WindmillLearningCard';
import { useWindmillLearningStore as store } from '../../../stores/windmillLearningStore';
import { setLocale } from '../../../i18n';

let release: (() => void) | undefined;
beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  release?.();
  release = undefined;
  store.getState().close();
  setLocale('en');
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const mount = () => {
  release = store.getState().registerModel();
};

describe('windmill learning card', () => {
  it('waits for the model, focuses the lesson, retries and completes the real sequence', () => {
    render(<WindmillLearningCard />);
    expect(screen.getByRole('button', { name: 'Inside windmill' })).toBeDisabled();
    act(mount);
    click('Inside windmill');
    expect(screen.getByRole('heading', { name: 'Follow grain: Wind power' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    click('Sails');
    expect(screen.getByRole('status')).toHaveTextContent('Try again');
    click('Runner stone');
    click('Next');
    expect(screen.getByText('Hopper → shoe → central eye')).toBeInTheDocument();
    click('Next');
    click('Bed stone');
    click('Next');
    expect(screen.getByText(/Sifting is a separate step/)).toBeInTheDocument();
    click('Finish');
    expect(store.getState().open).toBe(false);
  });
  it('expands on an external start, and collapse, close and unmount exit the lesson', () => {
    mount();
    const view = render(<WindmillLearningCard />);
    act(() => {
      store.getState().start();
    });
    expect(screen.getByRole('heading', { name: /Follow grain/ })).toHaveFocus();
    fireEvent.click(screen.getByText('Windmill cutaway'));
    expect(store.getState().open).toBe(false);
    click('Inside windmill');
    click('Close cutaway');
    click('Inside windmill');
    view.unmount();
    expect(store.getState()).toMatchObject({ open: false, ready: true, stage: 'power' });
  });
  it('uses live Brazilian Portuguese copy and closes when model readiness ends', () => {
    mount();
    render(<WindmillLearningCard />);
    act(() => {
      setLocale('pt-BR');
    });
    click('Dentro do moinho');
    expect(
      screen.getByRole('heading', { name: 'Siga o grão: Força do vento' })
    ).toBeInTheDocument();
    act(() => release?.());
    expect(screen.getByRole('button', { name: 'Dentro do moinho' })).toBeDisabled();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
