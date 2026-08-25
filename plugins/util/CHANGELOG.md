# Changelog

Tracks the `util` plugin's `version` in `.claude-plugin/plugin.json`. Bump that field with every change you want installed copies to receive — Claude Code caches plugins by version, so pushing commits alone does not update anyone already on a pinned version. Follow [semver](https://semver.org): MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

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
