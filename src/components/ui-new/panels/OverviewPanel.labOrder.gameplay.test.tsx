import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { MILL_RECIPES, useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { setLocale } from '../../../i18n';
import { BatchGenealogySection } from './OverviewPanel';

// Plan items 3.2 and 3.4 in the Overview's lab. A batch's quality and the
// minimum of the order it would serve were one line, "Qualidade 99,3,
// Farinha ... mínimo 95", where pt-BR's decimal comma met the list comma.
// Working if they are two readouts in both languages; a 93 batch read against
// the strong-white order says it is not loaded for it and which order takes
// it; and a batch awaiting the bench says so and can be put first.

const batch = (id: string, qualityScore: number, awaitingTest = false): ProductionBatch => ({
  id,
  disposition: 'released',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 1000,
  availableKg: 1000,
  simulationTime: 1,
  sourceContributions: [{ lotId: 'lot-00001', amount: 1000, path: ['silo-0', 'packer-0'] }],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  qualityScore,
  ...(awaitingTest ? { awaitingTest } : {}),
});

const row = (id: string) => within(screen.getByText(id.toUpperCase()).closest('li')!);

describe('the lab reads the order', () => {
  const originalFlow = useMaterialFlowStore.getState();
  const originalQC = useQCLabStore.getState();
  beforeEach(() => {
    useQCLabStore.getState().resetQCLab();
    // order-001 strong white (95) is served first; order-003 community (92).
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useMaterialFlowStore.setState(originalFlow, true);
    useQCLabStore.setState(originalQC, true);
  });

  it.each([
    ['en', 'Quality 93.0', 'minimum 95', 'Not loaded for', 'Offered to'],
    ['pt-BR', 'Qualidade 93,0', 'mínimo 95', 'Não carregado para', 'Oferecido para'],
  ] as const)(
    'shows quality and the minimum apart, and where a 93 batch goes, in %s',
    (locale, quality, minimum, notLoaded, offered) => {
      setLocale(locale);
      useMaterialFlowStore.setState({ productionBatches: [batch('batch-00001', 93)] });
      render(<BatchGenealogySection />);
      fireEvent.click(
        row('batch-00001').getByRole('button', {
          name: locale === 'en' ? 'Test batch' : /Testar lote/,
        })
      );
      const result = useQCLabStore.getState().qcLab.testHistory.at(-1)!;
      expect(result).toMatchObject({ orderId: 'order-001', minimumQuality: 95, passed: false });
      const shown = within(screen.getByRole('group', { name: new RegExp(result.id) }));
      expect(shown.getByText(quality)).toBeInTheDocument();
      expect(
        shown.getByText(
          `${MILL_RECIPES.strong_white.label}${locale === 'en' ? ' ' : ': '}${minimum}`
        )
      ).toBeInTheDocument();
      expect(
        shown.getByText(`${notLoaded} ${MILL_RECIPES.strong_white.label}`)
      ).toBeInTheDocument();
      expect(
        shown.getByText(`${offered} ${MILL_RECIPES.community_flour.label}`)
      ).toBeInTheDocument();
      // Nothing about falling number is shown without a stamped crop year.
      expect(shown.queryByText(/Falling number|Número de queda/)).toBeNull();
    }
  );

  it('says a batch awaits the bench, and Test first puts it first', () => {
    useMaterialFlowStore.setState({
      productionBatches: [batch('batch-00001', 97, true), batch('batch-00002', 97, true)],
    });
    render(<BatchGenealogySection />);
    expect(row('batch-00002').getByText('Awaiting test')).toBeInTheDocument();
    expect(row('batch-00002').queryByRole('button', { name: 'Test batch' })).toBeNull();
    fireEvent.click(row('batch-00002').getByRole('button', { name: 'Test first' }));
    expect(useQCLabStore.getState().qcLab.benchFirst).toBe('batch-00002');
  });
});
