import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Bookmark,
  BookOpen,
  CloudRain,
  Crown,
  Bot,
  ScrollText,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ChronicleState } from '../../chronicle/engine';
import { HISTORY_NOTES } from '../../chronicle/history';
import { markLabel, recordEntries } from '../../chronicle/record';
import { QUIZ_QUESTIONS } from '../../chronicle/quiz';
import { chronicleStream } from '../../chronicle/rng';
import type { Actor, NoticeKind } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import { BUTTON, BUTTON_PRIMARY, Section } from './shared';

const ACTOR_LABEL: Record<Actor, string> = {
  player: 'you',
  'ai-partner': 'the AI partner',
  chronicle: 'lapsed',
};

const NOTICE_ICON: Record<NoticeKind, LucideIcon> = {
  history: BookOpen,
  event: ScrollText,
  forecast: CloudRain,
  trial: Trophy,
  era: Crown,
  ledger: Wallet,
  initiative: Bot,
};

function Article({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-2 text-xs leading-5 text-slate-200">
      {markdown
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) =>
          block.startsWith('## ') ? (
            <h5 key={index} className="font-semibold text-white">
              {block.slice(3)}
            </h5>
          ) : (
            <p key={index}>{block}</p>
          )
        )}
    </div>
  );
}

export function NotesTab({ state }: { state: ChronicleState }) {
  const readNote = useChronicleStore((s) => s.readNote);
  const markRead = useKnowledgeStore((s) => s.markAsRead);
  const [open, setOpen] = useState<string | null>(null);
  const notes = HISTORY_NOTES.filter((note) => state.unlockedNotes.includes(note.id));
  const record = recordEntries(state);
  return (
    <div className="space-y-3">
      {record.length > 0 && (
        <Section title="The record">
          <ul className="space-y-1 text-xs">
            {record.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2">
                <Bookmark
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300"
                  aria-hidden="true"
                />
                <span className="text-white">
                  Shift {entry.shift}: {markLabel(entry.id)}
                  <span className="text-slate-300"> · {ACTOR_LABEL[entry.actor]}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Notices">
        {state.notices.length === 0 ? (
          <p className="text-xs text-slate-300">None yet</p>
        ) : (
          <ol className="space-y-2">
            {[...state.notices].reverse().map((entry) => {
              const Icon = NOTICE_ICON[entry.kind];
              return (
                <li key={entry.id} className="flex gap-2 text-xs">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                  <div>
                    <div className="text-white">
                      <span className="text-slate-400">Shift {entry.shift} · </span>
                      {entry.title}
                    </div>
                    <div className="text-slate-300">{entry.body}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section title={`Lineage notes ${notes.length} / ${HISTORY_NOTES.length}`}>
        {notes.map((note) => (
          <details
            key={note.id}
            open={open === note.id}
            onToggle={(event) => {
              if ((event.target as HTMLDetailsElement).open) {
                setOpen(note.id);
                readNote(note.id);
                markRead(note.id);
              }
            }}
            className="rounded-lg border border-slate-700 px-2"
          >
            <summary className="min-h-11 cursor-pointer py-3 text-sm text-white">
              {note.title}
              {!state.readNotes.includes(note.id) && (
                <span className="ml-2 text-[11px] text-cyan-300">new</span>
              )}
            </summary>
            <div className="pb-3">
              <Article markdown={note.article} />
            </div>
          </details>
        ))}
      </Section>

      <QuizSection state={state} />
    </div>
  );
}

function QuizSection({ state }: { state: ChronicleState }) {
  const quiz = useChronicleStore((s) => s.quiz);
  const actions = useChronicleStore(
    useShallow((s) => ({
      start: s.startQuiz,
      pick: s.pickQuizAnswer,
      next: s.nextQuizQuestion,
    }))
  );
  const [round, setRound] = useState(0);
  const pool = useMemo(
    () => QUIZ_QUESTIONS.filter((q) => state.unlockedNotes.includes(q.noteId)),
    [state.unlockedNotes]
  );
  const best = state.quizBest === null ? '' : `, best ${state.quizBest}`;

  if (pool.length < 4)
    return (
      <Section title="Quiz">
        <p className="text-xs text-slate-300">Unlock {4 - pool.length} more questions</p>
      </Section>
    );

  const begin = () => {
    // The round's questions are fixed when it starts, so a note unlocking
    // mid-round never reshuffles them.
    const next = chronicleStream(state.charter?.seed ?? 1, 'quiz', round);
    setRound((r) => r + 1);
    actions.start(
      [...pool]
        .map((question) => ({ question, key: next() }))
        .sort((a, b) => a.key - b.key)
        .slice(0, 10)
        .map((entry) => entry.question.id)
    );
  };

  const question =
    quiz && !quiz.finished
      ? QUIZ_QUESTIONS.find((q) => q.id === quiz.questionIds[quiz.index])
      : undefined;
  if (!quiz || quiz.finished || !question)
    return (
      <Section title={`Quiz${best}`}>
        {quiz?.finished && (
          <p className="text-white">
            {quiz.score} / {quiz.questionIds.length} sacks
          </p>
        )}
        <button className={BUTTON_PRIMARY} onClick={begin}>
          {quiz?.finished ? 'Another round' : 'Start the quiz'}
        </button>
      </Section>
    );

  const picked = quiz.picked;
  const last = quiz.index + 1 >= quiz.questionIds.length;
  return (
    <Section title={`Question ${quiz.index + 1} / ${quiz.questionIds.length}`}>
      <p className="text-white">{question.prompt}</p>
      <div className="grid gap-2">
        {question.options.map((option, optionIndex) => {
          const chosen = picked === optionIndex;
          const correct = optionIndex === question.correctIndex;
          return (
            <button
              key={optionIndex}
              disabled={picked !== null}
              onClick={() => actions.pick(optionIndex, correct)}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs ${
                picked === null
                  ? 'border-slate-700 hover:border-slate-500'
                  : correct
                    ? 'border-emerald-400 text-emerald-200'
                    : chosen
                      ? 'border-rose-400 text-rose-200'
                      : 'border-slate-800 opacity-60'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <button className={BUTTON} onClick={actions.next}>
          {last ? 'See the result' : 'Next question'}
        </button>
      )}
    </Section>
  );
}
