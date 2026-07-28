import type { ExamVariant, Question } from '../lib/types';
import { toClientQuestion } from '../lib/questions';
import TestRunner from './TestRunner';
import type { TestDefinition } from './TestRunner';

const definition: TestDefinition = {
  mode: 'mock',
  feedback: 'deferred',
  navigation: 'free',
  timer: true,
};

export default function MockExam({
  state,
  variants,
  questions,
}: {
  state: string;
  variants: ExamVariant[];
  questions: Question[];
}) {
  return (
    <TestRunner
      state={state}
      definition={definition}
      seedQuestions={questions.map(toClientQuestion)}
      variants={variants}
    />
  );
}
