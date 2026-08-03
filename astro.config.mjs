// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import AstroPWA from '@vite-pwa/astro';

// Deployed to GitHub Pages under a project subpath. The account serves Pages via the
// custom domain animesh.kundus.in, so the canonical origin is that domain (base stays /dmv-prep/).
const SITE = 'https://animesh.kundus.in';
const BASE = '/dmv-prep/';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    preact({ compat: false }),
    sitemap(),
    // The Astro PWA integration precaches the statically generated HTML routes
    // (not just Vite assets), so the whole app works offline once installed.
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'DMV Prep — US Driving Test Practice',
        short_name: 'DMV Prep',
        description:
          'Free practice tests, mock exams, flashcards and the full permit process for all 50 US states + DC.',
        theme_color: '#1f6feb',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the built shell + content. Navigation falls back to the SPA-style
        // index when a route is not precached; real routes are all static HTML.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Banks are fetched on demand so an expanded corpus does not inflate precache.
        globIgnores: ['bank/**/*.json'],
        navigateFallback: `${BASE}404.html`,
        navigateFallbackDenylist: [/\/_/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Match the configured project base rather than a root-relative bank URL.
            urlPattern: new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}bank/[^/]+\\.json$`),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'bank-json',
            },
          },
        ],
      },
    }),
  ],
});
