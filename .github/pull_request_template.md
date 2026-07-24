## What and why

<!-- Brief description of the change and the problem it solves. -->

## Type

- [ ] Feature / UI
- [ ] Content (questions, state data) — see checklist below
- [ ] Fix
- [ ] Infra / tooling / docs

## Content checklist (if this touches questions or state facts)

- [ ] Questions are original (not copied or closely paraphrased from a real exam or handbook prose)
- [ ] Every item has at least one citation to the state's public handbook or a statute
- [ ] `reviewStatus` reflects reality (`draft` until adversarially verified)
- [ ] `lastVerified` / `effectiveDate` set
- [ ] Ran `npm run validate:content`

## Verification

- [ ] `npm run check` (typecheck) passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
