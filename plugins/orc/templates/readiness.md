# Readiness

What `/orc:ship` sets up, without asking, when a repo is missing something it
needs. Each fix is a file change committed as the first commit on the first
issue's branch (`chore: set up orc`), so it arrives with that PR. Say what
was added in the interview's closing statement, as an assumption. A repo that
has all of this needs nothing — skip this file.

## `CLAUDE.md` verification sections

The repo's `CLAUDE.md` is the contract for how work is verified:

- **`## Verification`** — the full test, lint and build commands. CI's job,
  and the fallback to scope down from.
- **`## Focused Verification`** — the command shape for running only the
  tests around what changed (a PHPUnit `--filter`, `pytest -k {expr}`, a test
  path argument). This is what orc runs while building.
- **`## CI-Only Verification`** (optional) — suites orc never runs, in any
  form: browser, end-to-end, anything slow. CI is the only place they run.
- **`## Mutation Testing`** (optional) — a mutation command, used on Heavy
  changes.

If `CLAUDE.md` has neither `## Verification` nor `## Focused Verification`:

1. Find the real commands: `package.json` and `composer.json` scripts,
   `Makefile` targets, `artisan`, `pyproject.toml`, the CI workflow files.
   Ignore `dev`, `watch`, `start` and `preview`.
2. Append the two sections to `CLAUDE.md` (create the file if there is none)
   with those commands, touching nothing already there. The focused section
   gives the filtered form of the test command.
3. If heavy suites exist (`playwright.config.*`, `cypress.config.*`, scripts
   named `e2e`, `playwright`, `cypress` or `browser`) and there is no
   `## CI-Only Verification` section, add one listing them.
4. If the repo has no test, lint or build command at all, write that down
   instead, so the gap is explicit:
   ```
   ## Verification
   None — this repo has no test, lint or build command. Changes are checked by reading the diff and by CI, if any.
   ```

If only one of the two is missing, add just that one.

## PR template

If the repo has no PR template (`.github/PULL_REQUEST_TEMPLATE.md`, or
`pull_request_template.md` in the root, `docs/` or `.github/`), copy
`${CLAUDE_PLUGIN_ROOT}/templates/pull-request-template.md` to
`.github/PULL_REQUEST_TEMPLATE.md`. Never replace one that exists.

## Scratch directory

orc writes scratch files (issue bodies, diffs) to `.orc/tmp/`. If
`.orc/.gitignore` doesn't ignore it, create or extend `.orc/.gitignore` with:

```
tmp/
```

`.orc/mockups/` and `.orc/decisions/` are committed; never ignore them.

## What needs no setup

Labels (orc reads and writes none; ones left by an earlier version are
ignored), `.orc/decisions/` (created when first written), `.orc/mockups/`
(created when first used), branch protection and other repo settings.
`/util:setup` does the same file setup on request, plus a changelog and
Dependabot config.
