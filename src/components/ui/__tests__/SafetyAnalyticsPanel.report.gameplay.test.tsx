import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';
import { setLocale } from '../../../i18n';

// The downloaded report describes each incident in the language active when
// it is downloaded, and carries the plant clock it happened at.
describe('SafetyAnalyticsPanel report', () => {
  let blobs: Blob[] = [];
  beforeEach(() => {
    blobs = [];
    setLocale('en');
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
    useGameSimulationStore.setState({ gameDay: 1, gameTime: 8 });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setLocale('en');
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
    useGameSimulationStore.getState().resetGameState();
  });

  it('writes a stop logged in English in Portuguese after a switch, with its plant clock', async () => {
    useSafetyStore.getState().recordSafetyStop();
    setLocale('pt-BR');
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Análises de segurança/ }));
    fireEvent.click(screen.getByRole('button', { name: /Baixar|relatório/i }));
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    const report = JSON.parse(text);
    expect(report.incidents[0]).toMatchObject({
      type: 'stop',
      description: 'Empilhadeira parada por rota bloqueada',
      gameClock: { day: 1, hour: 8 },
    });
  });
});
