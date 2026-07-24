import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CardState, Grade, Question, Sign } from '../lib/types';
import { newCard, reviewCard } from '../lib/fsrs';
import { getCards, setCards } from '../lib/storage';
import '../styles/study.css';

type Item = { id: string; prompt: string; answer: string };
export default function Flashcards({ questions, signs }: { questions: Question[]; signs: Sign[] }) {
  const items = useMemo<Item[]>(() => [...questions.map((q) => ({ id: `q:${q.id}`, prompt: q.prompt, answer: q.options[q.correctIndex] ?? q.explanation })), ...signs.map((s) => ({ id: `s:${s.id}`, prompt: `What does the ${s.name} sign mean?`, answer: s.meaning }))], [questions, signs]);
  const [cards, updateCards] = useState<Record<string, CardState>>({});
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { getCards().then((saved) => { updateCards(saved); setLoaded(true); }); }, []);
  const now = new Date();
  const due = items.filter((item) => !cards[item.id] || new Date(cards[item.id]!.due) <= now);
  const item = due[0];
  async function grade(value: Grade) {
    if (!item) return;
    const card = cards[item.id] ?? newCard(item.id, now);
    const next = { ...cards, [item.id]: reviewCard(card, value, now) };
    updateCards(next); await setCards(next); setRevealed(false);
  }
  if (!loaded) return <p>Loading cards…</p>;
  if (!item) return <section class="study-card card"><h2>You're done for today</h2><p>Your next cards will appear when they are due.</p></section>;
  return <section class="study-card card"><p class="badge">{due.length} due today</p><h2>{item.prompt}</h2>{revealed ? <><div class="study-feedback pass"><strong>Answer</strong><p>{item.answer}</p></div><div class="study-actions">{(['again','hard','good','easy'] as Grade[]).map((value) => <button class="btn btn-ghost" onClick={() => grade(value)}>{value[0]?.toUpperCase()}{value.slice(1)}</button>)}</div></> : <button class="btn btn-primary" onClick={() => setRevealed(true)}>Reveal answer</button>}</section>;
}
