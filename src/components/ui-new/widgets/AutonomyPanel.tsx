import React, { useMemo } from 'react';
import { Activity, Boxes, Cpu, Gauge, Route, ShieldCheck, Truck } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProductionStore } from '../../../stores/productionStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { AgentCockpit } from './AgentCockpit';

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

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
  const { machines, metrics, productionTarget, dockStatus } = useProductionStore(
    useShallow((state) => ({
      machines: state.machines,
      metrics: state.metrics,
      productionTarget: state.productionTarget,
      dockStatus: state.dockStatus,
    }))
  );
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
  const readiness = useMemo(
    () => clampPercent((metrics.efficiency + metrics.uptime + metrics.quality) / 3),
    [metrics.efficiency, metrics.quality, metrics.uptime]
  );
  const targetProgress = productionTarget
    ? clampPercent((productionTarget.producedBags / Math.max(1, productionTarget.targetBags)) * 100)
    : 0;

  return (
    <div className="space-y-4 p-3" data-testid="autonomy-panel">
      <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/45 via-slate-950/80 to-slate-950/95 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5">
            <Cpu className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Autonomous plant state</h3>
            <p className="mt-0.5 text-[10px] leading-4 text-slate-400">
              Process, logistics, safety, and diagnostics in one picture.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-black tabular-nums text-cyan-200">
              {readiness.toFixed(0)}%
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              readiness index
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

      <section className="grid grid-cols-2 gap-2" aria-label="Autonomy metrics">
        <MetricCard
          label="Active assets"
          value={`${runningAssets}/${machines.length}`}
          detail={`${alarmedAssets} ${alarmedAssets === 1 ? 'needs' : 'need'} diagnostic attention`}
          icon={Activity}
          accent="text-emerald-400"
        />
        <MetricCard
          label="Throughput"
          value={`${metrics.throughput.toFixed(0)}`}
          detail="bags per simulated hour"
          icon={Gauge}
          accent="text-cyan-400"
        />
        <MetricCard
          label="Target"
          value={`${targetProgress.toFixed(0)}%`}
          detail="completed against the active batch plan"
          icon={Boxes}
          accent="text-violet-400"
        />
        <MetricCard
          label="Safety stops"
          value={`${safetyMetrics.safetyStops}`}
          detail={`${safetyMetrics.nearMisses} route ${
            safetyMetrics.nearMisses === 1 ? 'conflict' : 'conflicts'
          } recorded`}
          icon={ShieldCheck}
          accent="text-amber-400"
        />
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Route className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            Closed-loop coordination
          </h3>
        </div>
        <div className="space-y-2">
          <StatusLine
            label="Process control"
            ready={alarmedAssets === 0}
            detail={
              alarmedAssets === 0
                ? 'Machine states and targets agree.'
                : `${alarmedAssets} ${alarmedAssets === 1 ? 'alarm is' : 'alarms are'} holding the plan back.`
            }
          />
          <StatusLine
            label="Vehicle orchestration"
            ready={!forkliftEmergencyStop}
            detail={
              forkliftEmergencyStop
                ? 'The safety layer has grounded the forklifts.'
                : 'Forklifts, docks, and crossings share reservations.'
            }
          />
          <StatusLine
            label="Receiving sequence"
            ready={dockStatus.receiving.status === 'clear'}
            detail={`Receiving dock state: ${dockStatus.receiving.status}.`}
          />
          <StatusLine
            label="Shipping sequence"
            ready={dockStatus.shipping.status === 'clear'}
            detail={`Shipping dock state: ${dockStatus.shipping.status}.`}
          />
        </div>
      </section>

      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[10px] leading-4 text-slate-500">
        <Truck className="h-4 w-4 flex-none text-slate-400" />
        Open Simulated SCADA for the full alarm trail, tag quality, trends, and control history.
      </div>

      <AgentCockpit />
    </div>
  );
};

export default AutonomyPanel;
