# Releasing: Physical Progress S-Curve

Release system: **git tags + changelog + one `.pbiviz` binary per tag**, built and attached by `.github/workflows/release.yml`. No release branches.

## The Invariant

**One version, three places, one binary.** `package.json` `version` (`X.Y.Z`), `pbiviz.json` `visual.version` (`X.Y.Z.0`), the `CHANGELOG.md` heading and the git tag `vX.Y.Z` are the same number, and the `.pbiviz` attached to that tag's GitHub Release is the only build anyone may import. The release workflow refuses to publish when the tag and the two manifests disagree, or when `CHANGELOG.md` has no section for the version.

## Workflow (every release)

```bash
# 1. Green locally, from a clean install:
npm ci && npm test
#    The harness covers data shapes; the manual checklist in TESTING.md (real cross-filtering,
#    theme switch, high contrast, Format pane as an author sees it) is still a human step.

# 2. Bump the version in ONE commit with the changelog heading:
#    - package.json → "version": "X.Y.Z"
#    - pbiviz.json  → "visual": { "version": "X.Y.Z.0" } and top-level "version": "X.Y.Z.0"
#    - CHANGELOG.md → rename [Unreleased] to ## [X.Y.Z] - YYYY-MM-DD, open a fresh one above
git add package.json pbiviz.json CHANGELOG.md && git commit -m "Release vX.Y.Z"

# 3. Tag and push (only with the maintainer's explicit approval):
git tag -a vX.Y.Z -m "Short release summary"
git push origin main vX.Y.Z

# 4. release.yml runs npm test, packages, and creates the GitHub Release with the .pbiviz
#    attached and the CHANGELOG section as notes. Confirm it finished green.
```

## Version Numbering (Visual-Adapted Semver)

Severity is what breaks in a **consuming report**, not how much code changed.

| Bump | When |
|------|------|
| MAJOR | Data role or formatting property removed/renamed; `dataViewMappings` shape changed; `apiVersion` bump; a rendering change that alters the meaning of published numbers. Every existing report needs attention, so say exactly what in the changelog entry. |
| MINOR | New optional data role, new formatting card/group/property, new rendering capability. Existing bindings and saved settings keep working. |
| PATCH | Rendering fixes, default corrections, `displayName`/label fixes, performance, dependency bumps with no contract change. |

## Rollback

Download the previous release's `.pbiviz` from GitHub Releases and import it over the current one. Re-importing restores the previous behavior **as long as the GUID never changed** (CLAUDE.md Hard Rule #1): bindings and saved formatting are keyed by GUID and property name. If a MAJOR release renamed a property, rolling back does *not* bring back the settings that release discarded.

## Notes

- The Power BI org store refuses to replace an imported visual with a **lower** `visual.version`. A rollback that must go through the store needs a new higher version carrying the old code.
- `pbiviz package` stamps the version from `pbiviz.json` into the binary: bump before tagging, never after.
