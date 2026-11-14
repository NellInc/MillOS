import React, { useMemo } from 'react';
import { Activity, Boxes, Cpu, Gauge, Route, ShieldCheck } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProductionStore } from '../../../stores/productionStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { openProgramme } from '../../../stores/programmeCommitment';
import { useSafetyStore } from '../../../stores/safetyStore';
import { AgentCockpit } from './AgentCockpit';
import { WorkplaceLab } from './WorkplaceLab';
import { formatFixed, useT } from '../../../i18n';
import { autonomyPanelMessages } from './AutonomyPanel.messages';
import { plantReadinessIndex } from '../../../simulation/plantReadiness';
import { useRunningThroughput } from '../../../hooks/useRunningThroughput';

const MetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = ({ label, value, detail, icon: Icon, accent }) => (
  <div className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      <Icon className={`h-4 w-4 ${accent}`} />
    </div>
    <div className="mt-2 text-xl font-bold tabular-nums text-white">{value}</div>
    <div className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</div>
  </div>
);

const StatusLine: React.FC<{ label: string; ready: boolean; detail: string }> = ({
  label,
  ready,
  detail,
}) => (
  <div className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.025] p-2.5">
    <span
      className={`mt-1 h-2 w-2 flex-none rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`}
      aria-hidden="true"
    />
    <div className="min-w-0">
      <div className="text-xs font-medium text-slate-200">{label}</div>
      <div className="mt-0.5 text-[10px] leading-4 text-slate-500">{detail}</div>
    </div>
  </div>
);

export const AutonomyPanel: React.FC = () => {
  const t = useT(autonomyPanelMessages);
  const { machines, metrics, dockStatus } = useProductionStore(
    useShallow((state) => ({
      machines: state.machines,
      metrics: state.metrics,
      dockStatus: state.dockStatus,
    }))
  );
  // The goal is the running programme's committed tonnes (D11), as the HUD
  // shows it; with no programme open there is no card.
  const programme = useOperationsCampaignStore(useShallow((state) => openProgramme(state.orders)));
  const { forkliftEmergencyStop, safetyMetrics } = useSafetyStore(
    useShallow((state) => ({
      forkliftEmergencyStop: state.forkliftEmergencyStop,
      safetyMetrics: state.safetyMetrics,
    }))
  );

  const runningAssets = machines.filter((machine) => machine.status === 'running').length;
  const alarmedAssets = machines.filter(
    (machine) => machine.status === 'warning' || machine.status === 'critical'
  ).length;
  // 0 while the clock is held: a paused plant packs nothing.
  const shownThroughput = useRunningThroughput();
  const readiness = useMemo(
    () =>
      plantReadinessIndex({
        efficiency: metrics.efficiency,
        uptime: metrics.uptime,
        quality: metrics.quality,
      }),
    [metrics.efficiency, metrics.quality, metrics.uptime]
  );

  return (
    // ContextSidebar clips its body (`flex-1 overflow-hidden`), so the panel owns
    // its scroll root like its siblings. Working if the wheel reaches AgentCockpit.
    <div
      className="h-full space-y-4 overflow-y-auto overscroll-contain p-3"
      data-testid="autonomy-panel"
    >
      <WorkplaceLab />
      {/* 5.1: the panel opens on the season's next step; the plant's state and
          the agents sit behind their own disclosure. */}
      <details className="space-y-4">
        <summary className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
          <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5">
            <Cpu className="h-5 w-5 text-cyan-300" />
          </span>
          <span className="text-sm font-bold text-white">{t('plantStateTitle')}</span>
        </summary>
        <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/45 via-slate-950/80 to-slate-950/95 p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-black tabular-nums text-cyan-200">
                {formatFixed(readiness, 0)}%
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                {t('readinessIndex')}
              </div>
            </div>
            <div className="w-32">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                  style={{ width: `${readiness}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2" aria-label={t('metricsLabel')}>
          <MetricCard
            label={t('activeAssets')}
            value={`${formatFixed(runningAssets, 0)}/${formatFixed(machines.length, 0)}`}
            detail={t('activeAssetsDetail', { count: alarmedAssets })}
            icon={Activity}
            accent="text-emerald-400"
          />
          <MetricCard
            label={t('throughput')}
            value={formatFixed(shownThroughput, 0)}
            detail={t('throughputDetail')}
            icon={Gauge}
            accent="text-cyan-400"
          />
          {programme && (
            <MetricCard
              label={t('programme')}
              value={`${formatFixed(programme.percent, 1)}%`}
              detail={t('programmeDetail', {
                shipped: formatFixed(programme.shippedT, 1),
                committed: formatFixed(programme.committedT, 1),
              })}
              icon={Boxes}
              accent="text-violet-400"
            />
          )}
          <MetricCard
            label={t('safetyStops')}
            value={formatFixed(safetyMetrics.safetyStops, 0)}
            detail={t('safetyStopsDetail', { count: safetyMetrics.nearMisses })}
            icon={ShieldCheck}
            accent="text-amber-400"
          />
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Route className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
              {t('coordinationHeading')}
            </h3>
          </div>
          <div className="space-y-2">
            <StatusLine
              label={t('processControl')}
              ready={alarmedAssets === 0}
              detail={
                alarmedAssets === 0 ? t('processAgree') : t('processHeld', { count: alarmedAssets })
              }
            />
            <StatusLine
              label={t('vehicleOrchestration')}
              ready={!forkliftEmergencyStop}
              detail={forkliftEmergencyStop ? t('forkliftsGrounded') : t('forkliftsShare')}
            />
            <StatusLine
              label={t('receivingSequence')}
              ready={dockStatus.receiving.status === 'clear'}
              detail={t('receivingDockState', { status: dockStatus.receiving.status })}
            />
            <StatusLine
              label={t('shippingSequence')}
              ready={dockStatus.shipping.status === 'clear'}
              detail={t('shippingDockState', { status: dockStatus.shipping.status })}
            />
          </div>
        </section>

        <AgentCockpit />
      </details>
    </div>
  );
};

export default AutonomyPanel;
