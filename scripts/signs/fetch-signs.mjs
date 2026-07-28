#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../content/lib/content-io.mjs';
import { commonsApiUrl, commonsTitleFromSourceUrl, imageUrlFromCommonsResponse } from './lib/commons.mjs';
import { normalizeSvg, sha256Svg } from './lib/svg-normalizer.mjs';

const MANIFEST_PATH = join(ROOT, 'src/content/sign-manifest/manifest.json');
const ASSETS_DIR = join(ROOT, 'public/signs');
const STATUSES = new Set(['downloaded', 'pending', 'excluded']);

function assetPath(assetDir, id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    throw new Error(`Invalid sign id in manifest: ${JSON.stringify(id)}`);
  }
  return join(assetDir, `${id}.svg`);
}

function contentType(response) {
  return response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
}

function validateManifest(manifest) {
  if (!Array.isArray(manifest)) throw new Error('Sign manifest must be a JSON array');
  for (const row of manifest) {
    if (!row || typeof row !== 'object' || !STATUSES.has(row.status)) {
      throw new Error(`Invalid sign manifest row: ${JSON.stringify(row)}`);
    }
    assetPath('', row.id);
    if (row.status === 'excluded') {
      if (typeof row.exclusionReason !== 'string' || !row.exclusionReason.trim()) {
        throw new Error(`${row.id}: excluded rows require an exclusionReason`);
      }
      continue;
    }
    commonsTitleFromSourceUrl(row.sourceUrl);
  }
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  if (response.status !== 200) throw new Error(`Commons API returned HTTP ${response.status}`);
  return response.json();
}

export async function fetchManifestAsset(row, fetchImpl = fetch) {
  const title = commonsTitleFromSourceUrl(row.sourceUrl);
  const payload = await fetchJson(commonsApiUrl(title), fetchImpl);
  const imageUrl = imageUrlFromCommonsResponse(payload, title);
  const response = await fetchImpl(imageUrl, { redirect: 'follow' });
  if (response.status !== 200) throw new Error(`${row.id}: SVG download returned HTTP ${response.status}`);
  if (contentType(response) !== 'image/svg+xml') {
    throw new Error(`${row.id}: expected image/svg+xml, received ${contentType(response) ?? 'no content type'}`);
  }
  const source = new TextDecoder('utf-8', { fatal: false }).decode(await response.arrayBuffer());
  const svg = normalizeSvg(source);
  return { svg, sha256: sha256Svg(svg), title, imageUrl };
}

async function validateDownloadedAsset(row, assetsDir) {
  const path = assetPath(assetsDir, row.id);
  const source = await readFile(path, 'utf8');
  const svg = normalizeSvg(source);
  if (source !== svg) throw new Error(`${row.id}: on-disk SVG is not normalized`);
  const sha256 = sha256Svg(svg);
  if (row.assetSha256 !== sha256) throw new Error(`${row.id}: on-disk SVG does not match manifest assetSha256`);
  return { path, sha256 };
}

/**
 * Fetch only the file pages declared in the licence manifest. Pending rows are
 * promoted after their normalized asset has been written and read back intact.
 */
export async function runSignFetch({
  manifestPath = MANIFEST_PATH,
  assetsDir = ASSETS_DIR,
  write = false,
  fetchImpl = fetch,
  now = () => new Date().toISOString().slice(0, 10),
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateManifest(manifest);
  const results = [];
  let changed = false;

  for (const row of manifest) {
    if (row.status === 'excluded') {
      results.push({ id: row.id, status: 'excluded' });
      continue;
    }

    if (row.status === 'downloaded') {
      try {
        await validateDownloadedAsset(row, assetsDir);
        results.push({ id: row.id, status: 'downloaded', skipped: true });
      } catch (error) {
        results.push({ id: row.id, status: 'error', error: error.message });
      }
      continue;
    }

    try {
      const asset = await fetchManifestAsset(row, fetchImpl);
      const path = assetPath(assetsDir, row.id);
      if (write) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, asset.svg, 'utf8');
        const persisted = await validateDownloadedAsset({ ...row, assetSha256: asset.sha256 }, assetsDir);
        row.status = 'downloaded';
        row.assetSha256 = persisted.sha256;
        row.retrieved = now();
        changed = true;
      }
      results.push({ id: row.id, status: write ? 'downloaded' : 'pending', sha256: asset.sha256 });
    } catch (error) {
      results.push({ id: row.id, status: 'error', error: error.message });
    }
  }

  if (write && changed) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { results, changed, failures: results.filter((result) => result.status === 'error') };
}

function parseArgs(argv) {
  if (argv.some((arg) => arg !== '--write')) {
    throw new Error('Only --write is supported; URLs, titles, and sign codes must come from the manifest.');
  }
  return { write: argv.includes('--write') };
}

export async function main(argv = process.argv.slice(2)) {
  const outcome = await runSignFetch(parseArgs(argv));
  for (const result of outcome.results) {
    const detail = result.error ? `: ${result.error}` : result.skipped ? ' (already valid)' : '';
    console.log(`${result.id}: ${result.status}${detail}`);
  }
  if (outcome.failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
