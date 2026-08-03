import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ExamVariant, MockResult, Question } from '../lib/types';
import { buildMockExam, buildPracticeSet, scoreExam } from '../lib/quiz-engine';
import { presentQuestion, toStoredIndex } from '../lib/options';
import type { PresentedQuestion } from '../lib/options';
import { event } from '../lib/analytics';
import { recordActivity } from '../lib/activity';
import type { ActivityEvent } from '../lib/activity';
import type { ClientQuestion } from '../lib/questions';
import type { ClientSign } from '../lib/bank';
import { getCachedBank, putCachedBank } from '../lib/bank-cache';
import { assetUrl } from '../lib/site';
import '../styles/study.css';

/**
 * The reduced question shape served by the bank endpoint and inlined as the starter seed.
 * Build-time provenance never reaches the client.
 */
export type RunnerQuestion = ClientQuestion;

export interface TestDefinition {
  mode: 'practice' | 'mock';
  /** immediate: explain each answer as it is checked. deferred: score only at the end. */
  feedback: 'immediate' | 'deferred';
  /** forward-only: no going back. free: revisit and change earlier answers. */
  navigation: 'forward-only' | 'free';
  /** Honour the variant's timeLimitMinutes. */
  timer: boolean;
  /** Questions per practice set. Ignored for mocks, which follow the variant. */
  setSize?: number;
  /** Render the topic picker (practice only). */
  categoryPicker?: boolean;
}

/**
 * Every surface reports through the one activity contract; `attemptId` is stable per
 * (run, question), so replaying an event — a re-render, a retried write, the mock's
 * end-of-run sweep over questions already answered — is a no-op.
 */
type ActivitySink = (activity: ActivityEvent) => void | Promise<void>;

const categoryLabel = (category: string) => category.replaceAll('-', ' ');

function toRunnerQuestion(input: unknown): RunnerQuestion | undefined {
  const item = input as Partial<RunnerQuestion>;
  if (
    !item ||
    typeof item.id !== 'string' ||
    typeof item.prompt !== 'string' ||
    typeof item.explanation !== 'string' ||
    !Array.isArray(item.options) ||
    typeof item.correctIndex !== 'number' ||
    item.correctIndex < 0 ||
    item.correctIndex >= item.options.length
  ) {
    return undefined;
  }
  const reference = item.references?.[0];
  return {
    id: item.id,
    category: item.category as Question['category'],
    tags: item.tags,
    prompt: item.prompt,
    imageAsset: item.imageAsset,
    options: item.options,
    correctIndex: item.correctIndex,
    explanation: item.explanation,
    difficulty: item.difficulty,
    ...(reference?.citation ? { references: [reference] } : {}),
  };
}

function normalizeBank(payload: unknown): RunnerQuestion[] {
  const items = Array.isArray(payload)
    ? payload
    : (payload as { questions?: unknown[] } | null)?.questions;
  if (!Array.isArray(items)) return [];
  return items.map(toRunnerQuestion).filter((item): item is RunnerQuestion => Boolean(item));
}

/**
 * A short bank (offline starter seed) cannot fill a 46-question exam, so scale the run's
 * targets to what is actually being asked rather than presenting an unpassable exam.
 */
function fitVariant(variant: ExamVariant, exam: RunnerQuestion[]): ExamVariant {
  if (exam.length >= variant.numQuestions) return variant;
  const total = Math.max(1, exam.length);
  const ratio = variant.numToPass / variant.numQuestions;
  return {
    ...variant,
    numQuestions: total,
    numToPass: Math.min(total, Math.max(1, Math.round(ratio * total))),
    subRequirements: variant.subRequirements?.map((requirement) => {
      const available = exam.filter((item) => item.category === requirement.category).length;
      const outOf = Math.min(requirement.outOf, available);
      return { ...requirement, outOf, minCorrect: Math.min(requirement.minCorrect, outOf) };
    }),
  };
}

export default function TestRunner({
  state,
  definition,
  seedQuestions,
  bankUrl,
  bankVersion,
  signUrl,
  variants = [],
  category,
  onActivity = recordActivity,
}: {
  state: string;
  definition: TestDefinition;
  seedQuestions: RunnerQuestion[];
  bankUrl?: string;
  bankVersion?: string;
  signUrl?: string;
  variants?: ExamVariant[];
  category?: Question['category'];
  onActivity?: ActivitySink;
}) {
  const isMock = definition.mode === 'mock';

  // Question source: the inlined seed until the full bank arrives.
  const [pool, setPool] = useState<RunnerQuestion[]>(seedQuestions);
  const [bankState, setBankState] = useState<'seed' | 'loading' | 'ready' | 'unavailable'>(
    bankUrl ? 'loading' : 'seed',
  );
  const bankRef = useRef<RunnerQuestion[] | undefined>(undefined);
  const [signs, setSigns] = useState<Record<string, ClientSign>>({});

  const [runIndex, setRunIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Question['category'] | 'all'>(
    category ?? 'all',
  );
  const [challengeSet, setChallengeSet] = useState<RunnerQuestion[]>();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [missed, setMissed] = useState<RunnerQuestion[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [variantId, setVariantId] = useState(variants[0]?.variantId ?? 'default');
  const [started, setStarted] = useState(!isMock);
  const [remaining, setRemaining] = useState(0);

  const variant = variants.find((item) => item.variantId === variantId) ?? variants[0];
  const untouched = !started || (index === 0 && !submitted && Object.keys(answers).length === 0);
  const untouchedRef = useRef(untouched);
  untouchedRef.current = untouched;

  const categories = useMemo(
    () => [...new Set(pool.map((question) => question.category))].sort(),
    [pool],
  );

  const attemptSeed = isMock
    ? `${state}:${variantId}:${runIndex}`
    : `${state}:${challengeSet ? 'challenge' : activeCategory}:${runIndex}`;

  const set = useMemo(() => {
    if (isMock) return variant ? buildMockExam(state, variant, pool, attemptSeed) : [];
    if (challengeSet) return challengeSet;
    return buildPracticeSet(pool, {
      category: activeCategory === 'all' ? undefined : activeCategory,
      count: definition.setSize ?? 10,
      seed: attemptSeed,
    });
  }, [isMock, variant, pool, state, attemptSeed, challengeSet, activeCategory, definition.setSize]);

  // Pure in (question id, attempt seed): navigating back reproduces the same arrangement,
  // while a retry (new run) reshuffles so remembered positions are worthless.
  const presentedSet = useMemo(
    () => set.map((question) => presentQuestion(question, attemptSeed)),
    [set, attemptSeed],
  );
  const presented: PresentedQuestion<RunnerQuestion> | undefined = presentedSet[index];
  const question = presented?.question;
  const runVariant = variant ? fitVariant(variant, set) : undefined;
  const shortened = Boolean(variant && runVariant && runVariant.numQuestions < variant.numQuestions);

  useEffect(() => {
    if (!bankUrl) return;
    let cancelled = false;
    void (async () => {
      let cached: RunnerQuestion[] | undefined;
      if (bankVersion) {
        cached = await getCachedBank(state, bankVersion);
        if (!cancelled && cached?.length) {
          bankRef.current = cached;
          setBankState('ready');
          if (untouchedRef.current) setPool(cached);
        }
      }
      try {
        const response = await fetch(bankUrl);
        if (!response.ok) throw new Error(`Question bank request failed (${response.status}).`);
        const payload = await response.json() as { bankVersion?: string; questions?: unknown[] };
        if (bankVersion && payload.bankVersion !== bankVersion) {
          throw new Error('Question bank version does not match this page.');
        }
        const bank = normalizeBank(payload);
        if (!bank.length) throw new Error('Question bank is empty.');
        if (cancelled) return;
        bankRef.current = bank;
        setBankState('ready');
        if (bankVersion) await putCachedBank(state, bankVersion, bank);
        // A session already in progress keeps its questions; the bank applies from the next set.
        if (untouchedRef.current) setPool(bank);
      } catch {
        if (!cancelled && !cached?.length) setBankState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankUrl, bankVersion, state]);

  useEffect(() => {
    if (!signUrl) return;
    let cancelled = false;
    fetch(signUrl)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('sign bank'))))
      .then((payload: { signs?: ClientSign[] }) => {
        if (!cancelled && Array.isArray(payload.signs)) {
          setSigns(Object.fromEntries(payload.signs.map((sign) => [sign.id, sign])));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signUrl]);

  useEffect(() => {
    if (isMock) return;
    event('quiz_start', {
      mode: 'practice',
      state,
      category: challengeSet ? 'challenge-bank' : activeCategory,
    });
  }, [isMock, state, activeCategory, challengeSet, runIndex]);

  useEffect(() => {
    if (!isMock || !started || completed || !remaining) return;
    const timer = window.setInterval(
      () => setRemaining((value) => (value <= 1 ? 0 : value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isMock, started, completed, remaining]);

  useEffect(() => {
    if (isMock && started && !completed && remaining === 0 && definition.timer && variant?.timeLimitMinutes) {
      void finish();
    }
  }, [remaining]);

  useEffect(() => {
    const onKey = (keyboard: KeyboardEvent) => {
      if (!presented || completed || !started) return;
      if (/^[1-9]$/.test(keyboard.key)) {
        const choice = Number(keyboard.key) - 1;
        if (choice < presented.options.length) select(choice);
        return;
      }
      if (keyboard.key === 'ArrowDown' || keyboard.key === 'ArrowRight') {
        const current = answers[presented.question.id] ?? -1;
        select(current + 1 >= presented.options.length ? 0 : current + 1);
      }
      if (keyboard.key === 'ArrowUp' || keyboard.key === 'ArrowLeft') {
        const current = answers[presented.question.id] ?? 0;
        select(current - 1 < 0 ? presented.options.length - 1 : current - 1);
      }
      if (keyboard.key === 'Enter') {
        if (definition.feedback === 'immediate') {
          if (submitted) advance();
          else void check();
        } else if (index < presentedSet.length - 1) {
          advance();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function select(displayIndex: number) {
    if (!presented || (submitted && definition.feedback === 'immediate')) return;
    if (isMock) {
      void onActivity({
        kind: 'question-answered',
        attemptId: `${attemptSeed}:${presented.question.id}`,
        questionId: presented.question.id,
        category: presented.question.category,
        correct: displayIndex === presented.correctIndex,
        source: 'mock',
        stateCode: state,
      });
    }
    setAnswers((current) => ({ ...current, [presented.question.id]: displayIndex }));
  }

  function nextPool(): RunnerQuestion[] {
    return bankRef.current ?? seedQuestions;
  }

  function resetRun(nextCategory: Question['category'] | 'all' = activeCategory) {
    setPool(nextPool());
    setActiveCategory(nextCategory);
    setChallengeSet(undefined);
    setRunIndex((value) => value + 1);
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setMissed([]);
    setCorrectCount(0);
    setCompleted(false);
  }

  function startChallengeBank() {
    setChallengeSet(missed);
    setRunIndex((value) => value + 1);
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setMissed([]);
    setCorrectCount(0);
    setCompleted(false);
  }

  function startMock() {
    setPool(nextPool());
    setRunIndex((value) => value + 1);
    setStarted(true);
    setIndex(0);
    setAnswers({});
    setCompleted(false);
    setRemaining(definition.timer ? (variant?.timeLimitMinutes ?? 0) * 60 : 0);
    event('quiz_start', { mode: 'mock', state, variant: variantId });
  }

  async function check() {
    if (!presented || submitted) return;
    const answer = answers[presented.question.id];
    if (answer === undefined) return;
    setSubmitted(true);
    const correct = answer === presented.correctIndex;
    if (correct) setCorrectCount((value) => value + 1);
    else setMissed((items) => [...items, presented.question]);
    await onActivity({
      kind: 'question-answered',
      attemptId: `${attemptSeed}:${presented.question.id}`,
      questionId: presented.question.id,
      category: presented.question.category,
      correct,
      source: challengeSet ? 'challenge' : 'practice',
      stateCode: state,
    });
  }

  function advance() {
    if (definition.feedback === 'immediate' && !submitted) return;
    setSubmitted(false);
    setIndex((value) => value + 1);
  }

  async function finish() {
    if (completed || !runVariant) return;
    setCompleted(true);
    const stored: Record<string, number | undefined> = {};
    for (const item of presentedSet) {
      const answer = answers[item.question.id];
      stored[item.question.id] = answer === undefined ? undefined : toStoredIndex(item, answer);
    }
    const outcome = scoreExam(set, stored, runVariant);
    const result: MockResult = {
      id: `${state}-${runVariant.variantId}-${Date.now()}`,
      state,
      variantId: runVariant.variantId,
      correct: outcome.correct,
      total: outcome.total,
      passed: outcome.passed,
      completedAt: new Date().toISOString(),
      passThreshold: outcome.passThreshold,
    };
    await onActivity({ kind: 'mock-finished', attemptId: `${attemptSeed}:result`, result });
    if (!outcome.passed) event('mock_fail', { state, variant: runVariant.variantId });
  }

  const bankNotice =
    bankState === 'unavailable' ? (
      <p class="badge" role="status">
        Offline · practising from the {seedQuestions.length}-question starter set. Connect once to
        download the full bank.
      </p>
    ) : undefined;

  if (isMock && !started) {
    if (!variant) return <p>No exam variant is available yet.</p>;
    const percent = Math.ceil((variant.numToPass / variant.numQuestions) * 100);
    return (
      <section class="study-card card" aria-label="Mock exam">
        <div>
          <p class="eyebrow">Ready when you are</p>
          <h2>Start a mock exam</h2>
          <p class="muted">Find a quiet spot. Your answers are not checked until you submit.</p>
        </div>
        <label>
          <strong>Exam version</strong>
          <select
            id="mock-variant"
            class="form-control"
            value={variantId}
            onChange={(changeEvent) => setVariantId(changeEvent.currentTarget.value)}
          >
            {variants.map((item) => (
              <option value={item.variantId}>{item.label}</option>
            ))}
          </select>
        </label>
        {variant.testGroup && variants.filter((item) => item.testGroup === variant.testGroup).length > 1 && (
          <p class="badge">
            {state} requires passing every test in this group:{' '}
            {variants
              .filter((item) => item.testGroup === variant.testGroup)
              .map((item) => item.label)
              .join(' · ')}
          </p>
        )}
        <div class="metric-grid">
          <div class="metric card">
            <strong>{variant.numQuestions}</strong>
            <span>questions</span>
          </div>
          <div class="metric card">
            <strong>{variant.numToPass}</strong>
            <span>correct to pass</span>
          </div>
          <div class="metric card">
            <strong>{percent}%</strong>
            <span>passing score</span>
          </div>
        </div>
        {definition.timer && variant.timeLimitMinutes && (
          <p class="badge">{variant.timeLimitMinutes} minute limit</p>
        )}
        {bankNotice}
        {bankState === 'loading' && (
          <p class="muted" role="status">
            Loading the full {state} question bank…
          </p>
        )}
        <button class="btn btn-primary" onClick={startMock}>
          Start mock exam <span aria-hidden="true">→</span>
        </button>
      </section>
    );
  }

  if (isMock && completed && runVariant) {
    const stored: Record<string, number | undefined> = {};
    for (const item of presentedSet) {
      const answer = answers[item.question.id];
      stored[item.question.id] = answer === undefined ? undefined : toStoredIndex(item, answer);
    }
    const outcome = scoreExam(set, stored, runVariant);
    const missedItems = presentedSet.filter(
      (item) => answers[item.question.id] !== item.correctIndex,
    );
    return (
      <section class="study-card card" aria-label="Mock exam results">
        <div class="score-ring">
          <span>
            <strong>
              {outcome.correct}/{outcome.total}
            </strong>
            <br />
            correct
          </span>
        </div>
        <div>
          <p class="eyebrow">Mock exam complete</p>
          <h2>{outcome.passed ? 'You passed this run.' : 'Close the gaps, then try again.'}</h2>
          <p class={`study-feedback ${outcome.passed ? 'pass' : 'fail'}`}>
            You needed {outcome.passThreshold} correct. You scored {outcome.correct}.
          </p>
        </div>
        {outcome.subRequirementResults.map((subRequirement) => (
          <p>
            {categoryLabel(subRequirement.category)}: {subRequirement.correct} correct,{' '}
            {subRequirement.minCorrect} required.{' '}
            <strong>{subRequirement.passed ? 'Met' : 'Not met'}</strong>
          </p>
        ))}
        {missedItems.length > 0 && (
          <div class="review-list">
            <h3>
              Review {missedItems.length} missed{' '}
              {missedItems.length === 1 ? 'question' : 'questions'}
            </h3>
            {missedItems.map((item) => (
              <article>
                <strong>{item.question.prompt}</strong>
                <p>
                  Correct answer: {item.question.options[item.question.correctIndex]}
                </p>
                <p>{item.question.explanation}</p>
              </article>
            ))}
          </div>
        )}
        <button class="btn btn-primary" onClick={startMock}>
          Take another mock
        </button>
      </section>
    );
  }

  if (!isMock && !question) {
    const percent = set.length ? Math.round((correctCount / set.length) * 100) : 0;
    return (
      <section class="study-card card" aria-label="Practice results">
        <div class="score-ring">
          <span>
            <strong>{percent}%</strong>
            <br />
            correct
          </span>
        </div>
        <div>
          <p class="eyebrow">{challengeSet ? 'Challenge bank complete' : 'Practice complete'}</p>
          <h2>{missed.length ? 'Turn misses into wins.' : 'Clean run. Nice work.'}</h2>
          <p class="muted">
            You answered {correctCount} of {set.length} questions correctly.
          </p>
        </div>
        <div class="study-actions">
          {missed.length > 0 && (
            <button class="btn btn-pop" onClick={startChallengeBank}>
              Retry {missed.length} missed {missed.length === 1 ? 'question' : 'questions'}
            </button>
          )}
          <button class="btn btn-ghost" onClick={() => resetRun()}>
            New practice set
          </button>
        </div>
      </section>
    );
  }

  if (!presented || !question) return <p>No questions are available yet.</p>;

  const answer = answers[question.id];
  const correct = answer === presented.correctIndex;
  const citation = question.references?.[0];
  const sign = question.imageAsset ? signs[question.imageAsset] : undefined;
  const immediate = definition.feedback === 'immediate';
  const answeredCount = presentedSet.filter(
    (item) => answers[item.question.id] !== undefined,
  ).length;

  return (
    <>
      {!isMock && definition.categoryPicker !== false && !challengeSet && (
        <div class="study-toolbar">
          <label for="practice-category">Focus your practice</label>
          <select
            id="practice-category"
            class="form-control"
            value={activeCategory}
            onChange={(changeEvent) =>
              resetRun(changeEvent.currentTarget.value as Question['category'] | 'all')
            }
          >
            <option value="all">All available topics</option>
            {categories.map((item) => (
              <option value={item}>{categoryLabel(item)}</option>
            ))}
          </select>
        </div>
      )}
      {challengeSet && <p class="badge">Challenge bank · missed questions only</p>}
      {bankNotice}
      {isMock && shortened && (
        <p class="badge" role="status">
          Shortened rehearsal: {set.length} questions instead of {variant?.numQuestions}, scored
          against a matching target.
        </p>
      )}
      <section class="study-card card" aria-label={isMock ? 'Mock exam' : 'Practice quiz'}>
        <div class="study-meta">
          <p class="muted">
            Question {index + 1} of {presentedSet.length}
            {!isMock && <> · {categoryLabel(question.category)}</>}
          </p>
          {isMock ? (
            definition.timer && variant?.timeLimitMinutes ? (
              <strong
                aria-label={`${Math.floor(remaining / 60)} minutes and ${remaining % 60} seconds left`}
              >
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} left
              </strong>
            ) : undefined
          ) : (
            <strong>{correctCount} correct</strong>
          )}
        </div>
        <progress class="study-progress" value={index + 1} max={presentedSet.length}>
          {index + 1} of {presentedSet.length}
        </progress>
        <fieldset class="study-options">
          <legend>
            <h2>{question.prompt}</h2>
          </legend>
          {sign && (
            <img
              src={assetUrl(sign.asset)}
              alt={sign.altText ?? 'Road sign illustration'}
              width="180"
              height="180"
              loading="lazy"
            />
          )}
          {presented.options.map((option, optionIndex) => {
            const isCorrectOption = immediate && submitted && optionIndex === presented.correctIndex;
            const isIncorrectChoice = immediate && submitted && optionIndex === answer && !correct;
            const status = isCorrectOption ? 'Correct answer' : isIncorrectChoice ? 'Your answer' : '';
            return (
              <label
                class={`study-option ${isCorrectOption ? 'correct' : ''} ${isIncorrectChoice ? 'incorrect' : ''}`}
              >
                <input
                  type="radio"
                  name={isMock ? 'mock-answer' : 'answer'}
                  checked={answer === optionIndex}
                  disabled={immediate && submitted}
                  onChange={() => select(optionIndex)}
                />
                <span>
                  <strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}
                </span>
                {status && <span class="option-status">{status}</span>}
              </label>
            );
          })}
        </fieldset>
        <div aria-live="polite">
          {immediate && submitted && (
            <div class={`study-feedback ${correct ? 'pass' : 'fail'}`}>
              <strong>{correct ? 'Correct.' : 'Not quite.'}</strong> {question.explanation}
              <p>
                <small>
                  Source:{' '}
                  {citation?.url ? <a href={citation.url}>{citation.citation}</a> : citation?.citation}
                </small>
              </p>
            </div>
          )}
        </div>
        <div class="study-actions">
          {definition.navigation === 'free' && (
            <button class="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Previous
            </button>
          )}
          {immediate ? (
            submitted ? (
              <button class="btn btn-primary" onClick={advance}>
                Next question <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                class="btn btn-primary"
                disabled={answer === undefined}
                onClick={() => void check()}
              >
                Check answer
              </button>
            )
          ) : index < presentedSet.length - 1 ? (
            <button class="btn btn-primary" onClick={advance}>
              Next <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button class="btn btn-pop" onClick={() => void finish()}>
              Finish and score exam
            </button>
          )}
          {!isMock && <span class="muted">Keyboard: 1-4 to choose, Enter to continue</span>}
        </div>
        {isMock && (
          <p class="muted">
            {answeredCount} of {presentedSet.length} answered
          </p>
        )}
      </section>
    </>
  );
}
