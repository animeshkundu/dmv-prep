import { useMemo, useState } from 'preact/hooks';
import type { Sign } from '../lib/types';
import { shuffle } from '../lib/quiz-engine';
import '../styles/study.css';

export default function SignTrainer({ signs, base }: { signs: Sign[]; base: string }) {
  const [index, setIndex] = useState(0), [answer, setAnswer] = useState<string>(), [score, setScore] = useState(0);
  const sign = signs[index % signs.length];
  const choices = useMemo(() => sign ? shuffle([sign, ...shuffle(signs.filter((item) => item.id !== sign.id), sign.id).slice(0, 3)], `${sign.id}:choices`) : [], [sign, signs]);
  if (!sign) return <p>No signs are available.</p>;
  const correct = answer === sign.id;
  return <section class="study-card card"><p class="muted">Score: {score} of {index}</p><img src={`${base.replace(/\/$/, '')}${sign.asset}`} alt={`${sign.name} road sign`} width="180" height="180"/><fieldset class="study-options"><legend><h2>What does this sign mean?</h2></legend>{choices.map((choice) => <label class="study-option"><input type="radio" name="sign" disabled={answer !== undefined} checked={answer === choice.id} onChange={() => setAnswer(choice.id)}/>{choice.meaning}</label>)}</fieldset><div aria-live="polite">{answer && <p class={`study-feedback ${correct ? 'pass' : 'fail'}`}>{correct ? 'Correct.' : `This is ${sign.name}.`} {sign.meaning}</p>}</div>{answer && <button class="btn btn-primary" onClick={() => { if (correct) setScore(score + 1); setIndex(index + 1); setAnswer(undefined); }}>Next sign</button>}</section>;
}
