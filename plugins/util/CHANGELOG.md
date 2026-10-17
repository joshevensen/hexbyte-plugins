# Changelog

Tracks the `util` plugin's `version` in `.claude-plugin/plugin.json`. Bump that field with every change you want installed copies to receive — Claude Code caches plugins by version, so pushing commits alone does not update anyone already on a pinned version. Follow [semver](https://semver.org): MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

## [0.3.2]

### Fixed
- `list`, `push`, `bump`, and `setup` no longer call GraphQL-backed `gh`
  subcommands, which return HTTP 403 in Claude Code on the web. They use the
  new REST-only `scripts/gh-rest` helper (a copy of the one shipped with `orc`).
  `bump` now matches Dependabot PRs by the REST login `dependabot[bot]`
- The access check is `gh-rest preflight`: it tests real repo access with
  `gh api` instead of `gh auth status` (which falsely fails on the web) and
  caches the result for 10 minutes

## [0.3.1]

### Fixed
- `/util:setup` now works in Claude Code on the web, where GitHub GraphQL is
  blocked (HTTP 403): preflight checks real access with `gh api` instead of
  `gh auth status` (which falsely fails there), and `manage-labels` /
  `migrate-labels` use the REST API via `gh api` instead of `gh label` /
  `gh issue`. Behavior (`--dry-run`, `--prune`, `.orc/config/labels`,
  protected labels, unrecognized-label report) is unchanged

## [0.3.0]

### Added
- `/util:setup` creates `.orc/decisions/made.md` and `.orc/decisions/resolved.md`
  (only if missing), the committed decisions memory `orc` 0.12.0 reads and
  writes. `.orc/tmp/` stays gitignored

## [0.2.0]

### Changed
- `/util:push`'s AI review comment now uses the same scannable format as
  `orc` 0.11.0: a one-line verdict headline, a "Needs you" list of deferred
  findings, fixes collapsed, duplicates merged, NOTEs dropped. Unlike
  `orc`'s, it has no inline comments, so line-specific findings stay in the
  list. The `sha:`/`verdict:` marker is unchanged

## [0.1.0]

### Added
- `util` plugin split out of `orc`: `/util:push`, `/util:bump`, `/util:list`,
  and `/util:setup`, moved as-is (including `setup`'s label-management
  scripts and templates) to keep `orc` scoped to the create → plan → build
  pipeline. The shared review agents `push`/`bump` use
  (`review-correctness`, `review-security`, `review-quality`,
  `review-impact`, `deploy-risk-scanner`, `ci-debugger`,
  `conflict-classifier`) and the `ai-review.md` template are duplicated here
  from `orc`, since `build`/`resume` still depend on the `orc` copies
