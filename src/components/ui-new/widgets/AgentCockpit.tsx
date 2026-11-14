import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Command,
  FileClock,
  Gauge,
  ListChecks,
  ShieldCheck,
} from 'lucide-react';
import type {
  AgentCommandPreview,
  AgentExecutionReceipt,
} from '../../../agent/contracts/commandContracts';
import type {
  AgentCapabilityDescriptor,
  AgentEntityKind,
} from '../../../agent/contracts/systemManifest';
import type { AgentJsonValue } from '../../../agent/contracts/queryContracts';
import { formatSemanticUri, parseSemanticUri } from '../../../agent/ontology/semanticUri.js';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { peekSCADAService } from '../../../scada/SCADAService';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { incidentTitle } from '../../../stores/incidentText';
import { decisionCardText } from '../../../utils/aiEngine';
import { translate, useLocale, useT, type Locale } from '../../../i18n';
import { agentCockpitMessages } from './AgentCockpit.messages';
import { customerDisplayName } from '../../../stores/customerNames';

type FieldValues = Record<string, string | number>;

export const AgentCockpit: React.FC = () => {
  const t = useT(agentCockpitMessages);
  const api = globalThis.window?.__MILLOS_AGENT__;
  // tickCampaign rebuilds `orders` on every central tick (0.5 s). Subscribing
  // to the ids and a primitive id:status key, rather than the array itself,
  // keeps the brief below from recapturing and rehashing the whole agent plane
  // twice a second. Only orders the command can act on are offered, as for
  // every other target: not the one in hand, nor a fulfilled or cancelled one.
  const orderIds = useOperationsCampaignStore(
    useShallow((state) =>
      state.orders
        .filter(
          (order) =>
            order.status !== 'fulfilled' &&
            order.status !== 'cancelled' &&
            !(order.id === state.activeOrderId && order.id === state.execution.orderId)
        )
        .map((order) => order.id)
    )
  );
  const orderKey = useOperationsCampaignStore((state) =>
    state.orders.map((order) => `${order.id}:${order.status}`).join('|')
  );
  const [capabilityId, setCapabilityId] = useState('operations.activate-order');
  const [fields, setFields] = useState<FieldValues>({});
  // Null until the player edits it: the default reads in the language chosen now.
  const [editedReason, setReason] = useState<string | null>(null);
  const reason = editedReason ?? t('defaultReason');
  const [preview, setPreview] = useState<AgentCommandPreview | null>(null);
  const [receipt, setReceipt] = useState<AgentExecutionReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Commit is replaced by "Receipt issued" when its receipt arrives; focus
  // moves to the preview button, the next step that line names.
  const previewButtonRef = useRef<HTMLButtonElement | null>(null);
  const [refocusPreview, setRefocusPreview] = useState(false);
  useEffect(() => {
    if (!refocusPreview || busy) return;
    setRefocusPreview(false);
    previewButtonRef.current?.focus();
  }, [refocusPreview, busy]);
  // Each brief() is a full state capture and hash, and trace() exports the
  // ledger. Read them when the runtime, the orders, or our own actions change,
  // never on every render; a slow tick keeps the exception queue current.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((tick) => tick + 1), BRIEF_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const capabilityObservation = useMemo(
    () => api?.capabilities() ?? null,

    [api, refreshTick]
  );
  const capabilities = capabilityObservation?.data.items ?? [];
  const capability = useMemo(
    () => capabilities.find((candidate) => candidate.id === capabilityId) ?? null,
    [capabilities, capabilityId]
  );
  const brief = useMemo(
    () => api?.brief() ?? null,

    [api, orderKey, refreshTick]
  );
  const policy = useMemo(
    () => api?.policy() ?? null,

    [api, refreshTick]
  );
  const trace = useMemo(
    () =>
      receipt ? (api?.trace({ correlationId: receipt.correlationId, limit: 20 }) ?? null) : null,
    [api, receipt]
  );
  // The workplace plan names the agreement by revision; the current one is the default.
  const workplaceRevision = useWorkplaceStore((state) => state.workplace.revision);
  const targetUris = useMemo(
    () => suggestedUris(capability, orderIds),
    // refreshTick re-reads the live targets (incidents, cards, work orders, batches, alarms).
    [capability, orderIds, refreshTick]
  );
  // Each target as the game names it (the card's action, the incident's title),
  // in the language shown: no card or incident shows its id anywhere else.
  const locale = useLocale();
  const targetNames = useMemo(
    () =>
      Object.fromEntries(
        targetUris.map((uri) => [uri, capability ? targetName(capability.id, uri, locale) : null])
      ),
    [capability, targetUris, locale]
  );
  const suggested = useMemo(
    () => suggestions(capability, targetUris, workplaceRevision),
    [capability, targetUris, workplaceRevision]
  );
  // A picked target that has left the live list (answered, resolved, repaired
  // elsewhere) gives way to the first one listed, which is what the dropdown
  // then shows: the command never goes to a target the player cannot see.
  const effectiveFields = useMemo(() => {
    const picked = Object.fromEntries(
      Object.entries(fields).filter(
        ([name, value]) =>
          !name.endsWith('Uri') || targetUris.length === 0 || targetUris.includes(String(value))
      )
    );
    return { ...suggested, ...picked };
  }, [fields, suggested, targetUris]);

  if (!api || !capabilityObservation || !brief || !policy) {
    return (
      <section className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3" role="status">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {t('warmingUp')}
        </div>
      </section>
    );
  }

  const briefData = record(brief.data);
  const health = record(briefData.health);
  const exceptions = Array.isArray(health.exceptions) ? health.exceptions : [];
  const activeObjections = policy.objections.filter((objection) => objection.status === 'active');
  const activeGrantIds = record(briefData.authority).activeGrantIds;
  const hasActiveGrant = Array.isArray(activeGrantIds) && activeGrantIds.length > 0;
  const committed = preview !== null && receipt?.previewId === preview.previewId;

  const resetAction = (nextCapabilityId: string) => {
    setCapabilityId(nextCapabilityId);
    setFields({});
    setPreview(null);
    setReceipt(null);
    setError(null);
  };

  const buildCommand = () => {
    if (!capability) throw new Error(translate(agentCockpitMessages, 'selectCapabilityError'));
    const targetKey = Object.keys(capability.parameters.properties).find((key) =>
      key.endsWith('Uri')
    );
    // A capability with no URI field (the workplace plan) has a fixed target.
    const targetUri = targetKey
      ? String(effectiveFields[targetKey] ?? '')
      : (suggestedUris(capability, orderIds)[0] ?? '');
    const parameters = Object.fromEntries(
      Object.keys(capability.parameters.properties)
        .filter((key) => effectiveFields[key] !== undefined && effectiveFields[key] !== '')
        .map((key) => [key, effectiveFields[key] as AgentJsonValue])
    );
    return api.draft({ capabilityId: capability.id, targetUri, parameters, reason });
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      setPreview(await api.preview(buildCommand()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setRefreshTick((tick) => tick + 1);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const approval =
        preview.status === 'requires-approval'
          ? api.approve(
              preview.previewId,
              'Human operator approved the visible effects, invariants, cost, and current revision.'
            )
          : undefined;
      const issued = await api.commit(preview, approval);
      setReceipt(issued);
      if (issued.previewId === preview.previewId) setRefocusPreview(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setRefreshTick((tick) => tick + 1);
    }
  };

  return (
    <div className="space-y-3" data-testid="agent-cockpit">
      <section
        className="rounded-xl border border-cyan-400/20 bg-slate-950/65 p-3"
        aria-labelledby="agent-situation-heading"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="agent-situation-heading"
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200"
            >
              <Bot className="h-4 w-4" aria-hidden="true" /> {t('situationBrief')}
            </h3>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">
              {t('briefStatusLine', {
                status:
                  briefData.status === undefined
                    ? t('stateObserved')
                    : t('briefStatus', { status: String(briefData.status) }),
                build: brief.build,
              })}
            </p>
          </div>
          <span className="rounded border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-semibold uppercase text-cyan-200">
            {t('runtimeMode', { mode: brief.mode })}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <BriefDatum icon={Gauge} label={t('revision')} value={brief.revision.slice(0, 13)} />
          <BriefDatum
            icon={ShieldCheck}
            label={t('authority')}
            value={hasActiveGrant ? t('scopedCommands') : t('noActiveGrant')}
          />
        </div>
      </section>

      <section
        className="rounded-xl border border-white/10 bg-slate-950/55 p-3"
        aria-labelledby="agent-exceptions-heading"
      >
        <h3
          id="agent-exceptions-heading"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
        >
          <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />{' '}
          {t('exceptionQueue')}
        </h3>
        <div className="mt-2 space-y-1.5">
          {exceptions.length === 0 && activeObjections.length === 0 ? (
            <p className="text-[10px] text-emerald-300">{t('noExceptions')}</p>
          ) : (
            <>
              {exceptions.slice(0, 4).map((item, index) => (
                <p
                  key={`exception-${index}`}
                  className={`rounded px-2 py-1.5 text-[10px] leading-4 ${
                    record(item).severity === 'blocking'
                      ? 'bg-red-400/5 text-red-200'
                      : 'bg-amber-400/5 text-amber-100'
                  }`}
                >
                  {exceptionText(item)}
                </p>
              ))}
              {activeObjections.map((objection) => (
                <p
                  key={objection.id}
                  className="rounded bg-violet-400/5 px-2 py-1.5 text-[10px] leading-4 text-violet-200"
                >
                  {t('objection', {
                    statement: t('objectionStatement', {
                      id: objection.id,
                      statement: objection.statement,
                    }),
                  })}
                </p>
              ))}
            </>
          )}
        </div>
      </section>

      <section
        className="rounded-xl border border-violet-400/20 bg-slate-950/65 p-3"
        aria-labelledby="agent-intent-heading"
      >
        <h3
          id="agent-intent-heading"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-200"
        >
          <Command className="h-4 w-4" aria-hidden="true" /> {t('intentAndPlan')}
        </h3>
        <label
          className="mt-3 block text-[10px] font-medium text-slate-400"
          htmlFor="agent-capability"
        >
          {t('capability')}
        </label>
        <select
          id="agent-capability"
          value={capabilityId}
          onChange={(event) => resetAction(event.target.value)}
          className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          {capabilities.map((item) => (
            <option key={item.id} value={item.id}>
              {t('capabilityTitle', { id: item.id, title: item.title })}
            </option>
          ))}
        </select>

        {capability && (
          <div className="mt-3 space-y-2">
            {Object.entries(capability.parameters.properties).map(([name, rawRules]) => (
              <SchemaField
                key={name}
                name={name}
                rules={rawRules}
                value={effectiveFields[name] ?? ''}
                suggestions={name.endsWith('Uri') ? targetUris : []}
                names={targetNames}
                onChange={(value) => {
                  setFields((current) => ({ ...current, [name]: value }));
                  setPreview(null);
                  setReceipt(null);
                }}
              />
            ))}
            <label
              className="block text-[10px] font-medium text-slate-400"
              htmlFor="agent-command-reason"
            >
              {t('reason')}
            </label>
            <textarea
              id="agent-command-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setPreview(null);
                setReceipt(null);
              }}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            />
            <button
              ref={previewButtonRef}
              type="button"
              disabled={busy}
              onClick={() => void handlePreview()}
              className="min-h-10 w-full rounded-lg bg-cyan-700 px-3 text-xs font-semibold text-white hover:bg-cyan-600 disabled:cursor-wait disabled:opacity-60"
            >
              {t('previewEffects')}
            </button>
          </div>
        )}
      </section>

      {preview && (
        <section
          className="rounded-xl border border-cyan-400/20 bg-slate-950/65 p-3"
          aria-labelledby="agent-preview-heading"
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="agent-preview-heading"
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" /> {t('currentPreview')}
            </h3>
            <StatusBadge status={preview.status} />
          </div>
          <PreviewList title={t('effects')} items={preview.effects} />
          <CheckList title={t('preconditions')} items={preview.preconditions} />
          <CheckList title={t('invariants')} items={preview.invariants} />
          <p className="mt-2 text-[10px] text-slate-400">
            {t('cost', {
              compute: preview.cost.computeClass,
              latency: preview.cost.latencyClass,
              external: preview.cost.externalCalls,
            })}
          </p>
          {preview.problems.length > 0 && (
            <div className="mt-2 space-y-1" role="alert">
              {preview.problems.map((problem, index) => (
                <p
                  key={`${problem.code}-${index}`}
                  className="text-[10px] leading-4 text-amber-200"
                >
                  {problem.code}: {t('agentText', { text: problem.message })}
                </p>
              ))}
            </div>
          )}
          {committed ? (
            <p className="mt-3 text-[10px] text-slate-400">{t('receiptIssued')}</p>
          ) : (
            preview.status !== 'denied' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCommit()}
                className="mt-3 min-h-10 w-full rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
              >
                {preview.status === 'requires-approval'
                  ? t('approveAndCommit')
                  : t('commitPreview')}
              </button>
            )
          )}
        </section>
      )}

      {(receipt || error) && (
        <section
          className="rounded-xl border border-white/10 bg-slate-950/65 p-3"
          aria-live="polite"
          aria-labelledby="agent-receipt-heading"
        >
          <h3
            id="agent-receipt-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
          >
            <ClipboardCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />{' '}
            {t('executionReceipt')}
          </h3>
          {error ? (
            <p className="mt-2 text-[10px] leading-4 text-red-300">
              {t('agentText', { text: error })}
            </p>
          ) : receipt ? (
            <div className="mt-2 space-y-1 text-[10px] leading-4 text-slate-300">
              <p>
                {t('receiptStatus')}{' '}
                <strong className="text-white">
                  {t('receiptStatusValue', { status: receipt.status })}
                </strong>
              </p>
              <p>
                {t('changedDomains', { domains: receipt.changedDomains.join(', ') || t('none') })}
              </p>
              {receipt.verification.map((item) => (
                <p key={item.id} className={item.passed ? 'text-emerald-300' : 'text-red-300'}>
                  {t(item.passed ? 'pass' : 'fail', {
                    detail: t('agentText', { text: item.detail }),
                  })}
                </p>
              ))}
              {/* A refused or failed command says why (a stale or expired preview, a handler that threw). */}
              {(receipt.problems ?? []).map((problem, index) => (
                <p key={`${problem.code}-${index}`} className="text-amber-200">
                  {problem.code}: {t('agentText', { text: problem.message })}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {trace && (
        <section
          className="rounded-xl border border-white/10 bg-slate-950/55 p-3"
          aria-labelledby="agent-causal-heading"
        >
          <h3
            id="agent-causal-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"
          >
            <FileClock className="h-4 w-4 text-violet-400" aria-hidden="true" />{' '}
            {t('causalWorkspace')}
          </h3>
          <ol className="mt-2 space-y-1 text-[10px] text-slate-400">
            {array(record(trace.data).records).map((item, index) => {
              const event = record(item);
              return (
                <li key={String(event.eventId ?? index)}>
                  {String(event.kind ?? t('event'))} ·{' '}
                  {String(event.beforeRevision ?? '').slice(0, 9)} →{' '}
                  {String(event.afterRevision ?? '').slice(0, 9)}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
};

const BriefDatum: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => (
  <div className="rounded-lg border border-white/5 bg-white/[0.025] p-2">
    <span className="flex items-center gap-1 text-slate-500">
      <Icon className="h-3 w-3" aria-hidden="true" /> {label}
    </span>
    <strong className="mt-1 block truncate font-mono text-slate-200">{value}</strong>
  </div>
);

const SchemaField: React.FC<{
  name: string;
  rules: Readonly<Record<string, unknown>>;
  value: string | number;
  suggestions: string[];
  names?: Record<string, string | null>;
  onChange: (value: string | number) => void;
}> = ({ name, rules, value, suggestions: values, names, onChange }) => {
  const t = useT(agentCockpitMessages);
  const id = `agent-field-${name}`;
  const label = t('fieldLabel', { name, label: humanize(name) });
  if (Array.isArray(rules.enum)) {
    return (
      <label className="block text-[10px] font-medium text-slate-400" htmlFor={id}>
        {label}
        <select
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-white"
        >
          <option value="">{t('selectOption')}</option>
          {rules.enum.map((item) => (
            <option key={String(item)} value={String(item)}>
              {t('enumOption', { value: String(item), label: humanize(String(item)) })}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (values.length > 0) {
    return (
      <label className="block text-[10px] font-medium text-slate-400" htmlFor={id}>
        {label}
        <select
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-white"
        >
          {values.map((item) => {
            const targetLabel = names?.[item];
            return (
              <option key={item} value={item}>
                {targetLabel ? t('targetOption', { name: targetLabel, id: item }) : item}
              </option>
            );
          })}
        </select>
      </label>
    );
  }
  return (
    <label className="block text-[10px] font-medium text-slate-400" htmlFor={id}>
      {label}
      <input
        id={id}
        type={rules.type === 'number' || rules.type === 'integer' ? 'number' : 'text'}
        value={value}
        min={typeof rules.minimum === 'number' ? rules.minimum : undefined}
        max={typeof rules.maximum === 'number' ? rules.maximum : undefined}
        onChange={(event) =>
          // An emptied number field stays empty, so buildCommand leaves it out
          // (Number('') would send 0).
          onChange(
            (rules.type === 'number' || rules.type === 'integer') && event.target.value !== ''
              ? Number(event.target.value)
              : event.target.value
          )
        }
        className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-white"
      />
    </label>
  );
};

const PreviewList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  const t = useT(agentCockpitMessages);
  return (
    <div className="mt-2">
      <h4 className="text-[10px] font-semibold text-slate-300">{title}</h4>
      <ul className="mt-1 list-inside list-disc text-[10px] leading-4 text-slate-400">
        {items.map((item) => (
          <li key={item}>{t('agentText', { text: item })}</li>
        ))}
      </ul>
    </div>
  );
};

const CheckList: React.FC<{
  title: string;
  items: Array<{ id: string; satisfied: boolean; detail: string }>;
}> = ({ title, items }) => {
  const t = useT(agentCockpitMessages);
  return (
    <div className="mt-2">
      <h4 className="text-[10px] font-semibold text-slate-300">{title}</h4>
      <ul className="mt-1 space-y-1 text-[10px] leading-4">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex gap-1 ${item.satisfied ? 'text-emerald-300' : 'text-amber-200'}`}
          >
            {item.satisfied ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 flex-none" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" aria-hidden="true" />
            )}
            <span className="sr-only">{item.satisfied ? t('satisfied') : t('notSatisfied')}</span>
            {t('agentText', { text: item.detail })}
          </li>
        ))}
      </ul>
    </div>
  );
};

const StatusBadge: React.FC<{ status: AgentCommandPreview['status'] }> = ({ status }) => {
  const t = useT(agentCockpitMessages);
  return (
    <span
      className={`rounded px-2 py-1 text-[9px] font-semibold uppercase ${status === 'ready' ? 'bg-emerald-400/10 text-emerald-300' : status === 'requires-approval' ? 'bg-violet-400/10 text-violet-200' : 'bg-red-400/10 text-red-200'}`}
    >
      {t('previewStatus', { status })}
    </span>
  );
};

const BRIEF_REFRESH_MS = 5000;

function suggestions(
  capability: AgentCapabilityDescriptor | null,
  uris: string[],
  workplaceRevision: number
): FieldValues {
  if (!capability) return {};
  if (capability.id === 'workplace.activate-plan') return { revision: workplaceRevision };
  const uri = uris[0];
  if (!uri) return {};
  const key = Object.keys(capability.parameters.properties).find((name) => name.endsWith('Uri'));
  return key ? { [key]: uri } : {};
}

function suggestedUris(capability: AgentCapabilityDescriptor | null, orderIds: string[]): string[] {
  if (!capability) return [];
  if (capability.id === 'operations.activate-order')
    return orderIds.map((id) => `millos://order/${id}`);
  if (capability.id === 'dispatch.release') return ['millos://dispatch/shipping'];
  // The handler accepts only this target (PRE.WORKPLACE.TARGET), as WorkplaceLab sends.
  if (capability.id === 'workplace.activate-plan') return ['millos://simulation/local'];
  if (capability.id === 'simulation.set-speed' || capability.id === 'simulation.start-fire-drill')
    return ['millos://simulation/main'];
  // Nothing in the game shows these ids, so the live targets each command can
  // act on are offered, read when the cockpit refreshes.
  const uris = (kind: AgentEntityKind, ids: string[]) =>
    ids.map((id) => formatSemanticUri(kind, id));
  switch (capability.id) {
    case 'incident.acknowledge':
    case 'incident.mitigate':
      return uris(
        'incident',
        useOperationsCampaignStore
          .getState()
          .incidents.filter((incident) =>
            capability.id === 'incident.acknowledge'
              ? incident.phase === 'raised'
              : incident.phase === 'raised' || incident.phase === 'acknowledged'
          )
          .map((incident) => incident.id)
      );
    case 'ai.respond-to-decision':
      return uris(
        'decision',
        useProductionStore
          .getState()
          .aiDecisions.filter((decision) => decision.status === 'pending')
          .map((decision) => decision.id)
      );
    case 'maintenance.request-repair':
    case 'maintenance.request-restart':
      return uris(
        'breakdown',
        useBreakdownStore
          .getState()
          .workOrders.filter((order) =>
            capability.id === 'maintenance.request-repair'
              ? order.phase === 'diagnosed' || order.phase === 'awaiting_parts'
              : order.phase === 'ready_to_restart'
          )
          .map((order) => order.breakdownId)
      );
    case 'quality.hold-batch':
    case 'quality.release-batch':
      return uris(
        'batch',
        useMaterialFlowStore
          .getState()
          .productionBatches.filter((batch) =>
            capability.id === 'quality.hold-batch'
              ? batch.disposition !== 'shipped' &&
                batch.disposition !== 'recalled' &&
                batch.disposition !== 'hold'
              : batch.disposition === 'hold'
          )
          .map((batch) => batch.id)
      );
    case 'scada.acknowledge-alarm':
      return uris(
        'alarm',
        (peekSCADAService()?.getActiveAlarms() ?? [])
          .filter((alarm) => alarm.acknowledgedAt === undefined)
          .map((alarm) => alarm.id)
      );
    case 'scada.write-setpoint':
      return uris(
        'tag',
        (peekSCADAService()?.getAllTags() ?? [])
          .filter((tag) => tag.accessMode !== 'READ')
          .map((tag) => tag.id)
      );
    default:
      return [];
  }
}

/** The name the game shows for a target; null where the id is all there is. */
function targetName(capabilityId: string, uri: string, locale: Locale): string | null {
  let localId: string;
  try {
    localId = parseSemanticUri(uri).localId;
  } catch {
    return null;
  }
  switch (capabilityId) {
    case 'operations.activate-order': {
      // The name the player reads (D17); the agent's own text keeps the id.
      const customer = useOperationsCampaignStore
        .getState()
        .orders.find((order) => order.id === localId)?.customer;
      return customer ? customerDisplayName(customer) : null;
    }
    case 'incident.acknowledge':
    case 'incident.mitigate': {
      const incident = useOperationsCampaignStore
        .getState()
        .incidents.find((candidate) => candidate.id === localId);
      return incident ? incidentTitle(incident, locale) : null;
    }
    case 'ai.respond-to-decision': {
      const decision = useProductionStore
        .getState()
        .aiDecisions.find((candidate) => candidate.id === localId);
      return decision ? decisionCardText(decision, locale).action : null;
    }
    case 'maintenance.request-repair':
    case 'maintenance.request-restart':
      return (
        useBreakdownStore.getState().workOrders.find((order) => order.breakdownId === localId)
          ?.machineName ?? null
      );
    default:
      return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function problemText(value: unknown): string {
  const item = record(value);
  // queryService exceptions carry `summary`; the other keys cover older shapes.
  return String(
    item.summary ??
      item.message ??
      item.detail ??
      item.code ??
      translate(agentCockpitMessages, 'operationalException')
  );
}

/** An exception line in the reader's language (the runtime writes English). */
function exceptionText(value: unknown): string {
  const item = record(value);
  // An incident's summary is its title as recorded; resolve the kind's copy in
  // the language active now, as every other incident surface does.
  if (typeof item.id === 'string' && item.id.startsWith('incident-')) {
    const incident = useOperationsCampaignStore
      .getState()
      .incidents.find((candidate) => candidate.id === item.relatedId);
    if (incident) return incidentTitle(incident);
  }
  return translate(agentCockpitMessages, 'agentText', { text: problemText(value) });
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}
