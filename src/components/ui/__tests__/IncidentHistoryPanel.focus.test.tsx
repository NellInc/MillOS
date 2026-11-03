import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IncidentHistoryPanel } from '../IncidentHistoryPanel';
import { useSafetyStore } from '../../../stores/safetyStore';

// Clear history swaps itself for Confirm / Cancel, and Confirm empties the
// list. Each removed the focused button, so focus fell to <body> and a
// keyboard user was thrown to the top of the page mid-action.
// Working if focus moves to Confirm when the clear is armed, back to Clear
// history on Cancel, and to the log's toggle once the log is cleared.
describe('IncidentHistoryPanel focus through the two-step clear', () => {
  beforeEach(() => {
    useSafetyStore.setState({ safetyIncidents: [] });
    useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'E-stop' });
  });
  afterEach(() => {
    cleanup();
    useSafetyStore.setState({ safetyIncidents: [] });
  });

  const openLog = () => {
    fireEvent.click(screen.getByRole('button', { name: /Incident Log/ }));
    const clear = screen.getByRole('button', { name: 'Clear history' });
    clear.focus();
    fireEvent.click(clear);
  };

  it('moves focus to Confirm when the clear is armed', () => {
    render(<IncidentHistoryPanel />);
    openLog();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm clear?' }));
  });

  it('returns focus to Clear history on Cancel', () => {
    render(<IncidentHistoryPanel />);
    openLog();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear history' }));
  });

  it('moves focus to the log toggle once the log is cleared', () => {
    render(<IncidentHistoryPanel />);
    openLog();
    const confirm = screen.getByRole('button', { name: 'Confirm clear?' });
    confirm.focus();
    fireEvent.click(confirm);
    expect(useSafetyStore.getState().safetyIncidents).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Incident Log/ }));
  });
});
