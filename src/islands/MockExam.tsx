import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ExamVariant, MockResult, Question } from '../lib/types';
import { buildMockExam, scoreExam } from '../lib/quiz-engine';
import { event } from '../lib/analytics';
import { getProgress, setProgress } from '../lib/storage';
import { recordMock } from '../lib/progress';
import '../styles/study.css';

export default function MockExam({ state, variants, questions }: { state: string; variants: ExamVariant[]; questions: Question[] }) {
  const [variantId, setVariantId] = useState(variants[0]?.variantId ?? 'default');
  const variant = variants.find((item) => item.variantId === variantId) ?? variants[0];
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const exam = useMemo(() => variant ? buildMockExam(state, variant, questions, `${variantId}:exam`) : [], [variant, questions, state, variantId]);
  const question = exam[index];
  useEffect(() => {
    if (!started || finished || !remaining) return;
    const timer = window.setInterval(() => setRemaining((value) => value <= 1 ? 0 : value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [started, finished, remaining]);
  useEffect(() => { if (started && remaining === 0 && variant?.timeLimitMinutes) finish(); }, [remaining]);
  if (!variant) return <p>No exam variant is available yet.</p>;
  if (!started) return <section class="study-card card"><h2>Start a mock exam</h2><label>Exam version<select class="form-control" value={variantId} onChange={(e) => setVariantId(e.currentTarget.value)}>{variants.map((item) => <option value={item.variantId}>{item.label}</option>)}</select></label><p>{variant.numQuestions} questions · {variant.numToPass} correct to pass{variant.timeLimitMinutes ? ` · ${variant.timeLimitMinutes} minutes` : ''}</p><button class="btn btn-primary" onClick={() => { setStarted(true); setRemaining((variant.timeLimitMinutes ?? 0) * 60); event('quiz_start', { mode: 'mock', state }); }}>Start mock exam</button></section>;
  const result = scoreExam(exam, answers, variant);
  async function finish() {
    setFinished(true);
    const saved: MockResult = { id: `${state}-${variant.variantId}-${Date.now()}`, state, variantId: variant.variantId, correct: result.correct, total: result.total, passed: result.passed, completedAt: new Date().toISOString(), passThreshold: result.passThreshold };
    await setProgress(recordMock(await getProgress(), saved));
    if (!result.passed) event('mock_fail', { state, variant: variant.variantId });
  }
  if (finished) return <section class="study-card card"><h2>{result.passed ? 'You passed' : 'Keep practicing'}</h2><p class={`study-feedback ${result.passed ? 'pass' : 'fail'}`}>{result.correct} of {result.total} correct. You needed {result.passThreshold}.</p>{result.subRequirementResults.map((sub) => <p>{sub.category}: {sub.correct} correct, {sub.minCorrect} required.</p>)}<h3>Review missed questions</h3>{exam.filter((item) => answers[item.id] !== item.correctIndex).map((item) => <article><strong>{item.prompt}</strong><p>{item.explanation}</p></article>)}</section>;
  return <section class="study-card card"><div><progress class="study-progress" value={index + 1} max={exam.length}/><p class="muted">Question {index + 1} of {exam.length}{variant.timeLimitMinutes ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left` : ''}</p></div><fieldset class="study-options"><legend><h2>{question?.prompt}</h2></legend>{question?.options.map((option, optionIndex) => <label class="study-option"><input type="radio" name="mock-answer" checked={answers[question.id] === optionIndex} onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })}/><span><strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}</span></label>)}</fieldset><div class="study-actions"><button class="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>{index < exam.length - 1 ? <button class="btn btn-primary" onClick={() => setIndex(index + 1)}>Next</button> : <button class="btn btn-primary" onClick={finish}>Finish exam</button>}</div></section>;
}
