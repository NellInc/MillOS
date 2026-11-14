/**
 * A held control says why, where it is held, in the refusal's own words, and
 * names that reason through aria-describedby. Once the chronicle has ended,
 * the Partners, Returns and Plans controls were held with nothing saying so;
 * a policy step that is not next in line said nothing either.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PartnersTab } from './PartnersTab';
import { ReturnsTab } from './ReturnsTab';
import { PlansTab } from './PlansTab';
import { PolicyTab } from './PolicyTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';
import { setLocale, type Locale } from '../../i18n';

const sign = () =>
  act(() =>
    useChronicleStore.getState().sign(
      {
        grain: 'cooperative',
        plant: 'tired',
        customers: 'loyal',
        fortune: 'kind',
        mode: 'no_trials',
      },
      21
    )
  );
const chronicle = () => useChronicleStore.getState().chronicle;
const held = () =>
  screen
    .queryAllByRole('button')
    .concat(screen.queryAllByRole('radio'), screen.queryAllByRole('switch'))
    .filter((control) => control.hasAttribute('disabled'));

beforeEach(() => {
  useOperationsCampaignStore.getState().resetCampaign();
  useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe.each([
  ['en', 'The chronicle is not running.'],
  ['pt-BR', 'A crônica não está em andamento.'],
] as const)('once the chronicle has ended (%s)', (locale: Locale, reason) => {
  beforeEach(() => setLocale(locale));

  it.each([
    ['Partners', PartnersTab],
    ['Returns', ReturnsTab],
    ['Plans', PlansTab],
  ] as const)('%s: every held control gives the stop as its reason', (_name, Tab) => {
    sign();
    const ended: ChronicleState = { ...chronicle(), status: 'ended' };
    render(<Tab state={ended} />);
    const controls = held();
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toHaveAccessibleDescription(reason);
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
  });
});

describe('a policy step', () => {
  it('not next in line says why it is held', () => {
    sign();
    render(<PolicyTab state={chronicle()} />);
    const controls = held();
    expect(controls.length).toBeGreaterThan(0);
    // Each says its own refusal (a far step: one step at a time; short of
    // know-how: what it needs), never nothing.
    for (const control of controls) expect(control).toHaveAccessibleDescription(/\S/);
  });
});

describe('the delegation level under the administrator', () => {
  it('gives the administrator as the reason for the levels it forbids', () => {
    sign();
    const administered: ChronicleState = {
      ...chronicle(),
      delegation: 2,
      governance: {
        ...chronicle().governance,
        administration: { untilShift: 99, previousDelegation: 1 },
      } as ChronicleState['governance'],
    };
    render(<PartnersTab state={administered} />);
    const levels = screen.getAllByRole('radio').filter((radio) => radio.hasAttribute('disabled'));
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels)
      expect(level).toHaveAccessibleDescription(
        'Under the federation administrator, the partner acts at level 2 or above.'
      );
  });
});
