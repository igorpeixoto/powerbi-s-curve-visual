---
name: add-format-setting
description: Use when adding a Format pane option to this visual, such as a new toggle, number, colour, dropdown or per-measure setting. Lists every file the change touches, so the contract, strings and tests stay in step.
---

# Add a Format pane setting

The contract is public: once a property ships, it's stored in reports and can't be renamed (`CLAUDE.md`, Hard Rule #5). Choose the name carefully, then work through these in order.

1. **`SPEC.md`**: add the property to its card in §9.3, describe its behaviour in the section it belongs to, update the control count in §9.1, and add a numbered entry to §13 if a decision was made.
2. **`src/settings.ts`**: add the slice to its group, with `displayNameKey: resourceKey("paneSomething")`.
   - Names must be unique across the card, because a card is one object in `capabilities.json`.
   - Number boxes take `options: range(LIMITS.something)`.
   - Dropdown items hold a string key: `["value", "enumSomething"]`.
   - A slice that differs by row kind needs one property per kind, because a measure in two wells is one column.
3. **`capabilities.json`**: add the property to the card's `objects` entry.
4. **Strings**: add the text to `defaultStrings` in `src/render/strings.ts` and to both `stringResources/en-US` and `pt-BR` as `Visual_<key>`. Ask the maintainer to review new Portuguese.
5. **`src/format/toRenderOptions.ts`**: convert it to renderer units, clamping with `LIMITS`, and add it to `RenderOptions` and `defaultRenderOptions` in `src/render/options.ts`. Pass colours only when explicit, so the theme still applies.
6. **`src/format/presets.ts`**: only if a preset should override it.
7. **The renderer**: read it from `scene.options`. Don't read saved formatting anywhere else.
8. **Tests**: a unit test in `src/format/__tests__`, and a harness assertion in `harness/format.mjs` that the setting changes what's drawn. A behavioural change without a harness check is incomplete.
9. **`CHANGELOG.md`**: one line under `[Unreleased]`.

Then run `npm test`. Break the new behaviour on purpose once and confirm that the new check fails, then restore it and run `npm test` again, so `dist/` isn't left with the broken build.

Tell the maintainer what still needs checking in Desktop: the harness doesn't cover how the pane looks or how the value saves. Use the `check-in-desktop` skill.
