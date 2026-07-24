import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Guards the WCAG 2.1 AA bar on representative pages: static content, a data-driven
// state hub, an interactive quiz island, and the permit-process page. Fails CI on any
// serious or critical violation. Automated axe is a floor, not a full AA guarantee;
// manual keyboard/screen-reader review still applies (see docs/DESIGN_SYSTEM.md).
const pages = [
  ['home', './'],
  ['states', './states'],
  ['state hub', './state/ca'],
  ['practice', './state/ca/practice'],
  ['guide', './state/ca/guide'],
];

for (const [name, path] of pages) {
  test(`no serious/critical a11y violations: ${name}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const seriousOrWorse = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(seriousOrWorse, JSON.stringify(seriousOrWorse.map((v) => v.id))).toEqual([]);
  });
}
