/**
 * A SCADA setpoint write made by a person or an agent is a decision, so it is
 * written to the campaign logbook with who made it; the shift review's
 * choices are read from that logbook. The plant's own writes carry no actor
 * and are not logged. Every write is a discrete, authorised action (no control
 * streams writes), so each one is its own entry rather than being coalesced.
 * Working if an agent or operator setpoint appears in "your decisions" with
 * its tag and value, and an untagged write leaves the logbook unchanged.
 */
import { formatGrouped, translate } from '../i18n';
import { useOperationsCampaignStore, type CampaignActor } from '../stores/operationsCampaignStore';
import { operationsCampaignMessages } from '../stores/operationsCampaignStore.messages';
import type { TagDefinition } from './types';

export type SetpointWriteActor = Exclude<CampaignActor, 'controller'>;

export function recordSetpointDecision(
  tag: Pick<TagDefinition, 'id' | 'name' | 'engUnit'>,
  value: number,
  actor: SetpointWriteActor
): void {
  const number = formatGrouped(value, { maximumFractionDigits: 1 });
  const reading = tag.engUnit ? `${number} ${tag.engUnit}` : number;
  useOperationsCampaignStore
    .getState()
    .addLogEntry(
      translate(operationsCampaignMessages, 'sourceScada'),
      'operation',
      translate(operationsCampaignMessages, 'logSetpointWritten', { tag: tag.name, reading }),
      tag.id,
      actor
    );
}
