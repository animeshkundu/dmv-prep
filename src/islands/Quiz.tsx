import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Question } from '../lib/types';
import { buildPracticeSet } from '../lib/quiz-engine';
import { event } from '../lib/analytics';
import { getProgress, setProgress } from '../lib/storage';
import { recordAttempt } from '../lib/progress';
import '../styles/study.css';

export default function Quiz({ questions, category }: { questions: Question[]; category?: Question['category'] }) {
  const [seed, setSeed] = useState(1);
  const [bank, setBank] = useState(questions);
  const set = useMemo(() => buildPracticeSet(bank, { category, count: 10, seed }), [bank, category, seed]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<number>();
  const [submitted, setSubmitted] = useState(false);
  const [missed, setMissed] = useState<Question[]>([]);
  const question = set[index];

  useEffect(() => { event('quiz_start', { category: category ?? 'all' }); }, [category, seed]);
  useEffect(() => {
    const onKey = (keyboard: KeyboardEvent) => {
      if (!question) return;
      if (/^[1-4]$/.test(keyboard.key)) setAnswer(Number(keyboard.key) - 1);
      if (keyboard.key === 'ArrowDown' || keyboard.key === 'ArrowRight') setAnswer((answer ?? -1) + 1 >= question.options.length ? 0 : (answer ?? -1) + 1);
      if (keyboard.key === 'ArrowUp' || keyboard.key === 'ArrowLeft') setAnswer((answer ?? 0) - 1 < 0 ? question.options.length - 1 : (answer ?? 0) - 1);
      if (keyboard.key === 'Enter') submitted ? next() : submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!question) return <section class="study-card card"><h2>Practice complete</h2><p>You answered {set.length} questions.</p>{missed.length > 0 && <button class="btn btn-primary" onClick={() => { setBank(missed); setSeed(seed + 1); setIndex(0); setMissed([]); }}>Retry missed</button>}</section>;
  const correct = answer === question.correctIndex;
  async function submit() {
    if (answer === undefined || submitted) return;
    setSubmitted(true);
    if (!correct) setMissed((items) => [...items, question]);
    const progress = await getProgress();
    await setProgress(recordAttempt(progress, question, correct));
  }
  function next() { if (!submitted) return; setAnswer(undefined); setSubmitted(false); setIndex(index + 1); }
  const citation = question.references[0];
  return <section class="study-card card" aria-label="Practice quiz">
    <progress class="study-progress" value={index + 1} max={set.length}>{index + 1} of {set.length}</progress>
    <p class="muted">Question {index + 1} of {set.length} · {question.category.replaceAll('-', ' ')}</p>
    <fieldset class="study-options"><legend><h2>{question.prompt}</h2></legend>
      {question.options.map((option, optionIndex) => <label class="study-option"><input type="radio" name="answer" checked={answer === optionIndex} disabled={submitted} onChange={() => setAnswer(optionIndex)} /><span><strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}</span></label>)}
    </fieldset>
    <div aria-live="polite">{submitted && <div class={`study-feedback ${correct ? 'pass' : 'fail'}`}><strong>{correct ? 'Correct.' : 'Not quite.'}</strong> {question.explanation}<p><small>Source: {citation?.citation}</small></p></div>}</div>
    <div class="study-actions">{submitted ? <button class="btn btn-primary" onClick={next}>Next question</button> : <button class="btn btn-primary" disabled={answer === undefined} onClick={submit}>Check answer</button>}</div>
  </section>;
}
