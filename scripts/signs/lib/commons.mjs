export class CommonsLookupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommonsLookupError';
  }
}

const COMMONS_HOST = 'commons.wikimedia.org';

export function commonsTitleFromSourceUrl(sourceUrl) {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new CommonsLookupError(`Invalid Commons source URL: ${sourceUrl}`);
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== COMMONS_HOST || !parsed.pathname.startsWith('/wiki/')) {
    throw new CommonsLookupError(`Source URL is not a Wikimedia Commons file page: ${sourceUrl}`);
  }

  let title;
  try {
    title = decodeURIComponent(parsed.pathname.slice('/wiki/'.length)).replace(/_/g, ' ');
  } catch {
    throw new CommonsLookupError(`Invalid file title in source URL: ${sourceUrl}`);
  }
  if (!/^File:.+\.svg$/i.test(title)) {
    throw new CommonsLookupError(`Source URL must name an SVG file page: ${sourceUrl}`);
  }
  return title;
}

export function commonsApiUrl(title) {
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    prop: 'imageinfo',
    iiprop: 'url',
    titles: title,
  });
  return `https://${COMMONS_HOST}/w/api.php?${query}`;
}

export function imageUrlFromCommonsResponse(payload, title) {
  const page = payload?.query?.pages?.find((candidate) => candidate?.title === title);
  const imageUrl = page?.imageinfo?.[0]?.url;
  if (typeof imageUrl !== 'string') {
    throw new CommonsLookupError(`Commons did not return an image URL for ${title}`);
  }

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new CommonsLookupError(`Commons returned an invalid image URL for ${title}`);
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.endsWith('.wikimedia.org') ||
    !/\.svg(?:$|[?#])/i.test(`${parsed.pathname}${parsed.search}`)
  ) {
    throw new CommonsLookupError(`Commons returned a non-SVG or non-Wikimedia image URL for ${title}`);
  }
  return parsed.href;
}
