import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * audioManager.playTruckArrival() already schedules the air brake 700 ms after
 * its horn (audioManager.ts), and TruckBay called playAirBrake() again straight
 * after it, so every docking truck hissed twice: once over the horn, once after.
 * Working if the docked branch leaves the air brake to playTruckArrival.
 */
describe('a docking truck', () => {
  it('plays its air brake once, through playTruckArrival', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const start = source.indexOf("if (truckState.phase === 'docked') {");
    expect(start).toBeGreaterThan(-1);
    const branch = source.slice(start, source.indexOf('} else if', start));
    expect(branch).toContain('audioManager.playTruckArrival()');
    expect(branch).not.toContain('playAirBrake');

    const audio = readFileSync('src/utils/audioManager.ts', 'utf8');
    const arrival = audio.slice(audio.indexOf('playTruckArrival() {'));
    expect(arrival.slice(0, arrival.indexOf('\n  }\n'))).toContain('this.playAirBrake()');
  });
});
