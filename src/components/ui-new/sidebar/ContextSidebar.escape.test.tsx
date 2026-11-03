import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { ContextSidebar } from './ContextSidebar';
import { KeyboardShortcutsModal } from '../../ui/KeyboardShortcutsModal';

vi.mock('../widgets/AutonomyPanel', () => ({
  AutonomyPanel: () => (
    <div>
      <input aria-label="Search transcript" defaultValue="hopper" />
      <textarea aria-label="Message the AI partner" defaultValue="draft" />
      <div contentEditable suppressContentEditableWarning aria-label="Notes">
        note
      </div>
      <button type="button">Plain control</button>
    </div>
  ),
}));
vi.mock('../panels/OverviewPanel', () => ({ OverviewPanel: () => null }));
vi.mock('../panels/SafetyPanel', () => ({ SafetyPanel: () => null }));
vi.mock('../panels/SettingsPanel', () => ({ SettingsPanel: () => null }));
vi.mock('./MachineInspector', () => ({ MachineInspector: () => null }));
vi.mock('./panelPreloader', () => ({ preloadPanelsForMode: vi.fn() }));

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(cleanup);

const renderSidebar = () => {
  const onClose = vi.fn();
  render(
    <ContextSidebar
      mode="management"
      isVisible
      onClose={onClose}
      selectedMachine={null}
      productionSpeed={1}
      setProductionSpeed={vi.fn()}
    />
  );
  return onClose;
};

// Escape clears a search field natively, so the player pressing it to empty
// the PA transcript search (or leave the AI draft) lost the whole panel.
// Working if Escape in a text field stays with the field, and anywhere else
// in or outside the panel still closes it.
it('leaves Escape typed in a text field to the field', () => {
  const onClose = renderSidebar();
  fireEvent.keyDown(screen.getByLabelText('Search transcript'), { key: 'Escape' });
  fireEvent.keyDown(screen.getByLabelText('Message the AI partner'), { key: 'Escape' });
  fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
});

it('still closes on Escape from a button or the page', () => {
  const onClose = renderSidebar();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Plain control' }), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(2);
});

// The keyboard help (?) has no exit animation, so its own Escape removes it
// from the page. In a browser React commits that close in a microtask, which
// runs between the help's listener and this one on the document; flushSync
// stands in for that commit. The sidebar then found no modal and closed too,
// so one Escape shut the help and the panel behind it.
// Working if Escape closes only the help, and the next Escape the panel.
it('leaves an Escape the keyboard help already handled to the help', () => {
  const onClose = vi.fn();
  const Harness = () => {
    const [helpOpen, setHelpOpen] = useState(true);
    return (
      <>
        <ContextSidebar
          mode="management"
          isVisible
          onClose={onClose}
          selectedMachine={null}
          productionSpeed={1}
          setProductionSpeed={vi.fn()}
        />
        <KeyboardShortcutsModal
          isOpen={helpOpen}
          onClose={() => flushSync(() => setHelpOpen(false))}
        />
      </>
    );
  };
  render(<Harness />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close keyboard shortcuts' }), {
    key: 'Escape',
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
