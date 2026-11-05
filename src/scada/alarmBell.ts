import { useUIStore } from '../stores/uiStore';

/**
 * Acknowledge the bell rows of alarms a SCADA acknowledgement closed. An alarm
 * acknowledged after it returned to normal leaves the alarm list, and the bell
 * bridge in store.ts reads only the ACKED state back (a removal can also be a
 * restart), so without this the bell kept asking for that alarm. Callers pass
 * only alarms the service confirms acknowledging, never a removal: the SCADA
 * panel (useSCADA.ts) and the agent's scada.acknowledge-alarm.
 */
export function acknowledgeAlarmBellRows(alarmIds: readonly string[]): void {
  if (alarmIds.length === 0) return;
  const ui = useUIStore.getState();
  const rowIds = new Set(alarmIds.map((id) => `scada-${id}`));
  ui.alerts.forEach((row) => {
    if (rowIds.has(row.id) && !row.acknowledged) ui.acknowledgeAlert(row.id);
  });
}
