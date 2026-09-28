import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { PropaneTank, StorageTank } from '../FactoryExterior';

describe('painted pressure-vessel fallback lighting', () => {
  it('keeps both generated-asset fallbacks non-emissive at every supported size', () => {
    for (const tree of [
      StorageTank({ position: [0, 0, 0], radius: 3, length: 10 }),
      StorageTank({ position: [0, 0, 0], radius: 2.5, length: 8 }),
      PropaneTank({ position: [0, 0, 0], radius: 1.5, height: 5 }),
      PropaneTank({ position: [0, 0, 0], radius: 1.2, height: 4 }),
    ]) {
      if (tree instanceof Promise) throw new Error('Tank assembly must be synchronous');
      const surfaces: Record<string, unknown>[] = [];
      const visit = (node: ReactNode) =>
        Children.forEach(node, (child) => {
          if (!isValidElement<Record<string, unknown>>(child)) return;
          if (child.type === 'meshStandardMaterial' && child.props.roughness === 0.64)
            surfaces.push(child.props);
          visit(child.props.children as ReactNode);
          visit(child.props.fallback as ReactNode);
        });
      visit(tree);
      expect(surfaces.length).toBeGreaterThan(0);
      for (const surface of surfaces) expect(surface.emissiveIntensity ?? 0).toBe(0);
    }
  });
});
