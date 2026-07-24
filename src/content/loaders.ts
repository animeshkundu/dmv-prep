import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Loader } from 'astro/loaders';

/**
 * Loads a collection from multiple JSON files where EACH FILE is an array of entries
 * (each entry carrying its own `id`). This keeps content maintainable (e.g. one file
 * per state's question bank) instead of thousands of one-object files, while still
 * getting per-entry Zod validation and change detection from the content layer.
 */
export function arrayJsonLoader(baseDir: string): Loader {
  return {
    name: 'array-json-loader',
    async load({ store, parseData, logger, generateDigest }) {
      const root = new URL(`../../${baseDir}/`, import.meta.url).pathname;
      let files: string[] = [];
      try {
        files = walk(root).filter((f) => f.endsWith('.json'));
      } catch {
        logger.warn(`[array-json-loader] directory not found: ${baseDir}`);
        return;
      }
      store.clear();
      let count = 0;
      for (const file of files) {
        let raw: unknown;
        try {
          raw = JSON.parse(readFileSync(file, 'utf8'));
        } catch (e) {
          throw new Error(`[array-json-loader] invalid JSON in ${relative(root, file)}: ${String(e)}`);
        }
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items as Array<Record<string, unknown>>) {
          const id = String(item.id ?? '');
          if (!id) throw new Error(`[array-json-loader] entry missing "id" in ${relative(root, file)}`);
          const data = await parseData({ id, data: item });
          const digest = generateDigest(data);
          store.set({ id, data, digest });
          count++;
        }
      }
      logger.info(`[array-json-loader] loaded ${count} entries from ${baseDir}`);
    },
  };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
