#!/usr/bin/env node
import { loadAllQuestions } from './lib/content-io.mjs';
import { CATEGORY_TARGETS, STATE_CODES } from './lib/schema-constants.mjs';

const questions = loadAllQuestions();
const categories = Object.keys(CATEGORY_TARGETS);
const applies = (question, code) =>
  question.stateScope === 'all'
    ? !(question.stateExceptions ?? []).includes(code)
    : (question.stateScope ?? []).includes(code);

const states = Object.fromEntries(STATE_CODES.map((code) => {
  const pool = questions.filter((question) => applies(question, code));
  const byCategory = Object.fromEntries(categories.map((category) => [
    category,
    pool.filter((question) => question.category === category).length,
  ]));
  const tiers = Object.fromEntries(['T1', 'T2', 'T3'].map((tier) => [
    tier,
    pool.filter((question) => question.tier === tier).length,
  ]));
  return [code, { total: pool.length, byCategory, tiers }];
}));

const answerPositions = [0, 1, 2, 3].map(
  (position) => questions.filter((question) => question.correctIndex === position).length,
);
const uniquelyLongestCorrect = questions.filter((question) => {
  const lengths = question.options.map((option) => option.length);
  const maximum = Math.max(...lengths);
  return lengths[question.correctIndex] === maximum &&
    lengths.filter((length) => length === maximum).length === 1;
}).length;

process.stdout.write(`${JSON.stringify({
  questionCount: questions.length,
  answerPositions,
  uniquelyLongestCorrect,
  states,
}, null, 2)}\n`);
