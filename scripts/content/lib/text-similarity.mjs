/**
 * Text-normalization and near-duplicate-candidate helpers for
 * `content-duplicates.test.ts` (docs/CHANGE_SPEC_COMPLETENESS.md §10, §4.6).
 *
 * Candidate generation uses a shingle inverted index rather than an all-pairs
 * scan: `docs/CHANGE_SPEC_COMPLETENESS.md` §10 explicitly calls out that a
 * naive all-pairs loop over ~7,000 items is ~24.8M comparisons, and the
 * corpus is designed to grow toward that size.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'you', 'your', 'to', 'of', 'in', 'on', 'at',
  'and', 'or', 'must', 'may', 'when', 'what', 'which', 'do', 'does', 'it',
]);

/**
 * Normalizes a prompt for duplicate comparison: lowercases, strips
 * punctuation, strips any jurisdiction name (so "roundabout in Utah" collides
 * with the equivalent national item, per §10), and collapses whitespace.
 */
export function normalizePrompt(text, jurisdictionNameRegex) {
  let t = text.toLowerCase();
  if (jurisdictionNameRegex) t = t.replace(jurisdictionNameRegex, ' ');
  t = t.replace(/[^a-z0-9\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** Word-level shingles (n-grams) of normalized text, for Jaccard similarity. */
export function shingles(normalizedText, n = 3) {
  const words = normalizedText.split(' ').filter((w) => w && !STOPWORDS.has(w));
  if (words.length < n) return new Set(words.length ? [words.join(' ')] : []);
  const out = new Set();
  for (let i = 0; i <= words.length - n; i++) {
    out.add(words.slice(i, i + n).join(' '));
  }
  return out;
}

export function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Builds a shingle -> item-index inverted index and returns only the pairs of
 * items that share at least one shingle, instead of every possible pair.
 * This is the "MinHash/inverted-index stage" §10 requires in spirit: it
 * avoids the O(n^2) scan while remaining exact (no probabilistic collisions).
 */
export function candidatePairsByShingleIndex(shingleSets) {
  const index = new Map();
  shingleSets.forEach((set, idx) => {
    for (const shingle of set) {
      if (!index.has(shingle)) index.set(shingle, []);
      index.get(shingle).push(idx);
    }
  });
  const pairs = new Set();
  for (const idxList of index.values()) {
    for (let i = 0; i < idxList.length; i++) {
      for (let j = i + 1; j < idxList.length; j++) {
        const a = idxList[i];
        const b = idxList[j];
        pairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
      }
    }
  }
  return [...pairs].map((key) => key.split(':').map(Number));
}
