import { describe, expect, it } from 'vitest';
import { speakableText } from './paSpeechText';

describe('speakableText', () => {
  it.each([
    ['Daily target 25% packed.', 'Daily target twenty-five percent packed.'],
    ['Critical alarm at R.M. 101.', 'Critical alarm at R M one hundred and one.'],
    ['Wear at 87.5%, limit 90%.', 'Wear at eighty-seven point five percent, limit ninety percent.'],
    ['6,000 bags', 'six thousand bags'],
    ['1,005 bags', 'one thousand and five bags'],
    ['It costs £12.50 per game hour.', 'It costs twelve pounds fifty per game hour.'],
    ['Day 3, 14:05', 'Day three, fourteen oh five'],
    ['Day 3, 06:00', 'Day three, oh six hundred'],
    ['Day 3, 6:05', 'Day three, six oh five'],
    [
      'Mass balance within tolerance — nothing unaccounted for.',
      'Mass balance within tolerance, nothing unaccounted for.',
    ],
    ['Line 1 and Silo Alpha', 'Line one and Silo Alpha'],
  ])('en: %s', (input, spoken) => {
    expect(speakableText(input, 'en')).toBe(spoken);
  });

  it.each([
    ['Meta diária 25% embalada.', 'Meta diária vinte e cinco por cento embalada.'],
    ['Alarme crítico em R.M. 101.', 'Alarme crítico em R M cento e um.'],
    ['Desgaste 87,5%', 'Desgaste oitenta e sete vírgula cinco por cento'],
    ['6.000 sacos', 'seis mil sacos'],
    ['1.100 sacos', 'mil e cem sacos'],
    ['1.234 sacos', 'mil duzentos e trinta e quatro sacos'],
    ['200 sacos', 'duzentos sacos'],
    ['o custo é de £12,50 por hora', 'o custo é de doze libras e cinquenta por hora'],
    ['£1 por hora', 'uma libra por hora'],
    ['Dia 3, 14:05', 'Dia três, catorze e cinco'],
    ['Dia 3, 21:00', 'Dia três, vinte e uma horas'],
    ['Dia 2, 01:00', 'Dia dois, uma hora'],
  ])('pt-BR: %s', (input, spoken) => {
    expect(speakableText(input, 'pt-BR')).toBe(spoken);
  });

  it('leaves text without numbers or symbols as it was', () => {
    const line = 'Plansifter differential pressure is nominal across all active sections.';
    expect(speakableText(line, 'en')).toBe(line);
  });

  it('leaves numbers past its range as digits', () => {
    expect(speakableText('1234567890 tonnes', 'en')).toBe('1234567890 tonnes');
  });
});
