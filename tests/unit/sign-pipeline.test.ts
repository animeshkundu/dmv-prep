import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commonsApiUrl, commonsTitleFromSourceUrl } from '../../scripts/signs/lib/commons.mjs';
import { normalizeSvg, sha256Svg } from '../../scripts/signs/lib/svg-normalizer.mjs';
import { runSignFetch } from '../../scripts/signs/fetch-signs.mjs';

const sourceUrl = 'https://commons.wikimedia.org/wiki/File:MUTCD_W1-1R.svg';
const title = 'File:MUTCD W1-1R.svg';
const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/a/a1/MUTCD_W1-1R.svg';
const svgFixture = `<?xml version="1.0"?>
<!-- editor comment -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="600px" height="400px" viewBox="0, 0, 600, 400" inkscape:version="1.3">
  <metadata>editor metadata</metadata>
  <path d="M0 0h600v400z"/>
</svg>`;

const fixtureRoots: string[] = [];

async function fixtureManifest(rows: unknown[]) {
  const root = join(process.cwd(), `.sign-pipeline-fixture-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  fixtureRoots.push(root);
  const manifestPath = join(root, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(rows)}\n`);
  return { manifestPath, assetsDir: join(root, 'public', 'signs') };
}

function mockedFetch(svg = svgFixture): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === commonsApiUrl(title)) {
      return new Response(JSON.stringify({ query: { pages: [{ title, imageinfo: [{ url: imageUrl }] }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === imageUrl) return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });
    throw new Error(`unexpected network request: ${url}`);
  }) as typeof fetch;
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sign asset pipeline', () => {
  it('uses the manifest’s Commons title with the MediaWiki API, normalizes SVG bytes, and writes only with --write', async () => {
    const row = { id: 'w1-1-turn-right', status: 'pending', sourceUrl };
    const paths = await fixtureManifest([row]);

    const preview = await runSignFetch({ ...paths, fetchImpl: mockedFetch(), now: () => '2026-08-14' });
    expect(preview.failures).toEqual([]);
    expect(preview.results[0]).toMatchObject({ status: 'pending', sha256: sha256Svg(normalizeSvg(svgFixture)) });
    await expect(readFile(join(paths.assetsDir, 'w1-1-turn-right.svg'), 'utf8')).rejects.toThrow();

    const written = await runSignFetch({ ...paths, write: true, fetchImpl: mockedFetch(), now: () => '2026-08-14' });
    expect(written.failures).toEqual([]);
    const asset = await readFile(join(paths.assetsDir, 'w1-1-turn-right.svg'), 'utf8');
    expect(asset).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><path d="M0 0h600v400z"/></svg>');
    expect(JSON.parse(await readFile(paths.manifestPath, 'utf8'))).toEqual([
      { ...row, status: 'downloaded', assetSha256: sha256Svg(asset), retrieved: '2026-08-14' },
    ]);
  });

  it('is idempotent and never fetches an excluded or already validated asset', async () => {
    const normalized = normalizeSvg(svgFixture);
    const row = { id: 'w1-1-turn-right', status: 'downloaded', sourceUrl, assetSha256: sha256Svg(normalized) };
    const excluded = { id: 'interstate-shield', status: 'excluded', exclusionReason: 'Policy exclusion.' };
    const paths = await fixtureManifest([row, excluded]);
    await mkdir(paths.assetsDir, { recursive: true });
    await writeFile(join(paths.assetsDir, 'w1-1-turn-right.svg'), normalized);

    const outcome = await runSignFetch({
      ...paths,
      write: true,
      fetchImpl: async () => {
        throw new Error('fetch must not be called');
      },
    });
    expect(outcome).toMatchObject({ changed: false, failures: [] });
    expect(outcome.results).toEqual([
      { id: 'w1-1-turn-right', status: 'downloaded', skipped: true },
      { id: 'interstate-shield', status: 'excluded' },
    ]);
  });

  it('rejects unmanifested sources, non-200/non-SVG responses, rasters, and remote references', async () => {
    expect(() => commonsTitleFromSourceUrl('https://example.test/file.svg')).toThrow('Wikimedia Commons file page');
    expect(() => normalizeSvg('<svg viewBox="0 0 1 1"><image href="data:image/png;base64,x"/></svg>')).toThrow('raster');
    expect(() => normalizeSvg('<svg viewBox="0 0 1 1"><use href="https://example.test/a.svg#x"/></svg>')).toThrow('non-local href');

    const paths = await fixtureManifest([{ id: 'w1-1-turn-right', status: 'pending', sourceUrl }]);
    const outcome = await runSignFetch({
      ...paths,
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === commonsApiUrl(title)) {
          return new Response(JSON.stringify({ query: { pages: [{ title, imageinfo: [{ url: imageUrl }] }] } }), { status: 200 });
        }
        return new Response('<svg viewBox="0 0 1 1"/>', { status: 200, headers: { 'content-type': 'text/html' } });
      }) as typeof fetch,
    });
    expect(outcome.failures[0].error).toContain('expected image/svg+xml');
  });
});
