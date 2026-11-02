---
name: check-in-desktop
description: Use when a change to this visual needs to be seen in Power BI Desktop. Covers putting a clean build into a PBIP report without going through import, and how to report what was and wasn't observed.
---

# Check a build in Power BI Desktop

A green `npm test` proves the mock host's behaviour, not the real one's. This loads a build into a report so the maintainer can look at it.

1. **Build from clean source.** Run `npm test` with no uncommitted mutation in `src/`. Don't use a `dist/` left behind by a mutation check.
2. **Stop any dev server.** `pbiviz start` rewrites the plugin with a `_DEBUG` name, and a package built during it is wrong. On Windows, stopping `npx pbiviz start` can leave a node process on port 8080; kill it explicitly.
3. **Ask the maintainer to close the report.** Desktop overwrites PBIP files when it saves, so never edit them while that report is open. Other Desktop windows can stay open.
4. **Check the build.** `dist/resources/<guid>.pbiviz.json` must not contain `_DEBUG`, and must contain what you just added.
5. **Copy it** over `<Report>.Report/CustomVisuals/<guid>/resources/<guid>.pbiviz.json`, and confirm the hashes match. For this repo's sample report, use `npm run sample:sync` instead, and only when the sample should really move to this build.
6. **Reopen** the `.pbip`, and give the maintainer specific things to try, one per line, including saving and reopening when saved values matter.

Installing the dev certificate and enabling Developer Mode are the maintainer's actions. Never run them.

## Reporting

Say what was actually seen, separately from what was only tested in the harness. Record it in `docs/BUILD_LOG.md`, and update the Status column in `TESTING.md`. "Not observed" is a fine result; a passing harness is never evidence for it.
