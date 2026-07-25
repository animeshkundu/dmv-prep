import { useMemo, useState } from 'preact/hooks';
import type { Sign } from '../lib/types';
import { shuffle } from '../lib/quiz-engine';
import '../styles/study.css';

export default function SignTrainer({ signs, base }: { signs: Sign[]; base: string }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string>();
  const [score, setScore] = useState(0);
  const sign = signs[index % signs.length];
  const choices = useMemo(
    () =>
      sign
        ? shuffle(
          [sign, ...shuffle(signs.filter((item) => item.id !== sign.id), sign.id).slice(0, 3)],
          `${sign.id}:choices`,
        )
        : [],
    [sign, signs],
  );

  if (!sign) return <p>No signs are available.</p>;
  const correct = answer === sign.id;

  function next() {
    if (correct) setScore((value) => value + 1);
    setIndex((value) => value + 1);
    setAnswer(undefined);
  }

  return (
    <section class="study-card card">
      <div class="study-meta">
        <span class="badge">Visual drill</span>
        <strong>{score} correct · {index - score} missed</strong>
      </div>
      <img
        class="sign-quiz-image"
        src={`${base.replace(/\/$/, '')}${sign.asset}`}
        alt="Road sign to identify"
        width="180"
        height="180"
      />
      <fieldset class="study-options">
        <legend><h2>What does this sign mean?</h2></legend>
        {choices.map((choice) => {
          const isCorrectOption = answer !== undefined && choice.id === sign.id;
          const isIncorrectChoice = answer === choice.id && !correct;
          return (
            <label class={`study-option ${isCorrectOption ? 'correct' : ''} ${isIncorrectChoice ? 'incorrect' : ''}`}>
              <input
                type="radio"
                name="sign"
                disabled={answer !== undefined}
                checked={answer === choice.id}
                onChange={() => setAnswer(choice.id)}
              />
              <span>{choice.meaning}</span>
              {isCorrectOption && <span class="option-status">Correct meaning</span>}
              {isIncorrectChoice && <span class="option-status">Your answer</span>}
            </label>
          );
        })}
      </fieldset>
      <div aria-live="polite">
        {answer && (
          <p class={`study-feedback ${correct ? 'pass' : 'fail'}`}>
            <strong>{correct ? 'Correct.' : `This is ${sign.name}.`}</strong> {sign.meaning}
          </p>
        )}
      </div>
      {answer && <button class="btn btn-primary" onClick={next}>Next sign <span aria-hidden="true">→</span></button>}
    </section>
  );
}
