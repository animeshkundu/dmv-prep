import { loadAllQuestions, ROOT } from './lib/content-io.mjs';
import { normalizePrompt, shingles, jaccard, candidatePairsByShingleIndex } from './lib/text-similarity.mjs';
import { buildJurisdictionNameRegex } from './lib/universality.mjs';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY'
];

const args = process.argv.slice(2);
const modeGenerated = args.includes('--generated');
const modeCache = args.includes('--against-cache');

const allQuestions = loadAllQuestions();
const jurisdictionNameRegex = buildJurisdictionNameRegex([
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming'
]);

function getStates(q) {
  if (q.stateScope === 'all') {
    if (q.stateExceptions && q.stateExceptions.length > 0) {
      return STATE_CODES.filter(s => !q.stateExceptions.includes(s));
    }
    return STATE_CODES;
  }
  return q.stateScope || [];
}

function shareStatePool(q1, q2) {
  const s1 = new Set(getStates(q1));
  const s2 = getStates(q2);
  for (const s of s2) {
    if (s1.has(s)) return true;
  }
  return false;
}

if (modeGenerated) {
  // compute pairwise Jaccard across a template's 51 outputs
  const templates = new Map();
  for (const q of allQuestions) {
    if (q.tier === 'T2' && q.templateId) {
      if (!templates.has(q.templateId)) templates.set(q.templateId, []);
      templates.get(q.templateId).push(q);
    }
  }

  let failed = false;
  for (const [templateId, qs] of templates.entries()) {
    const norms = qs.map(q => normalizePrompt(q.prompt, jurisdictionNameRegex));
    const sets = norms.map(n => shingles(n, 3));
    let totalPairs = 0;
    let highPairs = 0;
    for (let i = 0; i < qs.length; i++) {
      for (let j = i + 1; j < qs.length; j++) {
        totalPairs++;
        if (jaccard(sets[i], sets[j]) > 0.85) highPairs++;
      }
    }
    if (totalPairs === 0) continue;
    const ratio = highPairs / totalPairs;
    console.log(`Template ${templateId}: ${(ratio * 100).toFixed(1)}% pairs > 0.85 similarity`);
    if (ratio > 0.6 && ratio <= 0.8) console.warn(`WARNING: Template ${templateId} exceeds 60% similarity threshold`);
    if (ratio > 0.8) {
      console.error(`ERROR: Template ${templateId} exceeds 80% similarity threshold`);
      failed = true;
    }
  }
  if (failed) process.exit(1);

} else if (modeCache) {
  // compute 6-gram shingle overlap against cache
  const cacheDir = join(ROOT, 'scripts/.cache');
  if (!existsSync(cacheDir)) {
    console.log('No cache dir, skipping.');
    process.exit(0);
  }
  const cacheFiles = readdirSync(cacheDir).map(f => join(cacheDir, f));
  if (cacheFiles.length === 0) {
    console.log('Cache empty, skipping.');
    process.exit(0);
  }

  const cacheTexts = cacheFiles.map(f => readFileSync(f, 'utf8'));
  const cacheShingles = new Set();
  for (const t of cacheTexts) {
    const norm = normalizePrompt(t, null); // no jurisdiction strip
    const s = shingles(norm, 6);
    for (const x of s) cacheShingles.add(x);
  }

  let failed = false;
  let reviewCount = 0;
  for (const q of allQuestions) {
    const textToTest = q.prompt + ' ' + q.explanation;
    const norm = normalizePrompt(textToTest, null);
    const words = norm.split(' ').filter(w => w);
    let maxRun = 0;
    for (let i = 0; i <= words.length - 6; i++) {
      const shing = words.slice(i, i + 6).join(' ');
      if (cacheShingles.has(shing)) {
        let currentRun = 6;
        for (let j = i + 6; j < words.length; j++) {
          const extendShing = words.slice(j - 5, j + 1).join(' ');
          if (cacheShingles.has(extendShing)) currentRun++;
          else break;
        }
        maxRun = Math.max(maxRun, currentRun);
        i += (currentRun - 6); // skip
      }
    }
    if (maxRun >= 10) {
      console.error(`ERROR: ${q.id} has ${maxRun}-word overlap with cache`);
      failed = true;
    } else if (maxRun >= 6) {
      console.warn(`REVIEW: ${q.id} has ${maxRun}-word overlap with cache`);
      reviewCount++;
    }
  }
  if (failed) process.exit(1);

} else {
  // normal dedupe
  const normalized = allQuestions.map(q => normalizePrompt(q.prompt, jurisdictionNameRegex));
  const shingleSets = normalized.map(n => shingles(n, 3));
  const candidates = candidatePairsByShingleIndex(shingleSets);

  let failed = false;
  for (const [i, j] of candidates) {
    const q1 = allQuestions[i];
    const q2 = allQuestions[j];
    if (!shareStatePool(q1, q2)) continue;

    if (normalized[i] === normalized[j] && normalized[i].length > 0) {
      const stateNational =
        (q1.stateScope === 'all') !== (q2.stateScope === 'all')
          ? ' (state item duplicates a national item)'
          : '';
      console.error(`ERROR: exact duplicate between ${q1.id} and ${q2.id}${stateNational}`);
      failed = true;
    } else {
      const sim = jaccard(shingleSets[i], shingleSets[j]);
      if (sim >= 0.7) {
        console.error(`ERROR: near duplicate (${sim.toFixed(2)}) between ${q1.id} and ${q2.id}`);
        failed = true;
      }
    }
  }

  if (failed) process.exit(1);
}
