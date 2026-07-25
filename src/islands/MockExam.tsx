import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ExamVariant, MockResult, Question } from '../lib/types';
import { buildMockExam, scoreExam } from '../lib/quiz-engine';
import { event } from '../lib/analytics';
import { getProgress, setProgress } from '../lib/storage';
import { recordMock } from '../lib/progress';
import '../styles/study.css';

export default function MockExam({
  state,
  variants,
  questions,
}: {
  state: string;
  variants: ExamVariant[];
  questions: Question[];
}) {
  const [variantId, setVariantId] = useState(variants[0]?.variantId ?? 'default');
  const variant = variants.find((item) => item.variantId === variantId) ?? variants[0];
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [examRun, setExamRun] = useState(0);
  const exam = useMemo(
    () => (variant ? buildMockExam(state, variant, questions, `${variantId}:exam:${examRun}`) : []),
    [variant, questions, state, variantId, examRun],
  );
  const question = exam[index];

  useEffect(() => {
    if (!started || finished || !remaining) return;
    const timer = window.setInterval(
      () => setRemaining((value) => (value <= 1 ? 0 : value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [started, finished, remaining]);

  useEffect(() => {
    if (started && remaining === 0 && variant?.timeLimitMinutes) void finish();
  }, [remaining]);

  if (!variant) return <p>No exam variant is available yet.</p>;

  function start() {
    setExamRun((value) => value + 1);
    setStarted(true);
    setIndex(0);
    setAnswers({});
    setFinished(false);
    setRemaining((variant?.timeLimitMinutes ?? 0) * 60);
    event('quiz_start', { mode: 'mock', state });
  }

  if (!started) {
    const percent = Math.ceil((variant.numToPass / variant.numQuestions) * 100);
    return (
      <section class="study-card card">
        <div>
          <p class="eyebrow">Ready when you are</p>
          <h2>Start a mock exam</h2>
          <p class="muted">Find a quiet spot. Your answers are not checked until you submit.</p>
        </div>
        <label>
          <strong>Exam version</strong>
          <select
            class="form-control"
            value={variantId}
            onChange={(changeEvent) => setVariantId(changeEvent.currentTarget.value)}
          >
            {variants.map((item) => <option value={item.variantId}>{item.label}</option>)}
          </select>
        </label>
        <div class="metric-grid">
          <div class="metric card"><strong>{variant.numQuestions}</strong><span>questions</span></div>
          <div class="metric card"><strong>{variant.numToPass}</strong><span>correct to pass</span></div>
          <div class="metric card"><strong>{percent}%</strong><span>passing score</span></div>
        </div>
        {variant.timeLimitMinutes && <p class="badge">{variant.timeLimitMinutes} minute limit</p>}
        <button class="btn btn-primary" onClick={start}>Start mock exam <span aria-hidden="true">→</span></button>
      </section>
    );
  }

  const result = scoreExam(exam, answers, variant);

  async function finish() {
    if (finished) return;
    setFinished(true);
    const saved: MockResult = {
      id: `${state}-${variant.variantId}-${Date.now()}`,
      state,
      variantId: variant.variantId,
      correct: result.correct,
      total: result.total,
      passed: result.passed,
      completedAt: new Date().toISOString(),
      passThreshold: result.passThreshold,
    };
    await setProgress(recordMock(await getProgress(), saved));
    if (!result.passed) event('mock_fail', { state, variant: variant.variantId });
  }

  if (finished) {
    const missed = exam.filter((item) => answers[item.id] !== item.correctIndex);
    return (
      <section class="study-card card">
        <div class="score-ring">
          <span><strong>{result.correct}/{result.total}</strong><br />correct</span>
        </div>
        <div>
          <p class="eyebrow">Mock exam complete</p>
          <h2>{result.passed ? 'You passed this run.' : 'Close the gaps, then try again.'}</h2>
          <p class={`study-feedback ${result.passed ? 'pass' : 'fail'}`}>
            You needed {result.passThreshold} correct. You scored {result.correct}.
          </p>
        </div>
        {result.subRequirementResults.map((subRequirement) => (
          <p>
            {subRequirement.category.replaceAll('-', ' ')}: {subRequirement.correct} correct,
            {' '}{subRequirement.minCorrect} required.
          </p>
        ))}
        {missed.length > 0 && (
          <div class="review-list">
            <h3>Review {missed.length} missed {missed.length === 1 ? 'question' : 'questions'}</h3>
            {missed.map((item) => (
              <article>
                <strong>{item.prompt}</strong>
                <p>{item.explanation}</p>
              </article>
            ))}
          </div>
        )}
        <button class="btn btn-primary" onClick={start}>Take another mock</button>
      </section>
    );
  }

  return (
    <section class="study-card card">
      <div class="study-meta">
        <p class="muted">
          Question {index + 1} of {exam.length}
        </p>
        {variant.timeLimitMinutes && (
          <strong aria-label={`${Math.floor(remaining / 60)} minutes and ${remaining % 60} seconds left`}>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} left
          </strong>
        )}
      </div>
      <progress class="study-progress" value={index + 1} max={exam.length}>
        {index + 1} of {exam.length}
      </progress>
      <fieldset class="study-options">
        <legend><h2>{question?.prompt}</h2></legend>
        {question?.options.map((option, optionIndex) => (
          <label class="study-option">
            <input
              type="radio"
              name="mock-answer"
              checked={answers[question.id] === optionIndex}
              onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })}
            />
            <span><strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}</span>
          </label>
        ))}
      </fieldset>
      <div class="study-actions">
        <button class="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Previous
        </button>
        {index < exam.length - 1
          ? <button class="btn btn-primary" onClick={() => setIndex(index + 1)}>Next <span aria-hidden="true">→</span></button>
          : <button class="btn btn-pop" onClick={() => void finish()}>Finish and score exam</button>}
      </div>
      <p class="muted">{Object.keys(answers).length} of {exam.length} answered</p>
    </section>
  );
}
