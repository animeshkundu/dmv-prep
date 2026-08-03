/**
 * Heuristic for "a real section id" (docs/CHANGE_SPEC_COMPLETENESS.md §10,
 * `content-integrity.test.ts`: "≥1 citation with a real section id").
 *
 * A citation like "Illinois Rules of the Road, Speed limits" names a handbook
 * chapter, not a locatable statute/regulation section — it cannot be used to
 * re-derive or dispute the claimed fact. A citation like "O.C.G.A. § 40-6-391"
 * or "MCL 257.625" or "MUTCD Ch. 2B" names a specific, checkable locator.
 *
 * This is necessarily a heuristic, not a legal-citation parser. It is written
 * and tuned against the actual citation strings already in the corpus (see
 * `.scratch/cites_dump.txt`-style sampling during authoring) to avoid two
 * failure modes: (a) being so loose that a bare page-number-free chapter title
 * counts, and (b) being so strict that legitimate multi-part statute numbers
 * (e.g. "257.627-257.628", "40-6-391", "31-14-2") are missed.
 */

/** A section (§) mark followed by any locator. */
const SECTION_MARK = /§\s?[\w.:()-]+/;

/** MUTCD-style chapter/part references: "Ch. 2B", "Chapter 3". */
const CHAPTER_REF = /\bCh(?:apter)?\.?\s?\d+[A-Za-z]?\b/;

/**
 * A short alphabetic code (optionally containing internal periods/ampersands,
 * e.g. "MCL", "KRS", "A.R.S.", "N.C.G.S.", "R.S.") directly followed by a
 * multi-segment numeric locator ("257.625", "40-6-391", "32:300.5",
 * "31-14-2"). Requiring a SEPARATOR between at least two digit groups is what
 * keeps this from matching an incidental age range like "16-17 Year Old" —
 * those are never preceded by a bare statute-code token.
 */
const CODE_AND_NUMBER = /\b[A-Za-z][A-Za-z.&]{0,9}\.?\s+\d+[A-Za-z]?(?:[.:-]\d+[A-Za-z]?){1,4}\b/;

export const SECTION_ID_PATTERNS = [SECTION_MARK, CHAPTER_REF, CODE_AND_NUMBER];

/** Does this single citation string contain a real, checkable section locator? */
export function hasStatuteSectionId(citation) {
  if (typeof citation !== 'string') return false;
  return SECTION_ID_PATTERNS.some((re) => re.test(citation));
}

/** Does at least one reference in `references[]` carry a real section id? */
export function hasAnyStatuteSectionId(references) {
  return Array.isArray(references) && references.some((r) => hasStatuteSectionId(r?.citation));
}
