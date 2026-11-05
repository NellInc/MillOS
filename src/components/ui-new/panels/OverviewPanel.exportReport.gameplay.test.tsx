import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../../i18n';
import { useProductionStore } from '../../../stores/productionStore';
import { QuickActionsSection } from './OverviewPanel';

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

/**
 * Overview's Export writes a report of the plant. Its daily target carried
 * targetThroughput 1500 and actualThroughput 0, figures nothing in the game
 * writes, so the file said the plant was packing nothing beside the live rate
 * in its own metrics. Working if every rate in the report is one the game
 * measured.
 */
describe('Overview export report', () => {
  let blobs: Blob[] = [];
  const saved = useProductionStore.getState().metrics;

  beforeEach(() => {
    blobs = [];
    setLocale('en');
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    useProductionStore.setState({ metrics: { ...saved, throughput: 312 } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useProductionStore.setState({ metrics: saved });
  });

  it('carries no throughput figure the game never measured', async () => {
    render(<QuickActionsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(blobs).toHaveLength(1);
    const report = JSON.parse(await readBlob(blobs[0]));
    expect(report.metrics.throughput).toBe(312);
    expect(report.productionTarget).toMatchObject({
      targetBags: useProductionStore.getState().productionTarget?.targetBags,
    });
    expect(report.productionTarget).not.toHaveProperty('actualThroughput');
    expect(report.productionTarget).not.toHaveProperty('targetThroughput');
  });
});
