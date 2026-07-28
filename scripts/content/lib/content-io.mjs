/**
 * Read-only content-loading helpers shared by the `content-*.test.ts` acceptance
 * suite (docs/CHANGE_SPEC_COMPLETENESS.md §10).
 *
 * These deliberately duplicate NONE of the production Zod schema in
 * `src/content.config.ts` — they only read raw JSON/Markdown off disk so the
 * tests can assert against the repository as it actually is, independent of
 * whether `astro:content` (unavailable under vitest) would accept it.
 *
 * Nothing here writes to disk or mutates content; every export is a pure read.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repository root (this file lives at scripts/content/lib/). */
export const ROOT = join(__dirname, '..', '..', '..');

export function repoPath(...segments) {
  return join(ROOT, ...segments);
}

/** Recursively list files under `dir` (absolute or repo-relative), or [] if it doesn't exist. */
export function walkFiles(dir) {
  const abs = dir.startsWith(ROOT) ? dir : repoPath(dir);
  if (!existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort();
}

export function readJson(absOrRelPath) {
  const abs = absOrRelPath.startsWith(ROOT) ? absOrRelPath : repoPath(absOrRelPath);
  const raw = readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${relative(ROOT, abs)}: ${e.message}`);
  }
}

/**
 * Loads every question record from src/content/questions, recursively (matching
 * `arrayJsonLoader`'s own walk), tagging each record with the file it came from
 * so failures can be reported precisely.
 */
export function loadAllQuestions() {
  const dir = repoPath('src/content/questions');
  const files = walkFiles(dir).filter((f) => f.endsWith('.json'));
  const records = [];
  for (const file of files) {
    const data = readJson(file);
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, index) => {
      records.push({ ...item, __file: relative(ROOT, file), __index: index });
    });
  }
  return records;
}

/** Loads every state record from src/content/states, keyed by `code`. */
export function loadAllStates() {
  const dir = repoPath('src/content/states');
  const files = walkFiles(dir).filter((f) => f.endsWith('.json'));
  const byCode = new Map();
  const records = [];
  for (const file of files) {
    const data = readJson(file);
    const rec = { ...data, __file: relative(ROOT, file) };
    records.push(rec);
    if (data.code) byCode.set(data.code, rec);
  }
  return { records, byCode };
}

/** Loads every sign record from src/content/signs (the registered collection dir). */
export function loadAllSigns() {
  const dir = repoPath('src/content/signs');
  const files = walkFiles(dir).filter((f) => f.endsWith('.json'));
  const records = [];
  for (const file of files) {
    const data = readJson(file);
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, index) => {
      records.push({ ...item, __file: relative(ROOT, file), __index: index });
    });
  }
  return records;
}

/**
 * The sign licence manifest MUST live outside the registered `signs` collection
 * directory (§6.1). Returns `null` if it does not exist yet rather than throwing,
 * so callers can produce a precise, non-vacuous failure message.
 */
export function loadSignManifest() {
  const path = repoPath('src/content/sign-manifest/manifest.json');
  if (!existsSync(path)) return null;
  return readJson(path);
}

export function loadTagVocabulary() {
  const path = repoPath('src/content/taxonomy/tags.json');
  if (!existsSync(path)) return null;
  return readJson(path);
}

/** Reads src/content/audits/generation/<code>.json shortfall ledgers, if any exist. */
export function loadGenerationAudits() {
  const dir = repoPath('src/content/audits/generation');
  return walkFiles(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({ ...readJson(file), __file: relative(ROOT, file) }));
}

/** Reads src/content/audits/verify/<batchId>.json cross-lab verdict batches, if any exist. */
export function loadVerifyAudits() {
  const dir = repoPath('src/content/audits/verify');
  return walkFiles(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({ ...readJson(file), __file: relative(ROOT, file) }));
}

/** Reads src/content/sources/<code>.sources.json snapshot-hash records, if any exist. */
export function loadSourceSnapshots() {
  const dir = repoPath('src/content/sources');
  return walkFiles(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({ ...readJson(file), __file: relative(ROOT, file) }));
}

export function loadStateNotes() {
  const dir = repoPath('src/content/state-notes');
  return walkFiles(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((file) => {
      const data = readJson(file);
      const items = Array.isArray(data) ? data : [data];
      return items.map((item, index) => ({ ...item, __file: relative(ROOT, file), __index: index }));
    });
}

/**
 * Minimal, dependency-free YAML-frontmatter reader for the small, flat shape our
 * lesson Markdown uses (scalars, one level of `key:\n  - value` string lists, and
 * `key:\n  - label: x\n    citation: y` object lists). It intentionally does not
 * try to be a general YAML parser — only enough of one to read `src/content/lessons`
 * frontmatter without adding a new npm dependency. Values it cannot confidently
 * parse are left as raw strings rather than silently dropped.
 */
export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const [, fmBlock, body] = match;
  const lines = fmBlock.split(/\r?\n/);
  const data = {};
  let i = 0;
  const stripQuotes = (s) => {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  };
  const coerceScalar = (s) => {
    const t = stripQuotes(s);
    if (t === '') return undefined;
    if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    return t;
  };
  while (i < lines.length) {
    const line = lines[i];
    const topKey = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!topKey) {
      i++;
      continue;
    }
    const [, key, rest] = topKey;
    if (rest.trim() !== '') {
      // Inline scalar, or inline array like [a, b, c].
      const trimmed = rest.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        data[key] = trimmed
          .slice(1, -1)
          .split(',')
          .map((s) => coerceScalar(s))
          .filter((v) => v !== undefined);
      } else {
        data[key] = coerceScalar(trimmed);
      }
      i++;
      continue;
    }
    // Block value: consume indented lines as a list.
    const items = [];
    let j = i + 1;
    let currentObj = null;
    while (j < lines.length) {
      const child = lines[j];
      if (/^\s*$/.test(child)) {
        j++;
        continue;
      }
      const indentMatch = /^(\s+)/.exec(child);
      if (!indentMatch) break; // dedent back to a new top-level key
      const listItem = /^\s*-\s*(.*)$/.exec(child);
      if (listItem) {
        const inline = listItem[1];
        const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(inline);
        if (kv) {
          currentObj = { [kv[1]]: coerceScalar(kv[2]) };
          items.push(currentObj);
        } else if (inline.trim() !== '') {
          currentObj = null;
          items.push(coerceScalar(inline));
        } else {
          currentObj = {};
          items.push(currentObj);
        }
        j++;
        continue;
      }
      const contKv = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(child);
      if (contKv && currentObj) {
        currentObj[contKv[1]] = coerceScalar(contKv[2]);
        j++;
        continue;
      }
      break;
    }
    data[key] = items;
    i = j;
  }
  return { data, body };
}

export function loadLessonFiles() {
  const dir = repoPath('src/content/lessons');
  return walkFiles(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const raw = readFileSync(file, 'utf8');
      const { data, body } = parseFrontmatter(raw);
      return { ...data, __body: body, __file: relative(ROOT, file) };
    });
}
