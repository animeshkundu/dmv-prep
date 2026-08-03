import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CardState, ChallengeBank, Grade } from '../lib/types';
import type { ClientQuestion } from '../lib/questions';
import type { ClientSign } from '../lib/bank';
import { newCard, reviewCard } from '../lib/fsrs';
import { buildFlashcardQueue } from '../lib/flashcard-queue';
import { recordActivity } from '../lib/activity';
import { getCachedBank, putCachedBank } from '../lib/bank-cache';
import { getCards, getChallenge, getSettings, setCards } from '../lib/storage';
import { assetUrl } from '../lib/site';
import '../styles/study.css';

type Item = {
  id: string;
  prompt: string;
  answer: string;
  explanation?: string;
  citation?: string;
  kind: string;
  asset?: string;
  altText?: string;
};

const grades: { value: Grade; label: string; hint: string }[] = [
  { value: 'again', label: 'Again', hint: 'Did not know it' },
  { value: 'hard', label: 'Hard', hint: 'Needed effort' },
  { value: 'good', label: 'Good', hint: 'Got it' },
  { value: 'easy', label: 'Easy', hint: 'Instant recall' },
];

function normaliseBank(payload: unknown): ClientQuestion[] {
  const questions = Array.isArray(payload)
    ? payload
    : (payload as { questions?: unknown[] } | null)?.questions;
  return Array.isArray(questions) ? questions as ClientQuestion[] : [];
}

export default function Flashcards({
  seedQuestions,
  stateCode,
  bankUrl,
  bankVersion,
  signs,
  signUrl,
}: {
  seedQuestions: ClientQuestion[];
  stateCode: string;
  bankUrl?: string;
  bankVersion?: string;
  signs: ClientSign[];
  signUrl?: string;
}) {
  const [questions, setQuestions] = useState(seedQuestions);
  const [activeSigns, setActiveSigns] = useState(signs);
  const [cards, updateCards] = useState<Record<string, CardState>>({});
  const [challenge, setChallenge] = useState<ChallengeBank>({ items: {} });
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const settings = useMemo(() => getSettings(), []);

  useEffect(() => {
    void Promise.all([getCards(), getChallenge()]).then(([savedCards, savedChallenge]) => {
      updateCards(savedCards);
      setChallenge(savedChallenge);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!bankUrl) return;
    let cancelled = false;
    void (async () => {
      const cached = bankVersion ? await getCachedBank(stateCode, bankVersion) : undefined;
      if (!cancelled && cached?.length) setQuestions(cached as ClientQuestion[]);
      try {
        const response = await fetch(bankUrl);
        if (!response.ok) throw new Error(`Question bank request failed (${response.status}).`);
        const payload = await response.json() as { bankVersion?: string; questions?: unknown[] };
        if (bankVersion && payload.bankVersion !== bankVersion) throw new Error('Question bank version changed.');
        const next = normaliseBank(payload);
        if (!next.length) throw new Error('Question bank is empty.');
        if (cancelled) return;
        setQuestions(next);
        if (bankVersion) await putCachedBank(stateCode, bankVersion, next);
      } catch {
        // The visible starter seed or a versioned cache is an honest offline fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankUrl, bankVersion, stateCode]);

  useEffect(() => {
    if (!signUrl) return;
    let cancelled = false;
    void fetch(signUrl)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Sign bank request failed.')))
      .then((payload: { signs?: ClientSign[] }) => {
        if (!cancelled && Array.isArray(payload.signs)) setActiveSigns(payload.signs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signUrl]);

  const items = useMemo<Item[]>(
    () => [
      ...questions.map((question) => ({
        id: `q:${question.id}`,
        prompt: question.prompt,
        answer: question.options[question.correctIndex] ?? question.explanation,
        explanation: question.explanation,
        citation: question.references?.[0]?.citation,
        kind: question.category.replaceAll('-', ' '),
      })),
      ...activeSigns.map((sign) => ({
        id: `s:${sign.id}`,
        prompt: 'What does this road sign mean?',
        answer: sign.meaning,
        kind: 'road sign',
        asset: sign.asset,
        altText: sign.altText,
      })),
    ],
    [questions, activeSigns],
  );
  const queue = useMemo(
    () => buildFlashcardQueue(
      items.filter((item) => !reviewed.has(item.id)),
      cards,
      challenge,
      new Date(),
      settings.sessionSize ?? 20,
    ),
    [items, cards, challenge, reviewed, settings.sessionSize],
  );
  const item = queue[0];

  useEffect(() => {
    const onKey = (keyboard: KeyboardEvent) => {
      if (!item) return;
      if (keyboard.key === ' ' && !revealed) {
        keyboard.preventDefault();
        setRevealed(true);
        return;
      }
      const grade = grades[Number(keyboard.key) - 1]?.value;
      if (revealed && grade) {
        keyboard.preventDefault();
        void gradeCard(grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function gradeCard(value: Grade) {
    if (!item || !revealed) return;
    const now = new Date();
    const card = cards[item.id] ?? newCard(item.id, now);
    const next = {
      ...cards,
      [item.id]: reviewCard(card, value, now, settings.targetRetention),
    };
    updateCards(next);
    setReviewed((current) => new Set([...current, item.id]));
    await Promise.all([
      setCards(next),
      recordActivity({
        kind: 'card-graded',
        attemptId: `flashcard:${item.id}:${card.reps}:${now.getTime()}`,
        cardId: item.id,
        grade: value,
      }, now),
    ]);
    setRevealed(false);
  }

  if (!loaded) return <section class="study-card card"><p class="muted">Loading your card schedule…</p></section>;

  if (!item) {
    return (
      <section class="study-card card">
        <div class="score-ring"><span><strong>Done</strong><br />for this session</span></div>
        <h2>You are caught up.</h2>
        <p class="muted">The next cards appear when they are due. A little spacing makes recall stronger.</p>
      </section>
    );
  }

  return (
    <section class="study-card card" aria-label="Smart flashcard">
      <div class="study-meta">
        <span class="badge">{item.kind}</span>
        <strong>{queue.length} queued this session</strong>
      </div>
      <div class="flashcard-face">
        {!revealed && item.asset && (
          <img src={assetUrl(item.asset)} alt={item.altText ?? 'Road sign'} width="180" height="180" loading="lazy" />
        )}
        {revealed ? (
          <div>
            <p class="eyebrow">Answer</p>
            <h2>{item.answer}</h2>
            {item.explanation && <p>{item.explanation}</p>}
            {item.citation && <p class="muted">Source: {item.citation}</p>}
          </div>
        ) : <h2>{item.prompt}</h2>}
      </div>
      {revealed ? (
        <>
          <p class="muted">How easily did you recall it? Use keys 1–4 or choose a rating.</p>
          <div class="grade-grid">
            {grades.map((gradeOption, index) => (
              <button class="btn btn-ghost" onClick={() => void gradeCard(gradeOption.value)}>
                <span><strong>{index + 1}. {gradeOption.label}</strong><small>{gradeOption.hint}</small></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button class="btn btn-primary" onClick={() => setRevealed(true)}>Reveal answer <span aria-hidden="true">Space</span></button>
      )}
    </section>
  );
}
