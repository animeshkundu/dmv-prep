import { loadAllStates, loadAllQuestions, ROOT } from './lib/content-io.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
let sweepId = null;
let questionIds = [];
let factKeys = [];
let write = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sweepId') sweepId = args[++i];
  if (args[i] === '--questionIds') questionIds = args[++i].split(',');
  if (args[i] === '--factKeys') factKeys = args[++i].split(',');
  if (args[i] === '--write') write = true;
}

if (!sweepId || !questionIds.length || !factKeys.length) {
  console.error("Usage: node universality-sweep.mjs --sweepId <id> --questionIds <id1,id2> --factKeys <key1,key2>");
  process.exit(1);
}

const { records: states } = loadAllStates();

const valueMap = new Map();
const stateValues = {};
const uncheckable = [];

for (const state of states) {
  const code = state.code;
  const vals = [];
  for (const fk of factKeys) {
    const fact = state.typedFacts?.[fk];
    if (
      !fact ||
      fact.confidence !== 'verified' ||
      !['value', 'varies'].includes(fact.state?.status)
    ) {
      uncheckable.push(`${code}:${fk}`);
      vals.push('UNCHECKABLE');
    } else {
      vals.push(JSON.stringify(fact.state));
    }
  }
  const signature = vals.join('|');
  stateValues[code] = signature;
  
  if (!valueMap.has(signature)) valueMap.set(signature, 0);
  valueMap.set(signature, valueMap.get(signature) + 1);
}

let baseline = null;
let maxCount = -1;
for (const [sig, count] of valueMap.entries()) {
  if (count > maxCount) {
    maxCount = count;
    baseline = sig;
  }
}

const perState = {};
const exceptions = [];

for (const state of states) {
  const code = state.code;
  if (stateValues[code] === baseline) {
    perState[code] = 'match';
  } else {
    perState[code] = 'exception';
    exceptions.push(code);
  }
}

const out = {
  sweepId,
  questionIds,
  method: "typed-facts",
  factKeys,
  perState,
  exceptions,
  uncheckable,
  ranAt: new Date().toISOString().split('T')[0]
};

const outStr = JSON.stringify(out, null, 2);
console.log(outStr);

if (write) {
  const sweepsDir = join(ROOT, 'src/content/audits/sweeps');
  if (!existsSync(sweepsDir)) mkdirSync(sweepsDir, { recursive: true });
  writeFileSync(join(sweepsDir, `${sweepId}.json`), outStr + '\n');
}

const allQuestions = loadAllQuestions();
let failed = false;

if (states.length !== 51 || uncheckable.length) {
  console.error(
    `ERROR: sweep is not checkable across all 51 jurisdictions (${states.length} states, ` +
    `${uncheckable.length} missing/unverified/unsupported fact values)`,
  );
  failed = true;
}

for (const qId of questionIds) {
  const q = allQuestions.find(x => x.id === qId);
  if (!q) {
    console.error(`ERROR: Question ${qId} not found`);
    failed = true;
    continue;
  }
  
  const qExceptions = q.stateExceptions || [];
  for (const ex of exceptions) {
    if (!qExceptions.includes(ex)) {
      console.error(`ERROR: Question ${qId} is missing stateException for ${ex}`);
      failed = true;
    }
    
    const replacement = allQuestions.find(x => 
      x.replacesQuestionId === qId && 
      ['T2', 'T3'].includes(x.tier) &&
      (x.stateScope !== 'all' && x.stateScope && x.stateScope.includes(ex))
    );
    if (!replacement) {
      console.error(`ERROR: Question ${qId} is missing replacement T2/T3 item for excepted state ${ex}`);
      failed = true;
    }
    for (const declared of qExceptions) {
      if (!exceptions.includes(declared)) {
        console.error(`ERROR: Question ${qId} declares ${declared} but the sweep does not`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
