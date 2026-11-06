import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { setLocale } from '../../../i18n';

// Light Shafts, Contact Shadows, Machine Vibration and Floor Puddles wrote
// graphics keys that no shipped module reads: their only readers are
// Machines.tsx, machines/InstancedSilos.tsx, infrastructure/FactoryFloor.tsx,
// utils/environmentRegistry.ts and the 0.10 archive, all unreachable from
// src/main.tsx (`validate:reachability`). A player flipped them and nothing
// changed. Working if Settings offers only switches that change the scene.
describe('Settings graphics switches', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it.each(['Light Shafts', 'Contact Shadows', 'Machine Vibration', 'Floor Puddles'])(
    'does not offer %s, which nothing in the shipped scene reads',
    (label) => {
      render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  );

  // Philosophy Tooltips wrote knowledgeStore.showTooltips, whose only readers
  // are in knowledge/KnowledgeTooltip.tsx, which nothing imports.
  it('does not offer Philosophy Tooltips, which nothing in the shipped game reads', () => {
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    expect(screen.getByText('Replay getting started')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Philosophy Tooltips' })).toBeNull();
  });

  it('still offers the live switches beside them', () => {
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    for (const label of ['Bloom Glow', 'Dust Particles', 'Wireframe Mode', 'High-Res Shadows']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });
});
