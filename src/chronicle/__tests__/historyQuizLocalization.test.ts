import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { getHistoryNote, getHistoryNotes, HISTORY_NOTES } from '../history';
import { getQuizQuestions, QUIZ_QUESTIONS } from '../quiz';

const canonicalHistory = structuredClone(HISTORY_NOTES);
const canonicalQuiz = structuredClone(QUIZ_QUESTIONS);
const links = (text: string) => text.match(/https?:\/\/[^\s)]+/g) ?? [];

// The answer's distinguishing fact must also be stated in the translated note.
// One pair per note, in the canonical question order. This checks the entire pool.
const answerFacts: Record<string, [string, string]> = {
  'history-first-grain': ['emmer', 'pedra'],
  'history-grinding-statues': ['calcário pintado', 'produção de alimentos'],
  'history-old-kingdom-bakeries': ['muro do corvo', 'formas cônicas de cerâmica'],
  'history-nilometer': ['imposto', 'fronteira sul'],
  'history-nomarchs': ['província', 'hereditários'],
  'history-domesday-mills': ['1086', 'água'],
  'history-watermills': ['dezesseis', 'roda horizontal maior'],
  'history-windmills': ['poste vertical', 'haste traseira'],
  'history-millwrights': ['bridgewater canal', 'engenheiro civil'],
  'history-oliver-evans': [
    'esfriar e secar antes da peneiração',
    'the young mill-wright and miller’s guide',
  ],
  'history-albion-mills': ['boulton e watt', '1791'],
  'history-roller-milling': ['budapest', 'ferro fundido coquilhado'],
  'history-plansifter': ['carl haggenmacher', 'plano horizontal'],
  'history-washburn-a': ['poeira de farinha', 'coletores de pó'],
  'history-grain-elevator': ['buffalo', 'transportador de canecas'],
  'history-falling-number': ['danos por germinação', 'alfa-amilase'],
  'history-grain-moisture': ['mais macio', 'mofo e ácaros'],
  'history-grain-drying': ['debulha em uma', 'feixes'],
  'history-wet-harvest-1879': ['navios a vapor', '1873'],
  'history-assize-of-bread': ['mais leve', 'a baker’s dozen'],
  'history-sale-of-food-act': ['mais branco', 'analistas'],
  'history-chorleywood': ['mistura mecânica intensa', 'menor teor de proteína'],
  'history-bread-rationing': ['depois', '1946'],
  'history-three-day-week': ['três', 'mineiros de carvão e ferroviários'],
  'history-tide-mills': ['maré externa', 'último moinho de maré'],
  'history-rochdale': ['toad lane', 'dividendo proporcional'],
  'history-mondragon': ['ulgor', 'caja laboral popular'],
  'history-mill-electrification': ['correias', 'eixos'],
  'history-scada': ['supervisory control and data acquisition', 'unidades terminais remotas'],
  'history-flour-sacks': ['roupas', 'sacos de papel'],
  'history-ergot': ['centeio', 'fogo de santo antão'],
  'history-corn-laws': ['oitenta xelins por quarter', 'sir robert peel'],
  'history-long-view': ['mó de vaivém', 'secos e limpos'],
};

afterEach(() => setLocale('en'));

describe('authored Chronicle history and quiz localization', () => {
  it('keeps every English row identical to the canonical corpus', () => {
    setLocale('en');
    expect(getHistoryNotes()).toEqual(canonicalHistory);
    expect(getHistoryNote(HISTORY_NOTES[0].id)).toEqual(HISTORY_NOTES[0]);
    expect(getHistoryNote('missing-note')).toBeUndefined();
    expect(getQuizQuestions()).toEqual(canonicalQuiz);
  });

  it('localizes the whole corpus without changing IDs, order, triggers, answers or links', () => {
    setLocale('pt-BR');
    const notes = getHistoryNotes();
    const questions = getQuizQuestions();
    expect(notes).toHaveLength(33);
    expect(questions).toHaveLength(66);
    expect(notes.map((note) => note.id)).toEqual(HISTORY_NOTES.map((note) => note.id));
    expect(questions.map((question) => question.id)).toEqual(
      QUIZ_QUESTIONS.map((question) => question.id)
    );
    notes.forEach((note, index) => {
      const original = HISTORY_NOTES[index];
      expect(note.brief, note.id).not.toBe(original.brief);
      expect(note.article, note.id).not.toBe(original.article);
      if (note.id !== 'history-mondragon') expect(note.title, note.id).not.toBe(original.title);
      const { title: _title, brief: _brief, article: _article, ...metadata } = note;
      const { title: _enTitle, brief: _enBrief, article: _enArticle, ...enMetadata } = original;
      expect(metadata).toEqual(enMetadata);
      expect(links(note.article)).toEqual(links(original.article));
    });
    questions.forEach((question, index) => {
      const original = QUIZ_QUESTIONS[index];
      expect(question.prompt, question.id).not.toBe(original.prompt);
      expect(question.options).toHaveLength(4);
      expect(question.options.every((option) => option.trim().length > 0)).toBe(true);
      expect(question.noteId).toBe(original.noteId);
      expect(question.correctIndex).toBe(original.correctIndex);
    });
    expect(HISTORY_NOTES).toEqual(canonicalHistory);
    expect(QUIZ_QUESTIONS).toEqual(canonicalQuiz);
  });

  it('keeps the correct Portuguese option consistent with its note for all 66 questions', () => {
    setLocale('pt-BR');
    const notes = new Map(getHistoryNotes().map((note) => [note.id, note]));
    const questions = getQuizQuestions();
    expect(Object.keys(answerFacts)).toEqual(HISTORY_NOTES.map((note) => note.id));
    for (const note of HISTORY_NOTES) {
      const pair = questions.filter((question) => question.noteId === note.id);
      expect(pair, note.id).toHaveLength(2);
      pair.forEach((question, index) => {
        const fact = answerFacts[note.id][index];
        expect(question.options[question.correctIndex].toLowerCase(), question.id).toContain(fact);
        // The note names the garments instead of using the umbrella word roupas.
        const noteFact = question.id === 'q-flour-sacks-1' ? 'vestidos, camisas, aventais' : fact;
        expect(notes.get(note.id)?.article.toLowerCase(), question.id).toContain(noteFact);
      });
    }
  });

  it('resolves at read time and leaves earlier snapshots in their original language', () => {
    setLocale('en');
    const english = getHistoryNotes();
    const englishQuiz = getQuizQuestions();
    setLocale('pt-BR');
    const portuguese = getHistoryNotes();
    const portugueseQuiz = getQuizQuestions();
    expect(portuguese[0].title).toBe('Os primeiros grãos');
    expect(getHistoryNote(portuguese[0].id)).toEqual(portuguese[0]);
    expect(portugueseQuiz[0].options[1]).toBe('Emmer e cevada');
    expect(english).toEqual(canonicalHistory);
    expect(englishQuiz).toEqual(canonicalQuiz);
    setLocale('en');
    expect(getHistoryNotes()).toEqual(canonicalHistory);
    expect(getQuizQuestions()).toEqual(canonicalQuiz);
    expect(portuguese[0].title).toBe('Os primeiros grãos');
    expect(portugueseQuiz[0].options[1]).toBe('Emmer e cevada');
  });
});
