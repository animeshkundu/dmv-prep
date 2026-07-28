import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export class SourceExtractionUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceExtractionUnsupportedError';
  }
}

function decodeHtmlEntities(text) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  const decodeCodePoint = (match, value, radix) => {
    const codePoint = Number.parseInt(value, radix);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (match, value) => decodeCodePoint(match, value, 16))
    .replace(/&#(\d+);/g, (match, value) => decodeCodePoint(match, value, 10))
    .replace(/&([a-z]+);/gi, (match, name) => {
      const key = name.toLowerCase();
      return Object.hasOwn(named, key) ? named[key] : match;
    });
}

/** Extract readable text without retaining the fetched document. */
export function extractHtmlText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|noscript|template|header|footer|nav)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(address|article|div|footer|h[1-6]|header|li|main|p|section|table|tr|ul)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

function stripRepeatedPageFurniture(text) {
  const pages = text.split(/\f/);
  if (pages.length < 2) return text;

  const occurrences = new Map();
  const pageLines = pages.map((page) => {
    const unique = new Set(
      page
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length >= 3 && line.length <= 160),
    );
    for (const line of unique) occurrences.set(line, (occurrences.get(line) ?? 0) + 1);
    return unique;
  });
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  const repeated = new Set([...occurrences].filter(([, count]) => count >= threshold).map(([line]) => line));

  return pages
    .map((page, index) =>
      page
        .split(/\r?\n/)
        .filter((line) => !repeated.has(line.trim().replace(/\s+/g, ' ')) || !pageLines[index].has(line.trim().replace(/\s+/g, ' ')))
        .join('\n'),
    )
    .join('\n');
}

/**
 * Produce a stable, non-prose snapshot input. Source documents are deliberately
 * normalised before hashing, so layout-only PDF/HTML changes do not create drift.
 */
export function normalizeSourceText(text) {
  if (typeof text !== 'string') throw new TypeError('Source text must be a string');
  const withoutFurniture = stripRepeatedPageFurniture(text)
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, ' ')
    .replace(/^\s*(?:page\s*)?\d+\s*(?:of\s*\d+)?\s*$/gim, ' ')
    .replace(/^\s*[-–—]?\s*page\s+\d+\s*[-–—]?\s*$/gim, ' ');

  return withoutFurniture.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hashNormalizedSourceText(text) {
  return createHash('sha256').update(normalizeSourceText(text)).digest('hex');
}

export function extractPdfText(bytes, command = 'pdftotext') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new SourceExtractionUnsupportedError(
          'PDF text extraction requires the pdftotext executable; refusing to hash raw PDF bytes.',
        ));
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pdftotext failed (${code}): ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString('utf8'));
    });
    child.stdin.end(Buffer.from(bytes));
  });
}

/**
 * Extract textual source material from a fetch Response. PDF parsing is
 * intentionally not improvised: callers must surface this error until a real
 * text extractor is available, rather than hash volatile PDF bytes.
 */
export async function extractTextFromResponse(response, url = response.url) {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() ?? '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isPdf =
    contentType === 'application/pdf' ||
    /\.pdf(?:$|[?#])/i.test(url ?? '') ||
    (bytes.length >= 4 && new TextDecoder('ascii').decode(bytes.slice(0, 4)) === '%PDF');

  if (isPdf) {
    return extractPdfText(bytes);
  }
  if (contentType && !contentType.startsWith('text/') && !['application/xhtml+xml', 'application/xml'].includes(contentType)) {
    throw new SourceExtractionUnsupportedError(
      `Unsupported source content type "${contentType}" for ${url ?? 'this source'}; refusing to hash raw bytes.`,
    );
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return /html|xhtml/.test(contentType) || /<\s*html[\s>]/i.test(text) ? extractHtmlText(text) : text;
}

export async function hashResponseSource(response, url = response.url) {
  const text = await extractTextFromResponse(response, url);
  const normalized = normalizeSourceText(text);
  if (!normalized) {
    throw new Error(`No extractable text was found for ${url ?? 'this source'}; refusing to hash an empty source.`);
  }
  return createHash('sha256').update(normalized).digest('hex');
}

export const normaliseSourceText = normalizeSourceText;
