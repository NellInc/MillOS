import { describe, expect, it } from 'vitest';
import { createTranslator } from '../index';
import { aiCommandCenterMessages } from '../../components/AICommandCenter.messages';
import { mobilePanelMessages } from '../../components/mobile/MobilePanel.messages';
import { costEstimationOverlayMessages } from '../../components/ui/CostEstimationOverlay.messages';
import { decisionReplayMessages } from '../../components/ui/DecisionReplay.messages';
import { predictiveMaintenancePanelMessages } from '../../components/ui/PredictiveMaintenancePanel.messages';
import { overviewPanelMessages } from '../../components/ui-new/panels/OverviewPanel.messages';
import { contextSidebarMessages } from '../../components/ui-new/sidebar/ContextSidebar.messages';
import { machineInspectorMessages } from '../../components/ui-new/sidebar/MachineInspector.messages';
import { layoutPlannerMessages } from '../../components/ui-new/widgets/LayoutPlanner.messages';

/*
 * These labels sit where English uses CSS `capitalize` on a raw enum value.
 * Portuguese never title-cases, so the class is English-only (capitalizeIn)
 * and the pt-BR catalog supplies sentence case itself: capital first letter,
 * everything after it as written.
 */
describe('pt-BR labels that replace CSS capitalize are sentence case', () => {
  const cases: Array<[string, string]> = [
    [
      createTranslator(contextSidebarMessages, 'pt-BR')('machineType', { type: 'ROLLER_MILL' }),
      'Moinho de rolos',
    ],
    [
      createTranslator(machineInspectorMessages, 'pt-BR')('status', { status: 'critical' }),
      'Em estado crítico',
    ],
    [
      createTranslator(machineInspectorMessages, 'pt-BR')('maintenanceType', {
        type: 'preventive',
      }),
      'Preventiva',
    ],
    [createTranslator(mobilePanelMessages, 'pt-BR')('stageQualityHold'), 'Retenção de qualidade'],
    [createTranslator(mobilePanelMessages, 'pt-BR')('shiftMorning'), 'Manhã'],
    [
      createTranslator(aiCommandCenterMessages, 'pt-BR')('weather', { value: 'clear' }),
      'Céu limpo',
    ],
    [
      createTranslator(aiCommandCenterMessages, 'pt-BR')('runWindow', { value: 'morning' }),
      'Período: manhã',
    ],
    [
      createTranslator(decisionReplayMessages, 'pt-BR')('disposition', { value: 'accepted' }),
      'Aceita',
    ],
    [
      createTranslator(predictiveMaintenancePanelMessages, 'pt-BR')('phase', {
        phase: 'awaiting_parts',
      }),
      'Aguardando peças',
    ],
    [
      createTranslator(costEstimationOverlayMessages, 'pt-BR')('aiMode', { mode: 'hybrid' }),
      'Híbrido',
    ],
    [
      createTranslator(overviewPanelMessages, 'pt-BR')('runWindowValue', { value: 'night' }),
      'Noite',
    ],
    [
      createTranslator(overviewPanelMessages, 'pt-BR')('weatherValue', { value: 'storm' }),
      'Tempestade',
    ],
    [
      createTranslator(overviewPanelMessages, 'pt-BR')('dockState', { value: 'arriving' }),
      'Chegando',
    ],
    [
      createTranslator(layoutPlannerMessages, 'pt-BR')('planHeading', { plan: 'current' }),
      'Layout atual',
    ],
    [
      createTranslator(layoutPlannerMessages, 'pt-BR')('dockName', { dock: 'shipping' }),
      'Expedição',
    ],
    [
      createTranslator(decisionReplayMessages, 'pt-BR')('measurementLabel', {
        key: 'totalBagsProduced',
      }),
      'Sacos produzidos',
    ],
  ];

  it.each(cases)('%s', (actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('leaves English as the raw value the CSS capitalises', () => {
    expect(
      createTranslator(contextSidebarMessages, 'en')('machineType', { type: 'ROLLER_MILL' })
    ).toBe('roller mill');
    // A measurement key is a camelCase identifier, never shown raw.
    expect(
      createTranslator(decisionReplayMessages, 'en')('measurementLabel', {
        key: 'totalBagsProduced',
      })
    ).toBe('total bags produced');
    expect(createTranslator(machineInspectorMessages, 'en')('status', { status: 'critical' })).toBe(
      'critical'
    );
  });
});
