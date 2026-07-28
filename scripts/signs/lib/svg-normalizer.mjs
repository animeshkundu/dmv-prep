import { createHash } from 'node:crypto';

export class SvgNormalizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SvgNormalizationError';
  }
}

const editorPrefixes = '(?:inkscape|sodipodi|adobe|sketch)';
const externalReference = /^(?:https?:)?\/\//i;
const attribute = `("[^"]*"|'[^']*'|[^\\s>]+)`;

function attributeValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function rejectUnsafeReferences(svg) {
  const attributePattern = /\b(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  for (const match of svg.matchAll(attributePattern)) {
    const value = attributeValue(match[1]);
    if (externalReference.test(value) || /^(?:data|javascript):/i.test(value)) {
      throw new SvgNormalizationError(`SVG contains a non-local href: ${value}`);
    }
  }

  const cssUrlPattern = /url\(\s*("[^"]*"|'[^']*'|[^)\s]+)\s*\)/gi;
  for (const match of svg.matchAll(cssUrlPattern)) {
    const value = attributeValue(match[1]);
    if (externalReference.test(value) || /^(?:data|javascript):/i.test(value)) {
      throw new SvgNormalizationError(`SVG contains a non-local CSS URL: ${value}`);
    }
  }
}

function normaliseViewBox(attributes) {
  const viewBox = new RegExp(`\\sviewBox\\s*=\\s*${attribute}`, 'i').exec(attributes);
  if (!viewBox) throw new SvgNormalizationError('SVG has no viewBox');

  const values = attributeValue(viewBox[1]).trim().split(/[\s,]+/);
  if (
    values.length !== 4 ||
    values.some((value) => !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
  ) {
    throw new SvgNormalizationError('SVG has an invalid viewBox');
  }

  const canonical = values.map((value) => String(Number(value))).join(' ');
  return attributes
    .replace(new RegExp(`\\s(?:width|height)\\s*=\\s*${attribute}`, 'gi'), '')
    .replace(new RegExp(`\\sviewBox\\s*=\\s*${attribute}`, 'i'), ` viewBox="${canonical}"`);
}

/**
 * Produce a self-contained, responsive SVG with stable bytes for hashing.
 * This intentionally is not a general SVG sanitizer; unsupported active or
 * external constructs are rejected rather than retained.
 */
export function normalizeSvg(source) {
  if (typeof source !== 'string') throw new TypeError('SVG source must be a string');

  let svg = source
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata\s*>/gi, '')
    .replace(/<metadata\b[^>]*\/\s*>/gi, '')
    .replace(/<(?:inkscape|sodipodi|adobe|sketch):[\w.-]+\b[^>]*>[\s\S]*?<\/(?:inkscape|sodipodi|adobe|sketch):[\w.-]+\s*>/gi, '')
    .replace(/<(?:inkscape|sodipodi|adobe|sketch):[\w.-]+\b[^>]*\/\s*>/gi, '')
    .replace(new RegExp(`\\sxmlns:${editorPrefixes}\\s*=\\s*${attribute}`, 'gi'), '')
    .replace(new RegExp(`\\s${editorPrefixes}:[\\w.-]+\\s*=\\s*${attribute}`, 'gi'), '');

  if (/<!(?:doctype|entity)\b/i.test(svg)) {
    throw new SvgNormalizationError('SVG declarations and entities are not supported');
  }
  if (/<(?:script|foreignObject|image|feImage)\b/i.test(svg)) {
    throw new SvgNormalizationError('SVG contains an unsupported active or raster element');
  }
  rejectUnsafeReferences(svg);

  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (!root || !/^\s*<svg\b/i.test(svg)) throw new SvgNormalizationError('SVG root element is missing');
  const attributes = normaliseViewBox(root[1]);
  svg = `${svg.slice(0, root.index)}<svg${attributes}>${svg.slice(root.index + root[0].length)}`;

  return svg.replace(/\r\n?/g, '\n').replace(/>\s+</g, '><').trim();
}

export function sha256Svg(svg) {
  return createHash('sha256').update(svg, 'utf8').digest('hex');
}
