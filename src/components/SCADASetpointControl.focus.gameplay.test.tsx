import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADASetpointControl } from './SCADASetpointControl';
import { MILL_TAGS } from '../scada/tagDatabase';
import type { TagValue } from '../scada/types';
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

/**
 * Apply was disabled for the length of the write. A browser moves focus off a
 * focused control that becomes disabled (the HTML focus fixup rule), so a
 * keyboard user who pressed Apply landed on the page body and had to tab back
 * through the SCADA panel. jsdom does not run focus fixup, so this pins the
 * precondition: the pressed button stays focusable while the write is pending,
 * says it is busy, and a second press does not write twice.
 */
describe('SCADA setpoint control: Apply keeps keyboard focus', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('keeps the pressed Apply button focusable while the write is pending, and writes once', async () => {
    let resolveWrite: (ok: boolean) => void = () => undefined;
    const write = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveWrite = resolve;
        })
    );
    render(
      <SCADASetpointControl
        tag={setpointTag}
        setpoint={sample(SP_ID, 1200)}
        readingTag={readingTag}
        reading={sample(readingTag.id, 1198)}
        mode="simulation"
        isConnected
        writeSetpoint={write}
      />
    );
    const input = screen.getByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
    fireEvent.change(input, { target: { value: '1450' } });
    const apply = screen.getByRole('button', { name: 'Apply' });
    apply.focus();

    await act(async () => {
      fireEvent.click(apply);
    });

    const pending = screen.getByRole('button', { name: 'Applying...' });
    expect(pending).toBe(apply);
    expect(pending).not.toHaveAttribute('disabled');
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(apply);

    // A second press while the first write is pending does nothing.
    await act(async () => {
      fireEvent.click(pending);
    });
    expect(write).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveWrite(true);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Setpoint 1,450 RPM applied.');
    expect(screen.getByRole('button', { name: 'Apply' })).not.toHaveAttribute('aria-disabled');
  });
});
