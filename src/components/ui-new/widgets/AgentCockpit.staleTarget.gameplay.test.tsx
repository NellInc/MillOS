import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { installMillOSAgentRuntime } from '../../../agent/adapters/runtime/installAgentRuntime';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { setLocale } from '../../../i18n';

// The target list follows the live targets, but a target the player picked was
// kept after it left the list: the dropdown then showed the first remaining
// target while Preview still aimed the command at the one that had gone.
// Working if the command always goes to the target the dropdown shows.
describe('agent cockpit target that leaves the list', () => {
  const removals: Array<() => void> = [];
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().initializeCampaign();
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    cleanup();
    removals.splice(0).forEach((remove) => remove());
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it('previews the target the dropdown shows once the picked one is answered elsewhere', async () => {
    const first = useOperationsCampaignStore.getState().triggerIncident('bearing_overheat')!;
    const second = useOperationsCampaignStore.getState().triggerIncident('delayed_truck')!;
    expect(first.id).not.toBe(second.id);
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), {
      target: { value: 'incident.acknowledge' },
    });
    const secondUri = `millos://incident/${second.id}`;
    fireEvent.change(screen.getByLabelText('Incident Uri'), { target: { value: secondUri } });
    expect((screen.getByLabelText('Incident Uri') as HTMLSelectElement).value).toBe(secondUri);

    // The player answers the second incident on another surface, and the
    // cockpit re-reads its targets (here after a preview).
    act(() => useOperationsCampaignStore.getState().acknowledgeIncident(second.id));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview effects/i }));
    });

    const shown = (screen.getByLabelText('Incident Uri') as HTMLSelectElement).value;
    expect(shown).toBe(`millos://incident/${first.id}`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview effects/i }));
    });
    // The preview is of the incident shown, which is still raised: nothing refuses it.
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /commit preview/i }));
    });
    // The incident the dropdown named is the one acknowledged.
    expect(
      useOperationsCampaignStore.getState().incidents.find((item) => item.id === first.id)?.phase
    ).toBe('acknowledged');
  });
});
