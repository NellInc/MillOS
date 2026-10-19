import { KNOWLEDGE_ENTRIES } from '../../stores/knowledgeStore';
import { useT } from '../../i18n';
import { learningNoteMessages } from './LearningNote.messages';

/** Contextual, quiet teaching. The process remains authoritative and uninterrupted. */
export function LearningNote({ entryId }: { entryId: string }) {
  const t = useT(learningNoteMessages);
  const entry = KNOWLEDGE_ENTRIES.find(
    (item) => item.id === entryId && item.audience !== 'developer'
  );
  if (!entry) return null;
  return (
    <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-cyan-200">
        {t('whyItMatters', { title: entry.title })}
      </summary>
      <p className="mt-1 leading-5">{entry.brief}</p>
      <p className="mt-2 leading-5 text-slate-400">
        {t('seeItIn', { places: entry.seeInAction.join(', ') })}
      </p>
    </details>
  );
}
