import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkplacePressureChapter } from './WorkplacePressureChapter';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
} from '../../../simulation/bilateralWorkplace';
import { shiftResumable } from '../../../simulation/workplaceCampaign';
import { setLocale } from '../../../i18n';

afterEach(() => {
  cleanup();
  setLocale('en');
});

function season() {
  return transitionWorkplace(createWorkplace('game', 17), {
    type: 'startCampaign',
    args: ['toe-dip', 17],
  }).state;
}

describe('the chapter guidance after a reload (pass six)', () => {
  it('never says a shift a reload paused cannot resume', () => {
    const paused = restoreWorkplace(saveWorkplace(season()));
    expect(paused.phase).toBe('review');
    expect(shiftResumable(paused)).toBe(true);
    render(<WorkplacePressureChapter state={paused} navigate={() => {}} />);
    expect(screen.queryByText(/This shift cannot resume/)).not.toBeInTheDocument();
    expect(
      screen.getByText('A reload paused this shift before its end; resume it in Review.')
    ).toBeInTheDocument();
  });

  it('says so in Portuguese too', () => {
    const paused = restoreWorkplace(saveWorkplace(season()));
    setLocale('pt-BR');
    render(<WorkplacePressureChapter state={paused} navigate={() => {}} />);
    expect(screen.queryByText(/não pode ser retomado/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Uma recarga pausou este turno antes do fim; retome-o em Revisão.')
    ).toBeInTheDocument();
  });

  it('gives a stopped shift its next step, not the reload resume', () => {
    const stopped = transitionWorkplace(season(), { type: 'stop', args: [] }).state;
    expect(shiftResumable(stopped)).toBe(false);
    render(<WorkplacePressureChapter state={stopped} navigate={() => {}} />);
    expect(screen.queryByText(/A reload paused this shift/)).not.toBeInTheDocument();
    expect(screen.getByText('Continue to the next campaign shift in Review.')).toBeInTheDocument();
  });
});
