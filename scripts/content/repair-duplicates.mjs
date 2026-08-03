import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAllQuestions, ROOT } from './lib/content-io.mjs';
import { normalizePrompt, shingles, jaccard } from './lib/text-similarity.mjs';
import { buildJurisdictionNameRegex } from './lib/universality.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const idsArg = args.find((arg) => arg.startsWith('--remove-ids='));
const idsIndex = args.indexOf('--remove-ids');
const ids = (
  idsArg?.slice('--remove-ids='.length) ??
  (idsIndex === -1 ? '' : args[idsIndex + 1] ?? '')
)
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (!write || ids.length === 0) {
  console.error('Usage: node repair-duplicates.mjs --write --remove-ids <state-question-id,...>');
  process.exit(2);
}

const stateNames = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];
const jurisdictionNames = buildJurisdictionNameRegex(stateNames);
const questions = loadAllQuestions();
const byId = new Map(questions.map((question) => [question.id, question]));
const national = questions.filter((question) => question.stateScope === 'all');
const failures = [];

for (const id of ids) {
  const question = byId.get(id);
  if (!question) {
    failures.push(`${id}: question does not exist`);
    continue;
  }
  if (question.stateScope === 'all') {
    failures.push(`${id}: only state-scoped duplicate rows may be removed`);
    continue;
  }

  const questionPrompt = normalizePrompt(question.prompt, jurisdictionNames);
  const duplicate = national.find((candidate) => {
    const candidatePrompt = normalizePrompt(candidate.prompt, jurisdictionNames);
    return candidatePrompt === questionPrompt ||
      jaccard(shingles(candidatePrompt, 3), shingles(questionPrompt, 3)) >= 0.7;
  });
  if (!duplicate) failures.push(`${id}: no matching national duplicate was found`);
  else console.log(`${id}: removing state-scoped duplicate of ${duplicate.id}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

const idsToRemove = new Set(ids);
const files = new Map();
for (const question of questions) {
  if (idsToRemove.has(question.id)) files.set(question.__file, true);
}

for (const relativePath of files.keys()) {
  const path = resolve(ROOT, relativePath);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const records = Array.isArray(raw) ? raw : [raw];
  const remaining = records.filter((record) => !idsToRemove.has(record.id));
  writeFileSync(path, `${JSON.stringify(Array.isArray(raw) ? remaining : remaining[0], null, 2)}\n`);
}

console.log(`Removed ${ids.length} reviewed state-scoped duplicate question(s).`);
