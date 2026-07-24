# Privacy Policy

**Short version:** DMV Prep has no accounts and no server that stores your data. Your study progress lives on your own device and is never sent to us. We use privacy-respecting analytics to understand and improve the experience, and those set cookies only after you consent.

Last reviewed: 2026-07-24.

---

## No accounts

There is no sign-up, no login, no email collection. You can use every feature without giving us any personal information.

## Your progress stays on your device

All of your study data is stored locally in your browser:

- **IndexedDB** (via `idb-keyval`): practice/mock progress, weak-area (Challenge Bank) items, spaced-repetition (FSRS) flashcard schedules, and mock-exam history.
- **localStorage**: your settings (theme, chosen state, language, session size, and your analytics consent choice).

This data never leaves your device and is never transmitted to a server. Because there is no backend, we literally cannot see it. If you clear your browser storage, or use private/incognito mode, this data may be cleared by your browser.

## Backup and transfer: export / import

Since there are no accounts, the only way to back up or move your progress between devices is the built-in **Export** (download a JSON file) and **Import** (load it elsewhere). You control that file. We never receive it.

## Analytics

To understand what works and fix friction, we use:

- **Microsoft Clarity** (primary): aggregate behavior and friction signals such as heatmaps, session replay, and rage/dead-click detection. This helps us find confusing screens and broken flows.
- **Google Analytics 4** (optional): acquisition and funnel measurement.

These tools set cookies and are loaded **only after you accept** via the consent banner. If you decline, they are not loaded and no analytics cookies are set. Analytics never includes your on-device study data (your answers, schedules, and history stay local).

### How to opt out or change your choice

- Use the consent banner to decline, or change your choice later from the privacy/settings link.
- Your consent choice is stored locally so we remember it.
- You can also block cookies or use your browser's tracking protection; the app still works fully.

We do not sell your data. We do not build advertising profiles.

## Cookies summary

| Purpose | Set by | When | Optional |
|---|---|---|---|
| Analytics (behavior/friction) | Microsoft Clarity | After consent | Yes |
| Analytics (acquisition/funnels) | Google Analytics 4 | After consent, if enabled | Yes |
| Your settings & consent choice | The app (localStorage, not a cookie) | Always (functional) | n/a |

Study progress uses IndexedDB/localStorage, not cookies, and is never sent anywhere.

## Children

The app is a general-audience study aid. It collects no personal information and requires no account. On-device progress and consented analytics are the only data involved.

## Changes

If this policy changes, we will update this page and the "last reviewed" date. Material changes to analytics behavior will be reflected in the consent banner.

## Contact and corrections

Questions, privacy concerns, or content corrections: open an issue (see [Contributing](./CONTRIBUTING.md)). Related: [Disclaimer](./docs/DISCLAIMER.md) · [Content Strategy](./docs/CONTENT_STRATEGY.md).
