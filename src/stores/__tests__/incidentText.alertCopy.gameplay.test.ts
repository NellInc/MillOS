import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale, translate } from '../../i18n';
import { alertText } from '../../i18n/alertCopy';
import { unifiedGameTickMessages as msg } from '../../systems/UnifiedGameTick.messages';
import type { AlertData } from '../../types';
import { useOperationsCampaignStore } from '../operationsCampaignStore';
import { incidentAlertCopy } from '../incidentText';
import { dispatchHoldAlertCopy } from '../dispatchBlockText';

/*
 * The bell is restored with the plant, so a notice keeps the language it was
 * filed in unless it carries keys. These build each campaign notice the way
 * the tick files it, with the keys this lane provides, then switch language.
 */
const notice = (title: string, message: string, copy: AlertData['copy']) => ({
  title,
  message,
  copy,
});

describe('campaign bell notices follow the language', () => {
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => setLocale('en'));

  it('an incident notice filed in English reads in Portuguese after a switch', () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('power_sag')!;
    const filed = notice(
      incident.title,
      translate(msg, 'incidentAlert', { description: incident.description }),
      incidentAlertCopy(incident)
    );
    // In English the keyed text is the stored text, unchanged.
    expect(alertText(filed)).toEqual({ title: filed.title, message: filed.message });

    setLocale('pt-BR');
    const text = alertText(filed);
    expect(text.title).toBe('Queda de tensão na unidade');
    expect(text.message).toContain('O espaço de trabalho de operações registra');
    expect(text.message).not.toMatch(/voltage|operations workspace/i);
  });

  it('an incident of a kind this build no longer defines keeps its stored text', () => {
    expect(incidentAlertCopy({ kind: 'retired_kind' as never })).toBeUndefined();
  });

  it('each dispatch hold notice filed in English reads in Portuguese after a switch', () => {
    const programme = notice(
      translate(msg, 'shippingAwaitingProgrammeTitle'),
      translate(msg, 'noCommitmentToShip'),
      dispatchHoldAlertCopy({ kind: 'programme' })
    );
    const quality = notice(
      translate(msg, 'dispatchQualityHoldTitle'),
      translate(msg, 'clearBeforeRelease', {
        reason: translate(msg, 'failedQualityTest'),
        rate: '120.00',
      }),
      dispatchHoldAlertCopy({ kind: 'quality', code: 'failedQualityTest', rate: 120 })
    );
    const material = notice(
      translate(msg, 'shippingAwaitingProductTitle'),
      translate(msg, 'waitingForMaterial', { material: 'semolina' }),
      dispatchHoldAlertCopy({ kind: 'supply', code: 'waitingForMaterial', material: 'semolina' })
    );
    const product = notice(
      translate(msg, 'shippingAwaitingProductTitle'),
      translate(msg, 'waitingForProduct'),
      dispatchHoldAlertCopy({ kind: 'supply', code: null, material: 'flour' })
    );
    for (const filed of [programme, quality, material, product])
      expect(alertText(filed)).toEqual({ title: filed.title, message: filed.message });

    setLocale('pt-BR');
    expect(alertText(programme).title).toBe('Expedição aguardando um programa');
    expect(alertText(programme).message).toContain('Nenhum compromisso com cliente');
    expect(alertText(quality).title).toBe('Retenção de qualidade na expedição');
    // The rate is a raw number the catalogue formats: "120,00" in pt-BR.
    expect(alertText(quality).message).toBe(
      'O resultado de laboratório mais recente foi reprovado. Resolva a condição antes da liberação. Enquanto o caminhão espera na doca, o custo é de £120,00 por hora de jogo.'
    );
    expect(alertText(material).message).toBe('Aguardando fubá liberado nas ensacadeiras.');
    expect(alertText(product).message).toBe('Aguardando produto liberado nas ensacadeiras.');
  });
});
