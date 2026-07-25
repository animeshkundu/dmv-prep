import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CardState, Grade, Question, Sign } from '../lib/types';
import { newCard, reviewCard } from '../lib/fsrs';
import { getCards, setCards } from '../lib/storage';
import '../styles/study.css';

type Item = { id: string; prompt: string; answer: string; kind: string };

const grades: { value: Grade; label: string; hint: string }[] = [
  { value: 'again', label: 'Again', hint: 'Did not know it' },
  { value: 'hard', label: 'Hard', hint: 'Needed effort' },
  { value: 'good', label: 'Good', hint: 'Got it' },
  { value: 'easy', label: 'Easy', hint: 'Instant recall' },
];

export default function Flashcards({ questions, signs }: { questions: Question[]; signs: Sign[] }) {
  const items = useMemo<Item[]>(
    () => [
      ...questions.map((question) => ({
        id: `q:${question.id}`,
        prompt: question.prompt,
        answer: question.options[question.correctIndex] ?? question.explanation,
        kind: question.category.replaceAll('-', ' '),
      })),
      ...signs.map((sign) => ({
        id: `s:${sign.id}`,
        prompt: `What does the ${sign.name} sign mean?`,
        answer: sign.meaning,
        kind: 'road sign',
      })),
    ],
    [questions, signs],
  );
  const [cards, updateCards] = useState<Record<string, CardState>>({});
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    getCards().then((saved) => {
      updateCards(saved);
      setLoaded(true);
    });
  }, []);

  const now = new Date();
  const due = items.filter((item) => !cards[item.id] || new Date(cards[item.id]!.due) <= now);
  const item = due[0];

  async function grade(value: Grade) {
    if (!item) return;
    const card = cards[item.id] ?? newCard(item.id, now);
    const next = { ...cards, [item.id]: reviewCard(card, value, now) };
    updateCards(next);
    await setCards(next);
    setRevealed(false);
  }

  if (!loaded) return <section class="study-card card"><p class="muted">Loading your card schedule…</p></section>;

  if (!item) {
    return (
      <section class="study-card card">
        <div class="score-ring"><span><strong>Done</strong><br />for today</span></div>
        <h2>You are caught up.</h2>
        <p class="muted">The next cards will appear when they are due. A little spacing makes recall stronger.</p>
      </section>
    );
  }

  return (
    <section class="study-card card" aria-label="Smart flashcard">
      <div class="study-meta">
        <span class="badge">{item.kind}</span>
        <strong>{due.length} due today</strong>
      </div>
      <div class="flashcard-face">
        {revealed
          ? <div><p class="eyebrow">Answer</p><h2>{item.answer}</h2></div>
          : <h2>{item.prompt}</h2>}
      </div>
      {revealed ? (
        <>
          <p class="muted">How easily did you recall it?</p>
          <div class="grade-grid">
            {grades.map((gradeOption) => (
              <button class="btn btn-ghost" onClick={() => void grade(gradeOption.value)}>
                <span><strong>{gradeOption.label}</strong><small>{gradeOption.hint}</small></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button class="btn btn-primary" onClick={() => setRevealed(true)}>Reveal answer</button>
      )}
    </section>
  );
}
