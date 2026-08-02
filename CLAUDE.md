# hexbyte-plugins

A Claude Code plugin marketplace: `plugins/ink` (content publishing) and
`plugins/orc` (issue-to-PR automation). Skills, agents, and templates are
plain markdown/YAML — there is no application code and no test framework.

## Verification

Structural lint over the `orc` plugin (frontmatter shape, agent references,
`${CLAUDE_PLUGIN_ROOT}` paths, version/changelog sync). Run before any PR that
touches `plugins/orc/**`:

```
python3 .github/scripts/lint-orc.py
```

Also run in CI on any PR touching `plugins/orc/**` (`.github/workflows/lint-orc.yml`).

## Focused Verification

The lint already scopes itself to `plugins/orc/**` and runs in well under a
second — there is no narrower filter to apply. Run the same command:

```
python3 .github/scripts/lint-orc.py
```
