import { useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';
import {
  isJevKeyValid,
  JEV_MAX_TEXT_LENGTH,
  JEV_RESULT_TTL_MS,
  requestJevAdvice,
  type JevAdvice,
} from '../../utils/jevClient';

export function JevAdvisoryPanel({ latestAlert }: { latestAlert?: string }) {
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
    if (request.current || !consent || !isJevKeyValid(apiKey) || !text.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setResult(null);
    setError('');
    try {
      const advice = await requestJevAdvice({ text, apiKey, consent, signal: controller.signal });
      if (request.current === controller) setResult(advice);
    } catch (failure) {
      if (request.current === controller)
        setError(failure instanceof Error ? failure.message : 'No advisory was returned.');
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
    <section aria-label="Jev advisory" className="space-y-4 text-xs text-slate-300">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
          <Shield className="h-4 w-4" aria-hidden="true" />
          Jev incident routing
        </h3>
        <p>
          Get a suggested queue for incident text. Alerts, machine controls and your selected AI
          backend stay unchanged.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="jev-api-key" className="block font-medium">
          Your OpenRouter API key
        </label>
        <input
          id="jev-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={180}
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
          Kept in memory only while this Advisory view is open. Never saved to browser storage.
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
            Forget key
          </button>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="jev-incident" className="block font-medium">
          Incident text
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
            {text.length}/{JEV_MAX_TEXT_LENGTH} characters
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
              Review latest alert
            </button>
          )}
        </div>
      </div>
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
        <span>
          Allow the text above to be sent to OpenRouter and TypeSafe when I select Send to Jev.
          Requests use my OpenRouter balance.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${buttonClass} border-cyan-500/50 bg-cyan-500/10 text-cyan-300`}
          disabled={pending || !consent || !isJevKeyValid(apiKey) || !text.trim()}
          onClick={() => void send()}
        >
          {pending ? 'Requesting advice...' : 'Send to Jev'}
        </button>
        {pending && (
          <button type="button" className={buttonClass} onClick={cancel}>
            Cancel request
          </button>
        )}
      </div>
      <p className="text-slate-400">
        Only this text is sent. No automatic requests or retries. Cancellation may still be billed.
      </p>
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
            <p className="text-slate-400">Suggested queue for the submitted text</p>
            <p className="text-sm font-semibold text-slate-100">{result.queue}</p>
            <p>
              Review the underlying evidence. This suggestion cannot clear an incident or establish
              that the mill is safe.
            </p>
            <p className="text-slate-400">Expires after one minute or when the text changes.</p>
          </div>
        )}
      </div>
    </section>
  );
}
