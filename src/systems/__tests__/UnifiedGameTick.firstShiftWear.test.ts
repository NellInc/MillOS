import { beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useProductionStore } from '../../stores/productionStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useUIStore } from '../../stores/uiStore';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';

// Execute the scene's own roster factory (the useMemo body in MillScene), as
// UnifiedGameTick.playableJourney.test.ts does, so the seeded wear under test
// is the one a new session actually starts with.
function sceneRoster(): MachineData[] {
  const file = ts.createSourceFile(
    'MillScene.tsx',
    readFileSync('src/components/MillScene.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let body = '';
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(file) === 'machines' &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(file) === 'useMemo' &&
      ts.isArrowFunction(node.initializer.arguments[0])
    )
      body = (node.initializer.arguments[0] as ts.ArrowFunction).body.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const js = ts.transpileModule(`function buildRoster() ${body}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('SITE_LAYOUT', 'MachineType', `${js}; return buildRoster();`)(
    SITE_LAYOUT,
    MachineType
  ) as MachineData[];
}

describe('the first standard-pace shift meets one wear warning', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useQCLabStore.getState().resetQCLab();
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ gameTime: 10, gameDay: 1 });
    useProductionStore.setState({ machines: sceneRoster(), productionSpeed: 1 });
  });

  it('warns one unit, not a whole line, inside six game hours and breaks nothing', () => {
    // One real second per tick at standard pace is thirty game seconds.
    const tick: TickContext = {
      deltaSeconds: 1,
      gameTime: 10,
      gameSpeed: STANDARD_GAME_SPEED,
      elapsedTime: 0,
      tickCount: 0,
    };
    const ticksPerGameHour = 3600 / STANDARD_GAME_SPEED;
    let firstWarningHour: number | null = null;
    for (let index = 0; index < 6 * ticksPerGameHour; index += 1) {
      unifiedGameTick({ ...tick, tickCount: index + 1 });
      if (
        firstWarningHour === null &&
        useProductionStore.getState().machines.some((m) => m.status === 'warning')
      )
        firstWarningHour = (index + 1) / ticksPerGameHour;
    }

    const machines = useProductionStore.getState().machines;
    const warned = machines.filter((m) => m.status === 'warning').map((m) => m.id);
    expect(warned).toHaveLength(1);
    expect(machines.filter((m) => m.status === 'critical')).toHaveLength(0);
    // Not on the first tick, and well inside the first shift.
    expect(firstWarningHour).toBeGreaterThan(2);
    expect(firstWarningHour).toBeLessThan(5);
    // The warning raised the predictive alert that Mill Overview lists.
    expect(useBreakdownStore.getState().predictiveAlerts.map((a) => a.machineId)).toEqual(warned);
    // It also stays in the bell, tied to the machine, so the spoken PA line is
    // not the only record and the bell can open the repair.
    const wearAlerts = useUIStore
      .getState()
      .alerts.filter((a) => a.type === 'warning' && a.machineId === warned[0]);
    expect(wearAlerts).toHaveLength(1);
    expect(wearAlerts[0].title).toBe('Wear warning');
    expect(wearAlerts[0].message).toContain('Maintenance and repairs');
    // Read politely from the bell, so muting game audio does not hide it.
    expect(wearAlerts[0].announce).toBe('polite');
    // The warned unit's breakdown is still well beyond the first game day.
    const alert = useBreakdownStore.getState().predictiveAlerts[0];
    expect(alert.predictedTimeToFailure).toBeGreaterThan(24 * 60);
    // A first shift's flour stays good enough for Strong White.
    const batches = useMaterialFlowStore.getState().productionBatches;
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) expect(batch.qualityScore ?? 0).toBeGreaterThanOrEqual(95);
  });

  it('warns R.M. 101 after the first handover and breaks it on day 2 if left unserviced', () => {
    // R.M. 101 starts part-worn (MillScene). Its warning belongs to the
    // afternoon, not the first shift, and ignoring it costs the mill overnight.
    const tick: TickContext = {
      deltaSeconds: 1,
      gameTime: 10,
      gameSpeed: STANDARD_GAME_SPEED,
      elapsedTime: 0,
      tickCount: 0,
    };
    const ticksPerGameHour = 3600 / STANDARD_GAME_SPEED;
    const clock = () => {
      const game = useGameSimulationStore.getState();
      return (game.gameDay - 1) * 24 + game.gameTime;
    };
    const mill = () => useProductionStore.getState().machines.find((m) => m.id === 'rm-101')!;
    expect(mill().metrics.wear).toBe(46);
    let warnedAt: number | null = null;
    let brokeAt: number | null = null;
    for (let index = 0; index < 22 * ticksPerGameHour && brokeAt === null; index += 1) {
      unifiedGameTick({ ...tick, tickCount: index + 1 });
      if (warnedAt === null && mill().status === 'warning') warnedAt = clock();
      if (mill().metrics.wear >= 90 || mill().status === 'critical') brokeAt = clock();
    }
    // About 16:29 on day 1, and about 06:22 on day 2 (30 h after day 1 00:00).
    expect(warnedAt).toBeGreaterThan(14);
    expect(Math.abs(warnedAt! - (16 + 29 / 60))).toBeLessThan(0.25);
    expect(Math.abs(brokeAt! - (24 + 6 + 22 / 60))).toBeLessThan(0.5);
  });
});
