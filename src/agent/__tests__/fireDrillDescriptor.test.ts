/**
 * The fire drill's agent descriptor says what the drill does to the line
 * (plan 6.3, D13): it stops the equipment and the forklifts, and when the drill
 * ends the line stays idle until RESTART LINE. No agent command restarts it.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CAPABILITY_DESCRIPTORS } from '../registry/commandCapabilityDescriptors.js';

describe('simulation.start-fire-drill descriptor', () => {
  const drill = (
    COMMAND_CAPABILITY_DESCRIPTORS as readonly { id: string; sideEffects: readonly string[] }[]
  ).find((descriptor) => descriptor.id === 'simulation.start-fire-drill')!;

  it('says the line stays idle after the drill until RESTART LINE', () => {
    const text = drill.sideEffects.join(' ');
    expect(text).toMatch(/forklifts/i);
    expect(text).toMatch(/stays idle/i);
    expect(text).toContain('RESTART LINE');
  });

  it('names no agent command that restarts the line', () => {
    expect(
      COMMAND_CAPABILITY_DESCRIPTORS.some((descriptor: { id: string }) =>
        /restart-line|restartLine/i.test(descriptor.id)
      )
    ).toBe(false);
  });
});
