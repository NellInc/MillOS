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

type ActionState = 'idle' | 'refreshing' | 'checking' | 'clearing' | 'activating';

export function BuildCacheDiagnostics(): ReactElement {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [action, setAction] = useState<ActionState>('refreshing');
  const [message, setMessage] = useState('Reading build and cache status.');

  const refresh = useCallback(async (): Promise<void> => {
    const next = await getBuildCacheDiagnostics();
    setDiagnostics(next);
    setMessage('Build and cache status is current.');
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
    setMessage('Looking for a newer build.');
    const checked = await updateServiceWorker();
    await refresh();
    setMessage(checked ? 'Up to date.' : 'No service worker registered.');
  };

  const clearCache = async (): Promise<void> => {
    setAction('clearing');
    setMessage('Clearing cached assets.');
    const cleared = await clearServiceWorkerCache();
    await refresh();
    setMessage(cleared ? 'Cache cleared.' : 'Could not clear the cache.');
  };

  const activateUpdate = async (): Promise<void> => {
    setAction('activating');
    setMessage('Activating the waiting build.');
    const activated = await activateWaitingServiceWorker();
    if (activated) {
      window.location.reload();
      return;
    }
    await refresh();
    setMessage('The waiting build could not be activated.');
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
        Build and cache
      </h3>
      <div className="space-y-3 rounded-xl border border-white/5 bg-slate-800/50 p-3">
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <DiagnosticValue label="Application build" value={diagnostics?.appBuildId ?? 'Reading'} />
          <DiagnosticValue
            label="Worker build"
            value={diagnostics?.worker?.buildId ?? 'Not controlling'}
          />
          <DiagnosticValue
            label="Cache entries"
            value={diagnostics ? String(diagnostics.cacheEntries) : 'Reading'}
          />
          <DiagnosticValue
            label="Connection"
            value={diagnostics?.online === false ? 'Offline' : 'Online'}
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
          <StatusNote tone="warning">
            Service workers are unavailable in this browser. Network loading remains active.
          </StatusNote>
        )}
        {diagnostics?.supported && !diagnostics.controlled && (
          <StatusNote tone="neutral">
            The service worker is inactive in this session. This is expected during normal local
            development.
          </StatusNote>
        )}
        {workerMismatch && (
          <StatusNote tone="warning">
            The page and worker builds differ. Activate the waiting build, or reload after the
            update completes.
          </StatusNote>
        )}
        {diagnostics?.updateWaiting && (
          <StatusNote tone="success">A newer build is ready to activate.</StatusNote>
        )}

        {cacheGroups.length > 0 && (
          <details className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2">
            <summary className="cursor-pointer text-[10px] font-medium text-slate-300">
              Cache groups ({cacheGroups.length})
            </summary>
            <dl className="mt-2 space-y-1">
              {cacheGroups.map(([name, cache]) => (
                <div key={name} className="flex items-start justify-between gap-3 text-[9px]">
                  <dt className="min-w-0 break-all font-mono text-slate-500">{name}</dt>
                  <dd className="shrink-0 text-slate-300">{cache.entries}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            label="Refresh status"
            icon={<RefreshCw size={12} aria-hidden="true" />}
            disabled={busy}
            onClick={() => {
              setAction('refreshing');
              setMessage('Refreshing build and cache status.');
              void refresh();
            }}
          />
          <ActionButton
            label="Check for update"
            icon={<RotateCcw size={12} aria-hidden="true" />}
            disabled={busy || !diagnostics?.supported}
            onClick={() => void checkForUpdate()}
          />
          <ActionButton
            label="Clear this cache"
            icon={<Trash2 size={12} aria-hidden="true" />}
            disabled={busy}
            onClick={() => void clearCache()}
          />
          <ActionButton
            label="Activate update"
            icon={<CheckCircle2 size={12} aria-hidden="true" />}
            disabled={busy || !diagnostics?.updateWaiting}
            onClick={() => void activateUpdate()}
          />
        </div>

        <p className="min-h-4 text-[9px] leading-4 text-slate-400" role="status" aria-live="polite">
          {busy ? message : diagnostics?.updateWaiting ? 'A newer build is waiting.' : message}
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
