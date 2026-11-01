# Build log

How this visual was built, session by session: what the AI (Claude Code) did and what I did. The README's "How it was built" section is summarised from here.

## 2026-11-01: Phase 0 (scaffold, tests and CI first)
- Time: TODO(igor) h
- AI did: scaffolded the visual with `pbiviz new` (powerbi-visuals-tools 7.2.1, API 5.11.1); set metadata, version 0.1.0 and a fresh GUID; enabled TypeScript strict mode; set up ESLint (Power BI visuals rules + typescript-eslint on `src/`, plain JS rules on tooling); added Vitest, a Puppeteer harness that loads the JS and CSS from the packaged `.pbiviz.json` into a mock Power BI host, and `tools/check-capabilities.mjs` (TypeScript compiler API parity check between `settings.ts` and `capabilities.json`); wrote the CI and tag-driven release workflows, LICENSE, CHANGELOG stub and governance files; proved the capability check and the harness runner exit 1 on failure.
- I did: chose the identity (personal GitHub account, noreply commit email), kept the rebuild plan out of git, chose Node 24 LTS for CI instead of the planned Node 20 (end-of-life since April 2026), and asked for my own Power BI visual governance skills to be applied. TODO(igor): anything else.
- Where it got stuck / how it was unblocked: strict mode broke the wrapper `pbiviz` generates (it passes constructor options as optional), fixed by accepting optional options in the constructor and throwing if missing. The first harness run failed on a favicon 404 logged as a console error, fixed in the harness page. `pbiviz start` can't create its dev certificate without PowerShell 7, so the headless harness is the render check for now.
- Tests: 2 unit, 6 harness checks, capability parity green, lint clean. CI not yet run (no remote yet).
