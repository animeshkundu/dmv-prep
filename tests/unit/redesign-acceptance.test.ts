import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, beforeAll, test } from 'vitest';

describe('redesigned product integration', () => {
  beforeAll(() => {
    const buildEnvironment = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      CI: process.env.CI ?? '',
      npm_config_cache: process.env.npm_config_cache ?? '',
    };
    execFileSync('npm', ['run', 'build'], {
      cwd: process.cwd(),
      env: buildEnvironment,
      stdio: 'pipe',
      timeout: 120_000,
    });
  }, 120_000);

  test('ships the state-first landing journey with complete SEO metadata', () => {
    const home = readFileSync('dist/index.html', 'utf8');
    const robots = readFileSync('dist/robots.txt', 'utf8');

    expect(home).toContain('Know the road.');
    expect(home).toContain('id="state-search"');
    expect(home).toContain('href="/dmv-prep/state/ca"');
    expect(home).toContain('id="menu-toggle"');
    expect(home).toContain(
      '<link rel="canonical" href="https://animesh.kundus.in/dmv-prep/">',
    );
    expect(home).toContain('<meta property="og:url"');
    expect(home).toContain('<meta name="twitter:card" content="summary">');
    expect(home).toContain('"@type":"FAQPage"');
    expect(robots).toContain(
      'Sitemap: https://animesh.kundus.in/dmv-prep/sitemap-index.xml',
    );
  });

  test('ships focused practice through the real state route', () => {
    const practice = readFileSync('dist/state/ca/practice/index.html', 'utf8');

    expect(practice).toContain('California DMV practice test');
    expect(practice).toContain('id="practice-category"');
    expect(practice).toContain('aria-label="Practice quiz"');
    expect(practice).toContain('Challenge Bank');
    expect(practice).toContain('"@type":"Quiz"');
  });
});
