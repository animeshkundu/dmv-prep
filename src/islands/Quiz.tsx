import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Question } from '../lib/types';
import { buildPracticeSet } from '../lib/quiz-engine';
import { event } from '../lib/analytics';
import { getProgress, setProgress } from '../lib/storage';
import { recordAttempt } from '../lib/progress';
import '../styles/study.css';

type CategoryChoice = Question['category'] | 'all';

const categoryLabel = (category: string) => category.replaceAll('-', ' ');

export default function Quiz({
  questions,
  category,
}: {
  questions: Question[];
  category?: Question['category'];
}) {
  const categories = useMemo(
    () => [...new Set(questions.map((question) => question.category))].sort(),
    [questions],
  );
  const [activeCategory, setActiveCategory] = useState<CategoryChoice>(category ?? 'all');
  const [challengeQuestions, setChallengeQuestions] = useState<Question[]>();
  const [seed, setSeed] = useState(1);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<number>();
  const [submitted, setSubmitted] = useState(false);
  const [missed, setMissed] = useState<Question[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const source = challengeQuestions ?? questions;
  const set = useMemo(
    () =>
      buildPracticeSet(source, {
        category: challengeQuestions || activeCategory === 'all' ? undefined : activeCategory,
        count: 10,
        seed,
      }),
    [source, challengeQuestions, activeCategory, seed],
  );
  const question = set[index];

  useEffect(() => {
    event('quiz_start', {
      category: challengeQuestions ? 'challenge-bank' : activeCategory,
    });
  }, [activeCategory, challengeQuestions, seed]);

  useEffect(() => {
    const onKey = (keyboard: KeyboardEvent) => {
      if (!question) return;
      if (/^[1-4]$/.test(keyboard.key)) setAnswer(Number(keyboard.key) - 1);
      if (keyboard.key === 'ArrowDown' || keyboard.key === 'ArrowRight') {
        setAnswer((answer ?? -1) + 1 >= question.options.length ? 0 : (answer ?? -1) + 1);
      }
      if (keyboard.key === 'ArrowUp' || keyboard.key === 'ArrowLeft') {
        setAnswer((answer ?? 0) - 1 < 0 ? question.options.length - 1 : (answer ?? 0) - 1);
      }
      if (keyboard.key === 'Enter') {
        if (submitted) next();
        else void submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function resetSession(nextCategory: CategoryChoice) {
    setActiveCategory(nextCategory);
    setChallengeQuestions(undefined);
    setSeed((value) => value + 1);
    setIndex(0);
    setAnswer(undefined);
    setSubmitted(false);
    setMissed([]);
    setCorrectCount(0);
  }

  function startChallengeBank() {
    setChallengeQuestions(missed);
    setSeed((value) => value + 1);
    setIndex(0);
    setAnswer(undefined);
    setSubmitted(false);
    setMissed([]);
    setCorrectCount(0);
  }

  if (!question) {
    const percent = set.length ? Math.round((correctCount / set.length) * 100) : 0;
    return (
      <section class="study-card card" aria-label="Practice results">
        <div class="score-ring">
          <span><strong>{percent}%</strong><br />correct</span>
        </div>
        <div>
          <p class="eyebrow">{challengeQuestions ? 'Challenge bank complete' : 'Practice complete'}</p>
          <h2>{missed.length ? 'Turn misses into wins.' : 'Clean run. Nice work.'}</h2>
          <p class="muted">You answered {correctCount} of {set.length} questions correctly.</p>
        </div>
        <div class="study-actions">
          {missed.length > 0 && (
            <button class="btn btn-pop" onClick={startChallengeBank}>
              Retry {missed.length} missed {missed.length === 1 ? 'question' : 'questions'}
            </button>
          )}
          <button class="btn btn-ghost" onClick={() => resetSession(activeCategory)}>
            New practice set
          </button>
        </div>
      </section>
    );
  }

  const correct = answer === question.correctIndex;

  async function submit() {
    if (answer === undefined || submitted) return;
    setSubmitted(true);
    if (correct) setCorrectCount((value) => value + 1);
    else setMissed((items) => [...items, question]);
    const progress = await getProgress();
    await setProgress(recordAttempt(progress, question, correct));
  }

  function next() {
    if (!submitted) return;
    setAnswer(undefined);
    setSubmitted(false);
    setIndex((value) => value + 1);
  }

  const citation = question.references[0];
  return (
    <>
      {!challengeQuestions && (
        <div class="study-toolbar">
          <label for="practice-category">Focus your practice</label>
          <select
            id="practice-category"
            class="form-control"
            value={activeCategory}
            onChange={(changeEvent) => resetSession(changeEvent.currentTarget.value as CategoryChoice)}
          >
            <option value="all">All available topics</option>
            {categories.map((item) => <option value={item}>{categoryLabel(item)}</option>)}
          </select>
        </div>
      )}
      {challengeQuestions && <p class="badge">Challenge bank · missed questions only</p>}
      <section class="study-card card" aria-label="Practice quiz">
        <div class="study-meta">
          <p class="muted">
            Question {index + 1} of {set.length} · {categoryLabel(question.category)}
          </p>
          <strong>{correctCount} correct</strong>
        </div>
        <progress class="study-progress" value={index + 1} max={set.length}>
          {index + 1} of {set.length}
        </progress>
        <fieldset class="study-options">
          <legend><h2>{question.prompt}</h2></legend>
          {question.options.map((option, optionIndex) => {
            const isCorrectOption = submitted && optionIndex === question.correctIndex;
            const isIncorrectChoice = submitted && optionIndex === answer && !correct;
            const status = isCorrectOption ? 'Correct answer' : isIncorrectChoice ? 'Your answer' : '';
            return (
              <label class={`study-option ${isCorrectOption ? 'correct' : ''} ${isIncorrectChoice ? 'incorrect' : ''}`}>
                <input
                  type="radio"
                  name="answer"
                  checked={answer === optionIndex}
                  disabled={submitted}
                  onChange={() => setAnswer(optionIndex)}
                />
                <span><strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}</span>
                {status && <span class="option-status">{status}</span>}
              </label>
            );
          })}
        </fieldset>
        <div aria-live="polite">
          {submitted && (
            <div class={`study-feedback ${correct ? 'pass' : 'fail'}`}>
              <strong>{correct ? 'Correct.' : 'Not quite.'}</strong> {question.explanation}
              <p>
                <small>
                  Source: {citation?.url
                    ? <a href={citation.url}>{citation.citation}</a>
                    : citation?.citation}
                </small>
              </p>
            </div>
          )}
        </div>
        <div class="study-actions">
          {submitted
            ? <button class="btn btn-primary" onClick={next}>Next question <span aria-hidden="true">→</span></button>
            : <button class="btn btn-primary" disabled={answer === undefined} onClick={() => void submit()}>Check answer</button>}
          <span class="muted">Keyboard: 1-4 to choose, Enter to continue</span>
        </div>
      </section>
    </>
  );
}
