import { useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';
import {
  advisoryProviders,
  isAdvisoryKeyValid,
  JEV_MAX_TEXT_LENGTH,
  JEV_RESULT_TTL_MS,
  requestJevAdvice,
  type AdvisoryProvider,
  type JevAdvice,
} from '../../utils/jevClient';
import { formatFixed, translate, useT } from '../../i18n';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { DEFAULT_WEBGPU_MODEL_LABEL } from '../../utils/webgpuClient';
import { jevAdvisoryPanelMessages } from './JevAdvisoryPanel.messages';

export function JevAdvisoryPanel({ latestAlert }: { latestAlert?: string }) {
  const t = useT(jevAdvisoryPanelMessages);
  const localReady = useAIConfigStore((state) => state.webgpuModelReady);
  const providers = advisoryProviders(localReady);
  const [chosen, setProvider] = useState<AdvisoryProvider>('jev');
  // The on-device option leaves when its model unloads; fall back to Jev.
  const provider = providers.includes(chosen) ? chosen : 'jev';
  const local = provider === 'local';
  // Per-provider copy: Jev keeps the original keys; others add a suffix.
  const suffix =
    provider === 'openai'
      ? 'OpenAI'
      : provider === 'haiku'
        ? 'Anthropic'
        : provider === 'local'
          ? 'Local'
          : '';
  const copy = (base: 'title' | 'apiKeyLabel' | 'consent' | 'send') =>
    t(`${base}${suffix}` as Parameters<typeof t>[0]);
  // Nothing leaves the device for the on-device model: no key, no consent.
  const ready = (consented: boolean, key: string) =>
    local || (consented && isAdvisoryKeyValid(provider, key));
  const [apiKey, setApiKey] = useState('');
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<JevAdvice | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setPending(false);
    setResult(null);
    setError('');
  }
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    []
  );
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(
      () => setResult(null),
      Math.max(0, result.receivedAt + JEV_RESULT_TTL_MS - Date.now())
    );
    return () => clearTimeout(timer);
  }, [result]);

  async function send() {
    if (request.current || !ready(consent, apiKey) || !text.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setResult(null);
    setError('');
    try {
      const advice = await requestJevAdvice({
        text,
        apiKey,
        consent,
        signal: controller.signal,
        provider,
      });
      if (request.current === controller) setResult(advice);
    } catch (failure) {
      if (request.current === controller)
        setError(
          failure instanceof Error
            ? failure.message
            : translate(jevAdvisoryPanelMessages, 'noAdvisory')
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }
  const fieldClass =
    'w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';
  const buttonClass =
    'min-h-9 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section aria-label={t('regionLabel')} className="space-y-4 text-xs text-slate-300">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
          <Shield className="h-4 w-4" aria-hidden="true" />
          {copy('title')}
        </h3>
        <p>{t('intro')}</p>
      </div>
      {providers.length > 1 && (
        <div
          role="radiogroup"
          aria-label={t('providerLabel')}
          className={`grid gap-2 ${providers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          {providers.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={provider === option}
              className={`min-h-9 rounded-lg border px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                provider === option
                  ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                  : 'border-slate-600 text-slate-300 hover:bg-slate-700'
              }`}
              onClick={() => {
                if (option === provider) return;
                // A key belongs to one provider: switching forgets it and the consent.
                cancel();
                setProvider(option);
                setApiKey('');
                setConsent(false);
              }}
            >
              {option === 'openai'
                ? t('providerOpenAI')
                : option === 'haiku'
                  ? t('providerAnthropic')
                  : option === 'local'
                    ? t('providerLocal', { model: DEFAULT_WEBGPU_MODEL_LABEL })
                    : t('providerJev')}
            </button>
          ))}
        </div>
      )}
      {!local && (
        <div className="space-y-2">
          <label htmlFor="jev-api-key" className="block font-medium">
            {copy('apiKeyLabel')}
          </label>
          <input
            id="jev-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            maxLength={260}
            value={apiKey}
            className={fieldClass}
            aria-describedby="jev-key-help"
            onChange={(event) => {
              cancel();
              setApiKey(event.target.value);
              setConsent(false);
            }}
          />
          <p id="jev-key-help" className="text-slate-400">
            {t('apiKeyHelp')}
          </p>
          {apiKey && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                cancel();
                setApiKey('');
                setConsent(false);
              }}
            >
              {t('forgetKey')}
            </button>
          )}
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="jev-incident" className="block font-medium">
          {t('incidentLabel')}
        </label>
        <textarea
          id="jev-incident"
          rows={5}
          maxLength={JEV_MAX_TEXT_LENGTH}
          value={text}
          className={fieldClass}
          onChange={(event) => {
            cancel();
            setText(event.target.value);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-400">
            {t('characterCount', {
              count: formatFixed(text.length, 0),
              max: formatFixed(JEV_MAX_TEXT_LENGTH, 0),
            })}
          </span>
          {latestAlert && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                cancel();
                setText(latestAlert.slice(0, JEV_MAX_TEXT_LENGTH));
                setConsent(false);
              }}
            >
              {t('reviewLatestAlert')}
            </button>
          )}
        </div>
      </div>
      {!local && (
        <label className="flex items-start gap-2 leading-relaxed">
          <input
            type="checkbox"
            checked={consent}
            className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
            onChange={(event) => {
              cancel();
              setConsent(event.target.checked);
            }}
          />
          <span>{copy('consent')}</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${buttonClass} border-cyan-500/50 bg-cyan-500/10 text-cyan-300`}
          disabled={pending || !ready(consent, apiKey) || !text.trim()}
          onClick={() => void send()}
        >
          {pending ? t('requesting') : copy('send')}
        </button>
        {pending && (
          <button type="button" className={buttonClass} onClick={cancel}>
            {t('cancelRequest')}
          </button>
        )}
      </div>
      {!local && <p className="text-slate-400">{t('sendNote')}</p>}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200"
        >
          {error}
        </p>
      )}
      <div role="status" aria-live="polite">
        {result && (
          <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-slate-800/70 p-3">
            <p className="text-slate-400">{t('resultHeading')}</p>
            <p className="text-sm font-semibold text-slate-100">{result.queue}</p>
            <p>{t('resultCaveat')}</p>
            <p className="text-slate-400">{t('resultExpiry')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
