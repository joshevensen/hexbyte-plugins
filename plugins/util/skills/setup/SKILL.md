---
name: setup
description: Set a repo up for orc on request — CLAUDE.md verification sections, PR template, CHANGELOG, dependabot and the .orc scratch ignore — and open a PR with what it added. Optional (/orc:ship sets up what it needs by itself) and idempotent. Invoke as /util:setup [owner/repo] [--dry-run].
model: sonnet
---

`/orc:ship` checks a repo on every run and sets up the few files it can't
work without — the `CLAUDE.md` verification sections, a PR template and the
`.orc/tmp` ignore — so nothing here is required first. `setup` does the same file setup in one
deliberate pass, plus a changelog and a Dependabot config, and puts it in its
own PR to read before anything is built.

It creates what is missing and never replaces what exists. It manages no
labels: orc reads and writes none, and any left by an earlier version can stay
or be deleted by hand.

## `--dry-run`

`/util:setup --dry-run` writes every local file as normal — previewing those
files is the point — and skips step 7 entirely: nothing is committed, pushed
or opened. End with:
```
DRY RUN — files written for review: {list}.
Nothing committed or pushed. Re-run without --dry-run to commit and open a PR.
```

## Steps

### 0. Resolve `{owner}/{repo}`

Run from inside the project directory. Infer from `git remote get-url origin`,
or accept an `owner/repo` argument.

### 1. Preflight

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest -R {owner}/{repo} preflight
```

This checks `gh` is installed and tests real access to the repo (cached for
10 minutes) rather than `gh auth status`, which reports a false failure in web
sessions. Use REST (`gh api`, through `gh-rest`) only: the GraphQL-backed
`gh issue` / `gh pr` / `gh label` subcommands are blocked there with a 403.

If it fails, stop with its message:
- **Local:** install from https://cli.github.com, or run `gh auth login`.
- **Claude Code on the web:** if `gh` is missing, add it to the environment's
  **Setup script** — see the web-install section of the orc README. A 403/404
  means the environment lacks access to this repo — fix that, not `gh` auth.

### 2. `CLAUDE.md` verification sections

orc reads its project-specific commands from `CLAUDE.md` — this is what keeps
the plugin project-agnostic:

- **`## Verification`** — the full test, lint and build commands. CI's job,
  and the fallback orc scopes down from.
- **`## Focused Verification`** — the command shape for running only the
  tests around what changed. This is what orc runs while building. It is
  per-repo and per-language — a PHPUnit `--filter`, `pytest -k {expr}`, a test
  path argument — so record the pattern the repo uses:
  ```
  ## Focused Verification
  Run only the tests covering changed files:
    php artisan test --filter '{ClassOrMethod}'
  ```

Scan the project root for test, lint and build commands (`package.json` and
`composer.json` scripts, `artisan`, `Makefile`, `pyproject.toml`, the CI
workflow files), leaving out `dev`, `watch`, `start` and `preview`.

- **No `CLAUDE.md`:** create it with the discovered commands under both
  sections.
- **It exists:** append whichever of the two is missing, touching nothing
  already there.
- **No test, lint or build command anywhere:** say so in the section instead
  of leaving it out, so the gap is explicit:
  ```
  ## Verification
  None — this repo has no test, lint or build command. Changes are checked by reading the diff and by CI, if any.
  ```

**`## CI-Only Verification`** (optional). If the section already exists, leave
it. Otherwise look for heavy or slow suites — `playwright.config.*`,
`cypress.config.*`, or script names containing `e2e`, `playwright`, `cypress`
or `browser` — and, if any exist, add:
```
## CI-Only Verification
Suites listed here are never run by orc, not even scoped — CI is the only
place they execute:
  - Playwright end-to-end tests (`npm run test:e2e`) — slow, browser-driven
```

**`## Mutation Testing`** (optional). If the repo already has a mutation tool
configured (Infection, Stryker, mutmut) and no such section, add one with its
command; orc runs it on Heavy changes only. Install nothing.

### 3. PR template

If the repo has no PR template (`.github/PULL_REQUEST_TEMPLATE.md`, or a
`pull_request_template.md` in the root, `docs/` or `.github/`), create
`.github/PULL_REQUEST_TEMPLATE.md` from
`${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/pull-request-template.md`. If
one exists, keep it — orc fills whatever headings it has.

### 4. CHANGELOG.md

Create from `${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/changelog.md` if
absent, filling in `{owner}/{repo}`. Skip silently if present.

### 5. dependabot.yml

Create `.github/dependabot.yml` from
`${CLAUDE_PLUGIN_ROOT}/skills/setup/templates/dependabot.yml` if absent,
filling in the detected ecosystem (`package.json`→npm, `composer.json`→composer,
`pyproject.toml`/`requirements.txt`→pip). Skip silently if present.

### 6. `.orc/` scratch ignore

orc writes scratch files to `.orc/tmp/`. Make sure `.orc/.gitignore` ignores
it, creating or extending the file:
```
tmp/
```

`.orc/mockups/` (approved mockups) and `.orc/decisions/` (decision history and
rules) are **committed** — never ignore them, and don't create them here; orc
creates each when it first writes to it.

**Leftovers from older versions.** If the root `.gitignore` or
`.orc/.gitignore` still lists `.orc/tasks`, `.orc/features`, `.orc/QUEUE.md`
or a wholesale `.orc`, remove those entries. A `.orc/config/labels` file or a
`.orc/features/` directory is no longer read by anything — say so in the
report; don't delete them.

### 7. Commit and open a PR

If nothing was created or modified, skip to step 8.

Stage only the files this run touched, commit them on a branch, and open a
PR. If the working tree already had changes before setup ran, leave them
alone. The engineer reviews and merges it — `setup` never merges.

Pick the branch without asking: the session's own branch if the current
branch isn't the default one and holds no other work (`git log --oneline
origin/main..HEAD` empty); otherwise a new `orc/setup` created from where you
are, which carries the uncommitted files with it.

```bash
git switch -c orc/setup        # only when not using the session branch
git add {files this run touched}
git commit -m "chore: set up orc"
git push -u origin {branch}
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-find {branch} open   # reuse it if one exists
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-create --base main --title "chore: set up orc" --body "Sets this repo up for orc: {what was added — CLAUDE.md verification sections, PR template, CHANGELOG, dependabot, .orc scratch ignore}."   # only if none
```

### 8. Report

```
setup complete for {owner}/{repo}:
{only what was actually created or changed, one line each — or "nothing to do"}
{the PR url, if one was opened}
```
