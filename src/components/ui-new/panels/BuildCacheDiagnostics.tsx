import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  activateWaitingServiceWorker,
  addConnectivityListener,
  clearServiceWorkerCache,
  getBuildCacheDiagnostics,
  type BuildCacheDiagnostics as Diagnostics,
  updateServiceWorker,
} from '../../../utils/serviceWorkerRegistration';
import { formatFixed, useT } from '../../../i18n';
import {
  buildCacheDiagnosticsMessages,
  type BuildCacheStatusKey,
} from './BuildCacheDiagnostics.messages';

type ActionState = 'idle' | 'refreshing' | 'checking' | 'clearing' | 'activating';

export function BuildCacheDiagnostics(): ReactElement {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [action, setAction] = useState<ActionState>('refreshing');
  const t = useT(buildCacheDiagnosticsMessages);
  // A message key, resolved at render so a language switch also re-words it.
  const [message, setMessage] = useState<BuildCacheStatusKey>('statusReading');

  const refresh = useCallback(async (): Promise<void> => {
    const next = await getBuildCacheDiagnostics();
    setDiagnostics(next);
    setMessage('statusCurrent');
    setAction('idle');
  }, []);

  useEffect(() => {
    void refresh();
    const handleStatus = (): void => {
      void refresh();
    };
    const removeConnectivityListener = addConnectivityListener(handleStatus);
    window.addEventListener('millos:service-worker-status', handleStatus);
    return () => {
      removeConnectivityListener();
      window.removeEventListener('millos:service-worker-status', handleStatus);
    };
  }, [refresh]);

  const checkForUpdate = async (): Promise<void> => {
    setAction('checking');
    setMessage('statusChecking');
    const checked = await updateServiceWorker();
    await refresh();
    setMessage(checked ? 'statusUpToDate' : 'statusNoWorker');
  };

  const clearCache = async (): Promise<void> => {
    setAction('clearing');
    setMessage('statusClearing');
    const cleared = await clearServiceWorkerCache();
    await refresh();
    setMessage(cleared ? 'statusCleared' : 'statusClearFailed');
  };

  const activateUpdate = async (): Promise<void> => {
    setAction('activating');
    setMessage('statusActivating');
    const activated = await activateWaitingServiceWorker();
    if (activated) {
      window.location.reload();
      return;
    }
    await refresh();
    setMessage('statusActivateFailed');
  };

  const workerMismatch =
    diagnostics?.worker != null && diagnostics.worker.buildId !== diagnostics.appBuildId;
  const busy = action !== 'idle';
  const cacheGroups = diagnostics?.worker ? Object.entries(diagnostics.worker.caches) : [];

  return (
    <section aria-labelledby="build-cache-heading">
      <h3
        id="build-cache-heading"
        className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300"
      >
        <Database size={14} className="text-violet-400" aria-hidden="true" />
        {t('heading')}
      </h3>
      <div className="space-y-3 rounded-xl border border-white/5 bg-slate-800/50 p-3">
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <DiagnosticValue
            label={t('applicationBuild')}
            value={diagnostics?.appBuildId ?? t('reading')}
          />
          <DiagnosticValue
            label={t('workerBuild')}
            value={diagnostics?.worker?.buildId ?? t('notControlling')}
          />
          <DiagnosticValue
            label={t('cacheEntries')}
            value={diagnostics ? formatFixed(diagnostics.cacheEntries, 0) : t('reading')}
          />
          <DiagnosticValue
            label={t('connection')}
            value={diagnostics?.online === false ? t('offline') : t('online')}
            icon={
              diagnostics?.online === false ? (
                <WifiOff size={11} aria-hidden="true" />
              ) : (
                <Wifi size={11} aria-hidden="true" />
              )
            }
          />
        </div>

        {diagnostics && !diagnostics.supported && (
          <StatusNote tone="warning">{t('noteUnsupported')}</StatusNote>
        )}
        {diagnostics?.supported && !diagnostics.controlled && (
          <StatusNote tone="neutral">{t('noteInactive')}</StatusNote>
        )}
        {workerMismatch && <StatusNote tone="warning">{t('noteMismatch')}</StatusNote>}
        {diagnostics?.updateWaiting && <StatusNote tone="success">{t('noteReady')}</StatusNote>}

        {cacheGroups.length > 0 && (
          <details className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2">
            <summary className="cursor-pointer text-[10px] font-medium text-slate-300">
              {t('cacheGroups', { count: formatFixed(cacheGroups.length, 0) })}
            </summary>
            <dl className="mt-2 space-y-1">
              {cacheGroups.map(([name, cache]) => (
                <div key={name} className="flex items-start justify-between gap-3 text-[9px]">
                  <dt className="min-w-0 break-all font-mono text-slate-500">{name}</dt>
                  <dd className="shrink-0 text-slate-300">{formatFixed(cache.entries, 0)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            label={t('refreshStatus')}
            icon={<RefreshCw size={12} aria-hidden="true" />}
            disabled={busy}
            onClick={() => {
              setAction('refreshing');
              setMessage('statusRefreshing');
              void refresh();
            }}
          />
          <ActionButton
            label={t('checkForUpdate')}
            icon={<RotateCcw size={12} aria-hidden="true" />}
            disabled={busy || !diagnostics?.supported}
            onClick={() => void checkForUpdate()}
          />
          <ActionButton
            label={t('clearThisCache')}
            icon={<Trash2 size={12} aria-hidden="true" />}
            disabled={busy}
            onClick={() => void clearCache()}
          />
          <ActionButton
            label={t('activateUpdate')}
            icon={<CheckCircle2 size={12} aria-hidden="true" />}
            disabled={busy || !diagnostics?.updateWaiting}
            onClick={() => void activateUpdate()}
          />
        </div>

        <p className="min-h-4 text-[9px] leading-4 text-slate-400" role="status" aria-live="polite">
          {busy ? t(message) : diagnostics?.updateWaiting ? t('statusWaiting') : t(message)}
        </p>
      </div>
    </section>
  );
}

function DiagnosticValue({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactElement;
}): ReactElement {
  return (
    <div className="min-w-0 rounded-lg bg-slate-950/45 p-2">
      <div className="mb-1 flex items-center gap-1 text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="truncate font-mono text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );
}

function StatusNote({
  tone,
  children,
}: {
  tone: 'neutral' | 'warning' | 'success';
  children: string;
}): ReactElement {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
      : tone === 'success'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
        : 'border-slate-700 bg-slate-900/50 text-slate-300';
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border p-2 text-[10px] leading-4 ${toneClass}`}
    >
      {tone === 'warning' ? (
        <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      ) : tone === 'success' ? (
        <CheckCircle2 size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactElement;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-2 text-[10px] font-medium text-slate-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
