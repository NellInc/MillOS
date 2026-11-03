import { afterEach, describe, expect, it } from 'vitest';
import { displayEventDetail } from './bilateralWorkplace';
import { bilateralWorkplaceMessages as wm } from './bilateralWorkplace.messages';
import { setLocale, translate } from '../i18n';

afterEach(() => setLocale('en'));

describe('Workplace lane, eighth pass: templated receipts after a language switch', () => {
  // Receipts are written once, in the language of the moment; a receipt with
  // numbers in it stayed in that language after a switch.
  it('shows a resumed-shift receipt in the language chosen now', () => {
    const recorded = translate(wm, 'evShiftResumed', { minute: '37' });
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toBe(
      'Turno retomado no minuto 37 após uma recarga; continua quando todos consentirem de novo.'
    );
  });

  it('carries its numbers into the new language', () => {
    const recorded = translate(wm, 'evReviewBound', { upper: '1234.5', shipped: '600' });
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toMatch(
      /^Limite de saída condicional de 0 a 1\.234,5 kg; comprovantes qualificados do turno 600 kg\./
    );
  });

  it('translates a receipt nested inside another', () => {
    const head = translate(wm, 'evResponseStock', { released: '120', held: '0', upper: '0' });
    const recorded = translate(wm, 'evResponse', { head, cost: '40' });
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toMatch(
      /^Estoque liberado conhecido 120 kg; estoque retido 0 kg\. .* depois 40 para este arranjo\./
    );
  });

  it('leaves a receipt in the language it was written in unchanged', () => {
    const recorded = translate(wm, 'evReviewBound', { upper: '0.30000000000000004', shipped: '1' });
    expect(displayEventDetail(recorded)).toBe(recorded);
  });
});

describe('Workplace lane, eighth pass: an abstained forecast review after a switch', () => {
  it('quotes the missing facts in the language chosen now', async () => {
    const { workplaceAdviceMessages } = await import('./workplaceAdvice.messages');
    const reason = translate(workplaceAdviceMessages, 'missingClock');
    const recorded = translate(wm, 'evReviewAbstained', { reason, shipped: '0' });
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toMatch(
      /^Eu me abstive: O relógio de material é inválido\./
    );
  });
});

describe('Workplace lane, eighth pass: an abstained adviser response after a switch', () => {
  it('reads wholly in the language chosen now', async () => {
    const { workplaceAdviceMessages } = await import('./workplaceAdvice.messages');
    const reason = translate(workplaceAdviceMessages, 'missingClock');
    const head = translate(wm, 'evResponseAbstain', { reason });
    const recorded = translate(wm, 'evResponse', { head, cost: '40' });
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toMatch(
      /^Eu me abstenho: O relógio de material é inválido\. Quanto ao custo:/
    );
  });
});
