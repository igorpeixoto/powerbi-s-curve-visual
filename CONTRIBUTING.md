# Contributing

Bug reports and feature requests are welcome in [GitHub Issues](https://github.com/igorpeixoto/powerbi-s-curve-visual/issues). For anything larger than a small fix, please open an issue first, so we can agree on the behaviour before you write it.

## Setup

Requires Node 24 and Python 3.

```bash
npm ci
npm test
```

## Rules that matter

- **The contract comes first.** Behaviour lives in [SPEC.md](SPEC.md). A change to what the visual does starts there.
- **Never rename or retype a data role, card or property, and never change the GUID.** They're stored in every report that uses the visual, and a rename silently resets authors' settings. Add a new property instead.
- **Every behaviour change needs a test.** Pure logic gets a unit test, and rendering or interaction gets a harness check. If a test fails, fix the code, not the test.
- **Nothing hardcoded that belongs to the report:** no fixed colours (use the theme), field names or locale formats.
- **English everywhere**, in code, comments, docs and commit messages. Portuguese belongs only in `stringResources/pt-BR`.
- **New strings** go in `defaultStrings` in `src/render/strings.ts` and in both `stringResources` files.
- **Synthetic data only.** Please don't paste real project data into issues, tests or samples.

A green `npm test` doesn't cover everything: [TESTING.md](TESTING.md) lists what has to be checked by hand in Power BI. Please say in your pull request what you checked.

For how the code fits together, see [ARCHITECTURE.md](ARCHITECTURE.md). For consumer-visible changes, add a line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
