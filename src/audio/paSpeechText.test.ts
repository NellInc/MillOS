import { describe, expect, it } from 'vitest';
import { speakableText } from './paSpeechText';

describe('speakableText', () => {
  it.each([
    ['Daily target 25% packed.', 'Daily target twenty-five percent packed.'],
    ['Alarm on R.M. 101.', 'Alarm on roller mill one oh one.'],
    [
      'Warning on R.M. 104. Please take a look.',
      'Warning on roller mill one oh four. Please take a look.',
    ],
    ['R.M. 112 is back up and running.', 'roller mill one twelve is back up and running.'],
    [
      'Warning on Plansifter A. Please take a look.',
      'Warning on Plansifter ay. Please take a look.',
    ],
    ["Morning shift's done. We earned an A.", "Morning shift's done. We earned an ay."],
    ["Night shift's done. We earned a B.", "Night shift's done. We earned a B."],
    ['A drill is over.', 'A drill is over.'],
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
    ['Alarme em R.M. 101.', 'Alarme em moinho cento e um.'],
    ['Fim do turno da manhã. Tiramos nota A.', 'Fim do turno da manhã. Tiramos nota á.'],
    ['Fim do turno da noite. Tiramos nota E.', 'Fim do turno da noite. Tiramos nota é.'],
    [
      'Alerta em Plansifter B. Deem uma olhada, por favor.',
      'Alerta em Plansifter B. Deem uma olhada, por favor.',
    ],
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
