import { readFileSync, writeFileSync } from 'node:fs';
import { loadAllQuestions, ROOT } from './lib/content-io.mjs';
import { shuffle } from './lib/shuffle.mjs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const write = args.includes('--write');
const reverify = args.includes('--reverify');

const POSITIONAL_RE_1 = /\b(option|answer|choice)\s+[A-D]\b/i;
const POSITIONAL_RE_2 = /\b(first|second|third|last)\s+(option|answer|choice)\b/i;

const allQuestions = loadAllQuestions();
let failures = 0;
let modifiedCount = 0;

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
    // Check positional references
    if (POSITIONAL_RE_1.test(item.explanation) || POSITIONAL_RE_2.test(item.explanation)) {
      console.error(`ERROR: ${item.id} has a positional explanation.`);
      failures++;
      return item;
    }

    const oldOptions = [...item.options];
    const oldCorrectText = oldOptions[item.correctIndex];
    const newOptions = shuffle(item.options, `${item.id}:opts`);
    
    let isSame = true;
    for (let i = 0; i < oldOptions.length; i++) {
      if (oldOptions[i] !== newOptions[i]) {
        isSame = false;
        break;
      }
    }

    if (!isSame) {
      if (item.reviewStatus && item.reviewStatus !== 'draft') {
        if (!reverify) {
          console.error(`ERROR: ${item.id} is verified. Use explicit re-verification workflow.`);
          failures++;
          return item;
        } else {
          // The changed bytes are no longer verified; the separate verification
          // harness must confirm their new canonical hash before they can ship.
          item.reviewStatus = 'draft';
          delete item.verifiedBy;
          delete item.verifiedAt;
          delete item.verificationAuditId;
        }
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
