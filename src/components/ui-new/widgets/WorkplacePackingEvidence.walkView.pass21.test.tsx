import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FrozenPackingAdvice } from './WorkplacePackingEvidence';
import { WorkplaceImprovementPanel } from './WorkplaceImprovementPanel';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { useUIStore } from '../../../stores/uiStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace, transitionWorkplace } from '../../../simulation/bilateralWorkplace';
import type { PackingAdvice } from '../../../types/workplaceAdvice';

const packing = CAMERA_PRESETS.findIndex((preset) => preset.name === 'Packing');

function advice(): PackingAdvice {
  return {
    version: 1,
    fingerprint: 'f',
    arrangement: 'steady',
    evidence: {
      materialSessionId: 's',
      orderId: 'order-001',
      recipeId: 'r',
      finishedMaterial: 'flour',
      remainingOrderKg: 6000,
      releasedPackedKg: 0,
      heldPackedKg: 0,
      processingMachines: 1,
      totalMachines: 1,
      materialClockSeconds: 1,
      productionSpeed: 1,
      campaignMultiplier: 1,
      gameSpeed: 30,
      qualityRelease: true,
      truckCapacityKg: null,
      truckLoadedKg: null,
      truckStatus: null,
      missingFacts: [],
    },
    reasonToAbstain: null,
    workplaceMinutes: 90,
    physicalSeconds: 180,
    stepSeconds: 0.5,
    briefingMinutes: 0,
    linePacing: 0.78,
    packedLowKg: 0,
    packedHighKg: 0,
    dispatchLowerKg: 0,
    dispatchUpperKg: 0,
    genealogyErrorKg: null,
    assumptions: [],
  };
}

beforeEach(() => {
  useCameraStore.setState({ activePreset: null, isAnimating: false, targetPosition: null });
  // Walking: no camera controller is mounted, so a preset set now moves
  // nothing and flies the camera away the moment the player leaves walk mode.
  useUIStore.getState().setFpsMode(true);
});
afterEach(() => {
  cleanup();
  useUIStore.getState().setFpsMode(false);
});

describe('workplace view controls while walking (pass twenty-one)', () => {
  it('leaves walk mode to show the packing floor from frozen advice, as the number keys do', () => {
    render(<FrozenPackingAdvice advice={advice()} />);
    fireEvent.click(screen.getByRole('button', { name: 'View packing floor' }));
    expect(useUIStore.getState().fpsMode).toBe(false);
    expect(useCameraStore.getState().activePreset).toBe(packing);
  });

  it('leaves walk mode to watch the packing handoff', () => {
    let state = createWorkplace('game', 17);
    state = transitionWorkplace(state, {
      type: 'beginImprovement',
      args: ['cooperative', state.revision],
    }).state;
    useWorkplaceStore.setState({ workplace: state, participationMode: 'solo', turn: null });
    render(
      <WorkplaceImprovementPanel
        profile="cooperative"
        activate={async () => {}}
        busy={false}
        report={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Watch the packing handoff' }));
    expect(useUIStore.getState().fpsMode).toBe(false);
    expect(useCameraStore.getState().activePreset).toBe(packing);
  });
});
