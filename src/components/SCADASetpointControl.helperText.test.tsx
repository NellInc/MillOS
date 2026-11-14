import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADASetpointControl } from './SCADASetpointControl';
import { MILL_TAGS } from '../scada/tagDatabase';
import type { TagValue } from '../scada/types';
import { setLocale } from '../i18n';

// D-012: the setpoint form carried a helper paragraph under the field. Its
// facts now sit where they act: the alarm band beside the reading it limits,
// and what a write moves (and does not) in the result of the write.
const SP_ID = 'RM101.ST001.SP';
const setpointTag = MILL_TAGS.find((tag) => tag.id === SP_ID)!;
const readingTag = MILL_TAGS.find((tag) => tag.id === 'RM101.ST001.PV')!;
const sample = (tagId: string, value: number): TagValue => ({
  tagId,
  value,
  quality: 'GOOD',
  timestamp: 0,
});

function renderControl(withFollower = true) {
  const write = vi.fn<(tagId: string, value: number) => Promise<boolean>>(async () => true);
  const view = render(
    <SCADASetpointControl
      tag={setpointTag}
      setpoint={sample(SP_ID, 1200)}
      readingTag={withFollower ? readingTag : undefined}
      reading={withFollower ? sample(readingTag.id, 1198) : undefined}
      mode="simulation"
      isConnected
      writeSetpoint={write}
    />
  );
  return { write, form: view.container.querySelector('form')! };
}

/** A paragraph that is neither a live region nor a reason a control points at. */
function captionsIn(form: HTMLElement): string[] {
  const described = new Set(
    [...form.querySelectorAll('[aria-describedby]')].flatMap((el) =>
      (el.getAttribute('aria-describedby') ?? '').split(/\s+/)
    )
  );
  return [...form.querySelectorAll('p')]
    .filter((p) => !p.getAttribute('role') && !(p.id && described.has(p.id)))
    .map((p) => p.textContent ?? '');
}

const apply = async (form: HTMLElement, value: string) => {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
  fireEvent.submit(form);
  await waitFor(() => expect(screen.getByRole('status')).not.toBeEmptyDOMElement());
};

describe('the setpoint control without a helper line', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('puts the alarm band beside the reading and the write effect in its result', async () => {
    const { form } = renderControl();
    expect(captionsIn(form)).toEqual([]);
    expect(screen.queryByText(/does not change throughput/)).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).not.toHaveAttribute('aria-describedby');
    // Roll speed has no alarm band since it became the line rate (tagDatabase.ts).
    expect(screen.getByText('RM-101 Roll Speed reads 1,198 RPM')).toBeInTheDocument();
    await apply(form, '1450');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Setpoint 1,450 RPM applied. RM-101 Roll Speed moves toward it over a few seconds. Line rate now 145% on every mill. Per tonne: wear ×1.45, energy ×1.20 against 100%.'
    );
    expect(captionsIn(form)).toEqual([]);
  });

  it('states the new line rate when nothing follows the setpoint', async () => {
    const { form } = renderControl(false);
    expect(captionsIn(form)).toEqual([]);
    await apply(form, '1450');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Setpoint 1,450 RPM applied. Line rate now 145% on every mill. Per tonne: wear ×1.45, energy ×1.20 against 100%.'
    );
  });

  it('speaks Brazilian Portuguese', async () => {
    setLocale('pt-BR');
    const { form } = renderControl();
    expect(captionsIn(form)).toEqual([]);
    expect(screen.getByText(/: leitura 1\.198 RPM$/)).toBeInTheDocument();
    await apply(form, '1450');
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Setpoint 1\.450 RPM aplicado\. .+ segue até ele em alguns segundos\. Ritmo da linha agora em 145% em todos os moinhos\. Por tonelada: desgaste ×1,45, energia ×1,20 em relação a 100%\.$/
    );
  });
});
