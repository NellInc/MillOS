import { describe, expect, it } from 'vitest';
import { STEAM_SOURCES } from './DustParticles';
import { PROCESS_MACHINE_INSTALL_SCALE, SITE_LAYOUT } from '../constants/siteLayout';

describe('machine vents', () => {
  it('install each plume at its machine scale, with its vent point', () => {
    // The mills are installed at 0.4 of their authored size. The vent POINT
    // came down with them; the plume did not, so a full-size plume stood
    // 0.17 m off louvres it was authored to clear by 0.43 m. The clearance
    // in ventPlume.test.ts holds in authored metres only if the whole plume
    // shares the machine's scale.
    const mills = new Set<string>(SITE_LAYOUT.machines.rollerMills.map(({ id }) => id));
    const sifters = new Set<string>(SITE_LAYOUT.machines.sifters.map(({ id }) => id));
    for (const source of STEAM_SOURCES) {
      const expected = mills.has(source.machineId)
        ? PROCESS_MACHINE_INSTALL_SCALE.rollerMill
        : sifters.has(source.machineId)
          ? PROCESS_MACHINE_INSTALL_SCALE.sifter
          : PROCESS_MACHINE_INSTALL_SCALE.packer;
      expect(source.scale, source.machineId).toBeCloseTo(expected, 6);
    }
  });
});
