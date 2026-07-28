import type { Question } from '../lib/types';
import { toClientQuestion } from '../lib/questions';
import TestRunner from './TestRunner';
import type { TestDefinition } from './TestRunner';

const definition: TestDefinition = {
  mode: 'practice',
  feedback: 'immediate',
  navigation: 'forward-only',
  timer: false,
  setSize: 10,
  categoryPicker: true,
};

export default function Quiz({
  questions,
  category,
}: {
  questions: Question[];
  category?: Question['category'];
}) {
  return (
    <TestRunner
      state="US"
      definition={definition}
      seedQuestions={questions.map(toClientQuestion)}
      category={category}
    />
  );
}
