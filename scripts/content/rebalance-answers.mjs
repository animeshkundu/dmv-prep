import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { loadAllQuestions, ROOT } from './lib/content-io.mjs';
import { shuffle } from './lib/shuffle.mjs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const write = args.includes('--write');
const reverify = args.includes('--reverify');
const questionsDirArg = args.find((arg) => arg.startsWith('--questions-dir='));
const questionsDirIndex = args.indexOf('--questions-dir');
const questionsDir = questionsDirArg !== undefined
  ? questionsDirArg.slice('--questions-dir='.length)
  : questionsDirIndex === -1
    ? undefined
    : args[questionsDirIndex + 1];

if (questionsDir !== undefined && (!questionsDir || questionsDir.startsWith('--'))) {
  console.error('ERROR: --questions-dir requires a directory path.');
  process.exit(2);
}

const resolvedQuestionsDir = questionsDir ? resolve(questionsDir) : undefined;
if (resolvedQuestionsDir && (!existsSync(resolvedQuestionsDir) || !statSync(resolvedQuestionsDir).isDirectory())) {
  console.error(`ERROR: --questions-dir must name an existing directory: ${questionsDir}`);
  process.exit(2);
}

const POSITIONAL_RE_1 = /\b(option|answer|choice)\s+[A-D]\b/i;
const POSITIONAL_RE_2 = /\b(first|second|third|last)\s+(option|answer|choice)\b/i;

const allQuestions = loadAllQuestions(resolvedQuestionsDir);
let failures = 0;
let modifiedCount = 0;

const targetCorrectIndex = new Map();
const questionsByCategory = new Map();
for (const question of allQuestions) {
  const categoryQuestions = questionsByCategory.get(question.category) ?? [];
  categoryQuestions.push(question);
  questionsByCategory.set(question.category, categoryQuestions);
}
for (const questions of questionsByCategory.values()) {
  questions
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((question, index) => targetCorrectIndex.set(question.id, index % 4));
}

function shuffleToCorrectIndex(options, correctText, id, targetIndex) {
  for (let attempt = 0; attempt < 128; attempt++) {
    const shuffled = shuffle(options, `${id}:opts:${attempt}`);
    if (shuffled.indexOf(correctText) === targetIndex) return shuffled;
  }
  throw new Error(`Could not place ${id}'s correct option at index ${targetIndex}`);
}

// Group by file
const fileGroups = new Map();
for (const q of allQuestions) {
  const filePath = join(ROOT, q.__file);
  if (!fileGroups.has(filePath)) {
    fileGroups.set(filePath, []);
  }
  fileGroups.get(filePath).push(q);
}

for (const [filePath, items] of fileGroups.entries()) {
  let fileChanged = false;
  const newItems = items.map(item => {
    if (item.reviewStatus && item.reviewStatus !== 'draft' && !reverify) {
      console.error(`ERROR: ${item.id} is verified. Use explicit re-verification workflow.`);
      failures++;
      return item;
    }

    // Check positional references
    if (POSITIONAL_RE_1.test(item.explanation) || POSITIONAL_RE_2.test(item.explanation)) {
      console.error(`ERROR: ${item.id} has a positional explanation.`);
      failures++;
      return item;
    }

    const oldOptions = [...item.options];
    const oldCorrectText = oldOptions[item.correctIndex];
    // Establish a stable input order first so re-running the repair produces
    // the same ordering instead of shuffling an already shuffled array again.
    const canonicalOptions = [...item.options].sort((a, b) => a.localeCompare(b));
    const newOptions = shuffleToCorrectIndex(
      canonicalOptions,
      oldCorrectText,
      item.id,
      targetCorrectIndex.get(item.id),
    );
    
    let isSame = true;
    for (let i = 0; i < oldOptions.length; i++) {
      if (oldOptions[i] !== newOptions[i]) {
        isSame = false;
        break;
      }
    }

    if (!isSame) {
      if (item.reviewStatus && item.reviewStatus !== 'draft') {
        // The changed bytes are no longer verified; the separate verification
        // harness must confirm their new canonical hash before they can ship.
        item.reviewStatus = 'draft';
        delete item.verifiedBy;
        delete item.verifiedAt;
        delete item.verificationAuditId;
      }

      item.options = newOptions;
      item.correctIndex = newOptions.indexOf(oldCorrectText);
      item.contentVersion = (item.contentVersion || 1) + 1;
      
      fileChanged = true;
      modifiedCount++;
    }

    return item;
  });

  if (write && fileChanged) {
    // remove __file and __index before writing
    const cleaned = newItems.map(it => {
      const copy = { ...it };
      delete copy.__file;
      delete copy.__index;
      return copy;
    });
    
    // Some files might be an array, some might be a single object.
    // Looking at loadAllQuestions, it parses Array or Object.
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const isArray = Array.isArray(raw);
    const toWrite = isArray ? cleaned : cleaned[0];
    
    writeFileSync(filePath, JSON.stringify(toWrite, null, 2) + '\n');
  }
}

console.log(`Rebalanced ${modifiedCount} questions. Failures: ${failures}`);
if (failures > 0) process.exit(1);
