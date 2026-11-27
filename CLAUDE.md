# hexbyte-plugins

A Claude Code plugin marketplace: `plugins/ink` (content publishing),
`plugins/orc` (idea-to-merged-code automation) and `plugins/util` (utilities
around orc). Skills, agents, and templates are plain markdown/YAML — there is
no application code and no test framework.

## Verification

Structural lint over the `orc` and `util` plugins (frontmatter shape, agent,
skill and `gh-rest` command references, `${CLAUDE_PLUGIN_ROOT}` paths, orphaned
files, shared copies, version/changelog sync). Run before any PR that touches
`plugins/**`:

```
python3 .github/scripts/lint-orc.py
```

Also run in CI on any PR touching `plugins/**` (`.github/workflows/lint-orc.yml`).

## Focused Verification

The lint already scopes itself to `plugins/**` and runs in well under a
second — there is no narrower filter to apply. Run the same command:

```
python3 .github/scripts/lint-orc.py
```
