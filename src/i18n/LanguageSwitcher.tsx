import { Languages } from 'lucide-react';
import { LOCALES, LOCALE_LABELS, defineMessages, useLocale, useT, setLocale } from './index';

const messages = defineMessages({
  en: { language: 'Language' },
  'pt-BR': { language: 'Idioma' },
});

/** Two-button language choice; each label is written in its own language. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useT(messages);
  return (
    <div
      role="group"
      aria-label={t('language')}
      className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}
    >
      <Languages className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
          className={`min-h-9 rounded-md border px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
            locale === option
              ? 'border-cyan-400/70 bg-cyan-500/15 text-white'
              : 'border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
          }`}
        >
          {compact ? (option === 'en' ? 'EN' : 'PT-BR') : LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitcher;
