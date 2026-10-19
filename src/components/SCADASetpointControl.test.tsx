import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADASetpointControl } from './SCADASetpointControl';
import { MILL_TAGS } from '../scada/tagDatabase';
import type { SCADAMode, TagValue } from '../scada/types';
import { initializeSCADA, shutdownSCADA } from '../scada/SCADAService';
import { useSCADA } from '../scada/useSCADA';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { setLocale } from '../i18n';

const SP_ID = 'RM101.ST001.SP';
const setpointTag = MILL_TAGS.find((tag) => tag.id === SP_ID)!;
const readingTag = MILL_TAGS.find((tag) => tag.id === 'RM101.ST001.PV')!;
const sample = (tagId: string, value: number): TagValue => ({
  tagId,
  value,
  quality: 'GOOD',
  timestamp: 0,
});

function renderControl(
  overrides: { mode?: SCADAMode; isConnected?: boolean; write?: ReturnType<typeof vi.fn> } = {}
) {
  const write = overrides.write ?? vi.fn(async () => true);
  render(
    <SCADASetpointControl
      tag={setpointTag}
      setpoint={sample(SP_ID, 1200)}
      readingTag={readingTag}
      reading={sample(readingTag.id, 1198)}
      mode={overrides.mode ?? 'simulation'}
      isConnected={overrides.isConnected ?? true}
      writeSetpoint={write}
    />
  );
  return write;
}

describe('SCADA setpoint control', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('shows the current setpoint and reading, and says truthfully what a write changes', () => {
    renderControl();
    expect(screen.getByText('Setpoint now 1,200 RPM')).toBeInTheDocument();
    expect(screen.getByText('RM-101 Roll Speed reads 1,198 RPM')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Moves the simulated RM-101 Roll Speed toward this value over a few seconds. It does not change throughput: the order plan sets the line rate. The reading alarms below 600 or above 1,600 RPM.'
      )
    ).toBeInTheDocument();
  });

  it('rejects a value outside the engineering range without writing', async () => {
    const write = renderControl();
    const input = screen.getByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Enter a value from 0 to 2,000 RPM.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(write).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Enter a number.')).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });

  it('applies a valid value from the keyboard (Enter) and announces the result', async () => {
    const write = renderControl();
    const input = screen.getByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
    fireEvent.change(input, { target: { value: '1450' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(write).toHaveBeenCalledWith(SP_ID, 1450));
    expect(await screen.findByRole('status')).toHaveTextContent('Setpoint 1,450 RPM applied.');
  });

  it('reports a refused write instead of claiming success', async () => {
    renderControl({ write: vi.fn(async () => false) });
    const input = screen.getByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
    fireEvent.change(input, { target: { value: '1300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The write was refused; the setpoint is unchanged.'
    );
  });

  it.each([
    [
      'hybrid',
      true,
      'Setpoint writes are limited to the local simulation. This SCADA is in hybrid mode.',
    ],
    [
      'live',
      true,
      'Setpoint writes are limited to the local simulation. This SCADA is in live mode.',
    ],
    ['simulation', false, 'SCADA is not connected, so setpoints cannot be written.'],
  ] as const)(
    'is disabled with a reason in %s mode (connected %s)',
    (mode, isConnected, reason) => {
      const write = renderControl({ mode, isConnected });
      const input = screen.getByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
      const apply = screen.getByRole('button', { name: 'Apply' });
      expect(input).toBeDisabled();
      expect(apply).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
      expect(apply).toHaveAccessibleDescription(expect.stringContaining(reason));
      fireEvent.submit(input.closest('form')!);
      expect(write).not.toHaveBeenCalled();
    }
  );

  it('speaks Brazilian Portuguese', () => {
    setLocale('pt-BR');
    renderControl({ mode: 'hybrid' });
    expect(
      screen.getByLabelText('Novo setpoint para Setpoint de velocidade do RM-101 (RPM)')
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(screen.getByText('Setpoint atual 1.200 RPM')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Escritas de setpoint são limitadas à simulação local. Este SCADA está em modo híbrido.'
      )
    ).toBeInTheDocument();
  });
});

function LiveControl() {
  const { tags, values, mode, isConnected, writeSetpoint } = useSCADA();
  const tag = tags.find((candidate) => candidate.id === SP_ID);
  if (!tag) return null;
  return (
    <SCADASetpointControl
      tag={tag}
      setpoint={values.get(SP_ID)}
      readingTag={readingTag}
      reading={values.get(readingTag.id)}
      mode={mode}
      isConnected={isConnected}
      writeSetpoint={writeSetpoint}
    />
  );
}

describe('SCADA setpoint control on the real SCADA service', () => {
  beforeEach(async () => {
    setLocale('en');
    useGraphicsStore.getState().setSCADAEnabled(true);
    useOperationsCampaignStore.getState().resetCampaign();
    await initializeSCADA({ mode: 'simulation', connection: { type: 'simulation' } });
  });

  afterEach(async () => {
    cleanup();
    await shutdownSCADA();
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it("records an operator write from the control in the campaign log as the operator's decision", async () => {
    render(<LiveControl />);
    const input = await screen.findByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: '1500' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });

    await waitFor(() =>
      expect(
        useOperationsCampaignStore.getState().logbook.filter((entry) => entry.relatedId === SP_ID)
      ).toEqual([
        expect.objectContaining({
          actor: 'operator',
          category: 'operation',
          message: 'RM-101 Speed Setpoint set to 1,500 RPM.',
        }),
      ])
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Setpoint 1,500 RPM applied.');
  });
});
