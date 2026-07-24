# 🚗 DMV Prep — Free US Driving Permit Test Practice

The polished, one-stop prep for the US learner's **written (knowledge/permit) driving test**, covering all **50 states + DC**. Practice tests, exam simulators, spaced-repetition flashcards, a road-sign trainer, and the full "how to actually get your permit" process for every state — **free, private, no account, works offline**.

**Live:** https://animeshkundu.github.io/dmv-prep/

> Unofficial study aid. Not affiliated with any state agency. Every question is **original** and grounded in the state's **public driver handbook**, with the handbook section cited. Always verify against your state's official handbook.

## Features

- **Practice tests** — by category, instant feedback, an explanation + citation for every answer.
- **Exam simulator** — matched to each state's real question count, pass mark, and quirks (e.g. NY's road-sign sub-rule).
- **Flashcards (FSRS spaced repetition)** — memorize signs, limits, and rules efficiently.
- **Road-sign trainer** — recognition drills for every sign class.
- **Permit guide** — documents, fees, ages, GDL steps, appointments, and official links per state.
- **Progress dashboard** — mastery, streaks, mock history, all on-device. Export/import as JSON.
- **PWA** — installable, fully offline, mobile-first, WCAG 2.1 AA.

## Tech

Astro (static) · Preact islands · Content Collections + Zod · IndexedDB (`idb-keyval`) + localStorage · `ts-fsrs` · `@vite-pwa` · Vitest + Playwright · GitHub Actions → GitHub Pages.

See [`docs/`](./docs) for the full spec, architecture, design system, content strategy, and infra docs.

## Develop

```bash
npm install
npm run dev              # local dev server
npm run build            # static build to dist/
npm run check            # astro + tsc typecheck
npm run validate:content # editorial + schema checks
npm test                 # unit (Vitest)
npm run test:e2e         # end-to-end (Playwright)
```

## Contributing & corrections

Content accuracy matters. Spot an error, or an official for a takedown request? Open an issue using the **Content correction** template. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

Code: [MIT](./LICENSE). Content: CC BY-NC-SA 4.0 (see [`docs/CONTENT_STRATEGY.md`](./docs/CONTENT_STRATEGY.md)).
