#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/content-io.mjs';
import {
  SourceExtractionUnsupportedError,
  hashResponseSource,
} from './lib/source-normalizer.mjs';

const DEFAULT_STATES_DIR = join(ROOT, 'src/content/states');
const DEFAULT_QUESTIONS_DIR = join(ROOT, 'src/content/questions');
const DEFAULT_SOURCES_DIR = join(ROOT, 'src/content/sources');

async function jsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return jsonFiles(path);
      return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

async function readRecords(dir) {
  const files = await jsonFiles(dir);
  return Promise.all(
    files.map(async (file) => ({ file, data: JSON.parse(await readFile(file, 'utf8')) })),
  );
}

function urlsFromReferences(references) {
  return (Array.isArray(references) ? references : [])
    .map((reference) => reference?.url)
    .filter((url) => typeof url === 'string' && url.length > 0);
}

function urlsFromTypedFacts(typedFacts) {
  return Object.values(typedFacts ?? [])
    .map((fact) => fact?.citation?.url)
    .filter((url) => typeof url === 'string' && url.length > 0);
}

/**
 * Associate citations with the states to which they apply, while returning a
 * global deduplicated fetch set. National question citations are recorded for
 * each state but still fetched only once.
 */
export function collectSourcePlan(states, questions) {
  const byState = new Map();
  const allUrls = new Set();
  const knownCodes = new Set(states.map((state) => state.code));

  const add = (code, url, handbook = false) => {
    if (!code || !url) return;
    const entries = byState.get(code) ?? new Map();
    entries.set(url, { url, handbook: entries.get(url)?.handbook || handbook });
    byState.set(code, entries);
    allUrls.add(url);
  };

  for (const state of states) {
    const handbookUrl = state.handbookPdfUrl || state.handbookLandingUrl;
    add(state.code, handbookUrl, true);
    for (const url of [...urlsFromReferences(state.references), ...urlsFromTypedFacts(state.typedFacts)]) {
      add(state.code, url);
    }
  }

  for (const question of questions) {
    const urls = urlsFromReferences(question.references);
    const codes = question.stateScope === 'all' ? [...knownCodes] : question.stateScope;
    if (!Array.isArray(codes)) continue;
    for (const code of codes) {
      if (!knownCodes.has(code)) continue;
      for (const url of urls) add(code, url);
    }
  }

  return { allUrls: [...allUrls].sort(), byState };
}

export async function fetchSource(url, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    return { url, error: `fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) return { url, status: response.status, error: `HTTP ${response.status}` };

  try {
    return {
      url,
      status: response.status,
      contentType: response.headers.get('content-type')?.split(';', 1)[0] ?? undefined,
      sha256: await hashResponseSource(response, url),
    };
  } catch (error) {
    const prefix = error instanceof SourceExtractionUnsupportedError ? 'unsupported: ' : 'extraction failed: ';
    return {
      url,
      status: response.status,
      contentType: response.headers.get('content-type')?.split(';', 1)[0] ?? undefined,
      error: `${prefix}${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function sourceMetadata(state, entries, fetched) {
  const sources = [...entries.values()]
    .map(({ url, handbook }) => {
      const result = fetched.get(url);
      const metadata = {
        url,
        ...(handbook ? { handbook: true } : {}),
        ...(result?.sha256 ? { sha256: result.sha256 } : {}),
        ...(result?.contentType ? { contentType: result.contentType } : {}),
        ...(result?.status ? { status: result.status } : {}),
        ...(result?.error ? { error: result.error } : {}),
      };
      return metadata;
    })
    .sort((a, b) => a.url.localeCompare(b.url));
  const handbook = sources.find((source) => source.handbook);
  return {
    state: state.code,
    sources,
    ...(handbook?.sha256 ? { handbookSnapshotHash: handbook.sha256 } : {}),
  };
}

async function writeStateSnapshotHash(file, state, handbookHash) {
  if (!handbookHash || state.sourceSnapshotHash === handbookHash) return;
  const next = { ...state, sourceSnapshotHash: handbookHash };
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
}

export async function runSourceFetch({
  statesDir = DEFAULT_STATES_DIR,
  questionsDir = DEFAULT_QUESTIONS_DIR,
  sourcesDir = DEFAULT_SOURCES_DIR,
  write = false,
  stateCodes,
  fetchImpl = fetch,
} = {}) {
  const stateRecords = (await readRecords(statesDir)).filter(
    ({ data }) => !stateCodes || stateCodes.has(data.code),
  );
  const questions = (await readRecords(questionsDir)).flatMap(({ data }) => (Array.isArray(data) ? data : [data]));
  const states = stateRecords.map(({ data }) => data);
  const plan = collectSourcePlan(states, questions);
  const fetched = new Map(
    await Promise.all(plan.allUrls.map(async (url) => [url, await fetchSource(url, fetchImpl)])),
  );

  const results = [];
  for (const { file, data: state } of stateRecords) {
    const metadata = sourceMetadata(state, plan.byState.get(state.code) ?? new Map(), fetched);
    const handbookHash = metadata.handbookSnapshotHash;
    results.push(metadata);
    if (write) {
      await mkdir(sourcesDir, { recursive: true });
      await writeFile(join(sourcesDir, `${state.code.toLowerCase()}.sources.json`), `${JSON.stringify(metadata, null, 2)}\n`);
      // Fetching only establishes a source snapshot. It must never invent an
      // effective date or imply that a state/fact was re-verified.
      await writeStateSnapshotHash(file, state, handbookHash);
    }
  }
  const failures = [...fetched.values()].filter((result) => result.error);
  return { results, fetched: [...fetched.values()], failures };
}

function parseArgs(argv) {
  const stateCodes = new Set();
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--state' && argv[index + 1]) stateCodes.add(argv[++index].toUpperCase());
  }
  return {
    write: argv.includes('--write'),
    stateCodes: stateCodes.size ? stateCodes : undefined,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { results, failures } = await runSourceFetch(parseArgs(argv));
  for (const result of results) {
    const sourceCount = result.sources.length;
    const hash = result.handbookSnapshotHash ? ` handbook=${result.handbookSnapshotHash}` : ' handbook=unavailable';
    console.log(`${result.state}: ${sourceCount} source(s),${hash}`);
  }
  if (failures.length) {
    for (const failure of failures) console.error(`Source error: ${failure.url}: ${failure.error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
