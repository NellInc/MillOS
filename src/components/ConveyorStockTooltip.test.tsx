import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from '../stores/materialFlowStore';
import { formatFixed, setLocale } from '../i18n';
import { ConveyorStockTooltip } from './ConveyorStockTooltip';

const originalFlow = useMaterialFlowStore.getState();
const batch = (overrides: Partial<ProductionBatch> = {}): ProductionBatch => ({
  id: 'stock-test',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 100,
  availableKg: 100,
  simulationTime: 0,
  sourceContributions: [],
  disposition: 'released',
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  ...overrides,
});
const row = (label: string) => within(screen.getByText(label).parentElement!);
const released = (type: 'flour' | 'semolina') =>
  useMaterialFlowStore
    .getState()
    .productionBatches.reduce(
      (sum, b) =>
        sum + (b.materialType === type && b.disposition === 'released' ? b.availableKg : 0),
      0
    );

beforeEach(() => {
  setLocale('en');
  useMaterialFlowStore.setState({ productionBatches: [] });
});
afterEach(() => {
  cleanup();
  useMaterialFlowStore.setState(originalFlow, true);
  setLocale('en');
});

it('keeps visual slots free of invented batch, quality and weight telemetry', () => {
  const source = readFileSync('src/components/ConveyorSystem.tsx', 'utf8');
  expect(source).not.toMatch(
    /generateBatchNumber|batchNumber|GrainQuality|QUALITY_WEIGHTS|QUALITY_COLORS|getRandomQuality|BAG_WEIGHT_KG/
  );
  expect(source).toContain("const BAG_PRINT_COLOR = new THREE.Color('#245c55')");
  expect(source).toContain('stripes.setColorAt(index, BAG_PRINT_COLOR)');
  expect(source).toMatch(/hoveredBag && \([\s\S]*<ConveyorStockTooltip \/>/);
  expect(source).not.toContain('useMaterialFlowStore(');
});

it('shows only released finite positive stock from both actual product types', () => {
  useMaterialFlowStore.setState({
    productionBatches: [
      batch({ availableKg: 1000.25 }),
      batch({ availableKg: 25 }),
      batch({ materialType: 'semolina', availableKg: 123.45 }),
      ...(['hold', 'recalled', 'shipped'] as const).flatMap((disposition) => [
        batch({ disposition, availableKg: 9999 }),
        batch({ disposition, materialType: 'semolina', availableKg: 9999 }),
      ]),
      ...[NaN, Infinity, -100, 0].flatMap((availableKg) => [
        batch({ availableKg }),
        batch({ materialType: 'semolina', availableKg }),
      ]),
    ],
  });
  const before = useMaterialFlowStore.getState();
  render(<ConveyorStockTooltip />);
  expect(screen.getByText('Released stock')).toBeInTheDocument();
  expect(row('Flour').getByText('1025.3 kg')).toBeInTheDocument();
  expect(row('Semolina').getByText('123.5 kg')).toBeInTheDocument();
  expect(useMaterialFlowStore.getState()).toBe(before);
});

it('updates released totals while mounted as stock is depleted or put on hold', () => {
  useMaterialFlowStore.setState({
    productionBatches: [batch(), batch({ materialType: 'semolina', availableKg: 50 })],
  });
  render(<ConveyorStockTooltip />);
  expect(row('Flour').getByText('100.0 kg')).toBeInTheDocument();
  act(() => {
    useMaterialFlowStore.setState((state) => ({
      productionBatches: state.productionBatches.map((b) =>
        b.materialType === 'flour' ? { ...b, availableKg: 37.5 } : { ...b, disposition: 'hold' }
      ),
    }));
  });
  expect(row('Flour').getByText('37.5 kg')).toBeInTheDocument();
  expect(row('Semolina').getByText('0.0 kg')).toBeInTheDocument();
});

it('follows actual semolina dispatch without attributing it to the hovered sack', () => {
  const store = useMaterialFlowStore.getState();
  store.resetMaterialFlow();
  const plan = { sourceMaterial: 'corn_grain', finishedMaterial: 'semolina' } as const;
  for (let tick = 0; tick < 40; tick++) store.tickMaterialFlow(1, 1, plan);
  const before = released('semolina');
  expect(before).toBeGreaterThan(25);
  render(<ConveyorStockTooltip />);
  expect(row('Semolina').getByText(`${formatFixed(before, 1)} kg`)).toBeInTheDocument();
  act(() => {
    expect(useMaterialFlowStore.getState().shipFinishedGoods(25, 'semolina')).toBe(25);
  });
  expect(released('semolina')).toBeCloseTo(before - 25, 6);
  expect(row('Semolina').getByText(`${formatFixed(before - 25, 1)} kg`)).toBeInTheDocument();
  expect(screen.queryByText(/batch|quality|weight/i)).not.toBeInTheDocument();
});

it.each([
  ['en', 'Released stock', 'Flour', '1234.5 kg', '6.3 kg'],
  ['pt-BR', 'Estoque liberado', 'Farinha', '1.234,5 kg', '6,3 kg'],
] as const)('formats actual stock in %s', (locale, header, flour, flourKg, semolinaKg) => {
  useMaterialFlowStore.setState({
    productionBatches: [
      batch({ availableKg: 1234.5 }),
      batch({ materialType: 'semolina', availableKg: 6.25 }),
    ],
  });
  render(<ConveyorStockTooltip />);
  act(() => setLocale(locale));
  expect(screen.getByText(header)).toBeInTheDocument();
  expect(row(flour).getByText(flourKg)).toBeInTheDocument();
  expect(row('Semolina').getByText(semolinaKg)).toBeInTheDocument();
});
