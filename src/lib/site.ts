/**
 * Base-aware URL helpers. Under a GitHub Pages project subpath (/dmv-prep/) every
 * internal link and asset must be prefixed with import.meta.env.BASE_URL, otherwise
 * it resolves against the domain root and 404s. Always route internal hrefs through
 * `href()` and asset paths through `assetUrl()`.
 */
const BASE = import.meta.env.BASE_URL; // e.g. "/dmv-prep/"

function join(path: string): string {
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** Internal page href, e.g. href('/state/ca') -> '/dmv-prep/state/ca'. */
export const href = (path: string): string => join(path);

/** Static asset in public/, e.g. assetUrl('/icons/icon-192.png'). */
export const assetUrl = (path: string): string => join(path);

/** Backward-compatible alias for assetUrl(). */
export const asset = assetUrl;

export const SITE_NAME = 'DMV Prep';
export const SITE_TAGLINE = 'Free US driving permit test practice, all 50 states + DC';
