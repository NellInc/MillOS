import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessInspectionCard } from './ProcessInspectionCard';
import { processInspectionLessons } from './ProcessInspectionCard.messages';
import {
  useProcessInspectionStore as store,
  type ProcessInspectionKind,
} from '../../../stores/processInspectionStore';
import { setLocale } from '../../../i18n';
const releases: (() => void)[] = [];
const mount = (kind: ProcessInspectionKind, id = kind) => {
  releases.push(store.getState().register({ id, kind, name: `Actual ${id}` }));
};
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  releases.splice(0).forEach((release) => release());
  store.getState().close();
  setLocale('en');
});

describe('process inspection card', () => {
  it.each(['mill', 'sifter', 'packer', 'silo', 'henhouse'] as const)(
    'teaches the full %s flow with retries, back and finish',
    (kind) => {
      mount(kind);
      render(<ProcessInspectionCard subjectId={kind} />);
      const copy = processInspectionLessons[kind].en;
      click('View inside');
      expect(screen.getByRole('heading', { name: `Actual ${kind}: ${copy.title0}` })).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      click(copy.b0);
      expect(screen.getByRole('status')).toHaveTextContent(copy.retry0);
      click(copy.a0);
      click('Next');
      expect(screen.getByText(copy.text1)).toBeInTheDocument();
      click('Back');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      click(copy.a0);
      click('Next');
      click('Next');
      click(copy.a2);
      expect(screen.getByRole('status')).toHaveTextContent(copy.retry2);
      click(copy.b2);
      click('Next');
      expect(screen.getByText(copy.text3)).toBeInTheDocument();
      click('Finish');
      expect(store.getState().active).toBeNull();
    }
  );
  it('lists actual available names and closes on selection change and unmount', () => {
    mount('mill');
    mount('silo');
    const view = render(<ProcessInspectionCard />);
    expect(screen.getByRole('combobox', { name: 'Inspect' })).toHaveValue('mill');
    click('View inside');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'silo' } });
    expect(store.getState().active).toBeNull();
    click('View inside');
    expect(store.getState().active?.id).toBe('silo');
    view.unmount();
    expect(store.getState().active).toBeNull();
  });
  it('preserves a newer different subject when a fixed-id card changes or unmounts', () => {
    mount('mill');
    mount('silo');
    mount('packer');
    const view = render(<ProcessInspectionCard subjectId="mill" />);
    click('View inside');
    act(() => {
      store.getState().start('silo');
    });
    view.rerender(<ProcessInspectionCard subjectId="packer" />);
    expect(store.getState().active?.id).toBe('silo');
    view.unmount();
    expect(store.getState().active?.id).toBe('silo');
  });
  it('opens from an external start, closes explicitly and translates live', () => {
    mount('henhouse');
    render(<ProcessInspectionCard />);
    act(() => {
      store.getState().start('henhouse');
    });
    expect(screen.getByRole('heading', { name: 'Actual henhouse: Nests' })).toHaveFocus();
    act(() => setLocale('pt-BR'));
    expect(screen.getByRole('heading', { name: 'Actual henhouse: Ninhos' })).toBeInTheDocument();
    click('Botar ovos');
    click('Avançar');
    expect(screen.getByText(processInspectionLessons.henhouse['pt-BR'].text1)).toBeInTheDocument();
    click('Fechar');
    expect(store.getState()).toMatchObject({ active: null, stage: 0, feedback: 'none' });
  });
  it('does not offer a usable entry without an actual registered subject', () => {
    render(<ProcessInspectionCard />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'View inside' })).toBeDisabled();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
