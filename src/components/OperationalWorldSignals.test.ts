import { describe, expect, it, vi } from 'vitest';
import { createMachineObstacles } from '../constants/factoryObstacles';
import { SITE_LAYOUT } from '../constants/siteLayout';
import {
  INCIDENT_DEFINITIONS,
  useOperationsCampaignStore,
} from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import {
  OPERATIONAL_INCIDENT_PLACEMENTS,
  openOperationalSignalWorkspace,
  getOperationalSignalLabel,
  shouldLabelOperationalSignals,
} from './OperationalWorldSignals';

describe('operational world signal placement', () => {
  it('maps every operational incident into the canonical unified site', () => {
    expect(Object.keys(OPERATIONAL_INCIDENT_PLACEMENTS).sort()).toEqual(
      Object.keys(INCIDENT_DEFINITIONS).sort()
    );

    Object.values(OPERATIONAL_INCIDENT_PLACEMENTS).forEach(({ position }) => {
      expect(position.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(position[0], position[2])).toBeLessThan(SITE_LAYOUT.world.radius);
    });
  });

  it('keeps incident markers logically separated rather than stacking at the origin', () => {
    const placements = Object.values(OPERATIONAL_INCIDENT_PLACEMENTS);
    placements.forEach((placement, index) => {
      placements.slice(index + 1).forEach((other) => {
        expect(
          Math.hypot(
            placement.position[0] - other.position[0],
            placement.position[2] - other.position[2]
          )
        ).toBeGreaterThan(5);
      });
    });
  });

  it('keeps every ground-level marker outside the machine footprints', () => {
    const obstacles = createMachineObstacles(0);
    Object.entries(OPERATIONAL_INCIDENT_PLACEMENTS).forEach(([kind, { position }]) => {
      const [x, y, z] = position;
      if (y >= 1) return;
      obstacles.forEach((obstacle) => {
        const inside =
          x >= obstacle.minX && x <= obstacle.maxX && z >= obstacle.minZ && z <= obstacle.maxZ;
        expect(inside, `${kind} marker inside ${obstacle.id}`).toBe(false);
      });
    });
  });

  it('anchors machine incidents beside their actual production zones', () => {
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.bearing_overheat.position[2]).toBe(
      SITE_LAYOUT.factory.zones.milling
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.bearing_overheat.position[0] + 1.25).toBeLessThan(
      SITE_LAYOUT.machines.rollerMills[0].position[0] -
        SITE_LAYOUT.machineDimensions.rollerMill[0] / 2
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.dust_filter_pressure.position[2]).toBeCloseTo(
      SITE_LAYOUT.factory.zones.sifting + 2.75
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.dust_filter_pressure.position[1]).toBeGreaterThan(
      SITE_LAYOUT.datum.mezzanine
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.packaging_shortage.position[2]).toBe(
      SITE_LAYOUT.factory.zones.packing
    );
  });
});

it('labels all eight real incident kinds and phases without relying on colour', () => {
  for (const kind of Object.keys(INCIDENT_DEFINITIONS) as (keyof typeof INCIDENT_DEFINITIONS)[]) {
    for (const phase of ['raised', 'acknowledged', 'mitigated', 'resolved'] as const) {
      const lines = getOperationalSignalLabel(kind, phase).split('\n');
      expect(lines).toHaveLength(2);
      expect(lines.every((line) => line.length > 0 && line.length <= 22)).toBe(true);
    }
  }
  expect(getOperationalSignalLabel('dust_filter_pressure', 'raised')).toBe(
    'FILTER PRESSURE HIGH\nNEEDS ATTENTION'
  );
  expect(getOperationalSignalLabel('supplier_contamination', 'mitigated')).toContain(
    'RESPONSE APPLIED'
  );
  expect(INCIDENT_DEFINITIONS.power_sag.affectedMachineId).toBeNull();
  expect(getOperationalSignalLabel('power_sag', 'raised')).toBe('SITE POWER DIP\nNEEDS ATTENTION');
  expect(getOperationalSignalLabel('supplier_contamination', 'raised')).toBe(
    'GRAIN LOT HOLD\nNEEDS ATTENTION'
  );
  expect(shouldLabelOperationalSignals('low')).toBe(false);
  for (const quality of ['medium', 'high', 'ultra'] as const)
    expect(shouldLabelOperationalSignals(quality)).toBe(true);
});

it('opens existing controls for a live beacon without applying a response or capturing FPS clicks', () => {
  const campaign = useOperationsCampaignStore.getState();
  const { fpsMode, operationalFocusId } = useUIStore.getState();
  const event = vi.fn();
  window.addEventListener('millos:open-operations-workspace', event);
  try {
    const incident = {
      id: 'signal-response-test',
      kind: 'power_sag' as const,
      phase: 'raised' as const,
    };
    useOperationsCampaignStore.setState({
      incidents: [incident as (typeof campaign.incidents)[number]],
    });
    useUIStore.setState({ fpsMode: false });
    const before = useOperationsCampaignStore.getState();
    expect(openOperationalSignalWorkspace(incident.id)).toBe(true);
    expect(event).toHaveBeenCalledOnce();
    expect(event.mock.calls[0][0].detail).toBe('overview');
    expect(useUIStore.getState().operationalFocusId).toBe(incident.id);
    expect(useOperationsCampaignStore.getState()).toBe(before);
    useUIStore.setState({ fpsMode: true });
    expect(openOperationalSignalWorkspace(incident.id)).toBe(false);
    useUIStore.setState({ fpsMode: false });
    expect(openOperationalSignalWorkspace('stale-marker')).toBe(false);
    useOperationsCampaignStore.setState({
      incidents: [{ ...incident, phase: 'resolved' } as (typeof campaign.incidents)[number]],
    });
    expect(openOperationalSignalWorkspace(incident.id)).toBe(false);
    expect(event).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('millos:open-operations-workspace', event);
    useOperationsCampaignStore.setState(campaign, true);
    useUIStore.setState({ fpsMode, operationalFocusId });
  }
});
