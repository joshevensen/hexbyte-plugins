# util

Companion utility skills for the [`orc`](../orc) pipeline: a quick
commit/review/PR path for changes made outside `create`/`plan`/`build`,
Dependabot triage, an issue-status view, and repo scaffolding. Split out of
`orc` so that plugin stays focused on the create → plan → build pipeline
itself.

Part of the `hexbyte` marketplace. Install alongside `orc` — `list` and
`setup` operate on the same GitHub issues and labels `orc` manages, and
`push`/`bump` run the same AI review `orc:build` folds in.

### Install — Claude Code CLI (local)

```
/plugin marketplace add joshevensen/hexbyte-plugins
/plugin install util@hexbyte
```

### Install — Claude Code on the web (cloud sessions)

The interactive `/plugin` command isn't available in web sessions, and plugins must be installed **into the cloud environment** so they load before Claude Code launches. Add the plugin to your environment's **Setup script**:

1. In [claude.ai/code](https://claude.ai/code), open the environment (⋯ → **Update cloud environment**, or the environment picker).
2. In the **Setup script** field, add:

   ```bash
   claude plugin marketplace add joshevensen/hexbyte-plugins
   claude plugin install util@hexbyte

   # util drives GitHub through the gh CLI, which isn't preinstalled in web
   # sessions. Install it here; it auto-authenticates via the GH_TOKEN that
   # web environments already expose (no `gh auth login` needed).
   if ! type -p gh >/dev/null; then
     mkdir -p -m 755 /etc/apt/keyrings
     wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       > /etc/apt/keyrings/githubcli-archive-keyring.gpg
     chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
     echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list
     apt-get update && apt-get install -y gh
   fi
   ```

3. **Save changes.** The script runs on each new session, so `util` is installed, `gh` is on the PATH and authenticated, and the `/util:*` skills are available. Existing sessions aren't affected — start a new one.

Requires the environment's network access to reach `github.com` **and `cli.github.com`** (the default **Trusted** policy does).

## Skills

| Skill | What it does |
|---|---|
| `/util:push` | Commit working-tree changes → review → push → open PR (no merge). For changes made directly in conversation that don't warrant a full `orc:create` + `orc:build` cycle |
| `/util:bump` | Review open Dependabot grouped PRs for security and breaking changes, then merge if safe |
| `/util:list` | List open orc-managed issues, optionally filtered by status |
| `/util:setup` | Scaffold a repo for orc — labels, `.orc/`, `CLAUDE.md` sections, PR template, CHANGELOG, dependabot. Idempotent — safe to re-run |

## Why a separate plugin

`orc`'s own skills (`create`, `plan`, `do`, `build`, `resume`, `respond`,
`discuss`, `explain`) are the pipeline itself — the thing that turns an issue
into a reviewed PR. `push`, `bump`, `list`, and `setup` are useful around that
pipeline but don't drive it: `push` is a shortcut for work that skipped the
pipeline entirely, `bump` handles a different kind of PR (Dependabot's, not
`build`'s), `list` is a read-only status view, and `setup` is one-time-ish
scaffolding. Keeping them in a separate plugin keeps `orc` scoped to running
builds, and lets either plugin version and release independently.

## Shared agents

`push` and `bump` run the same AI review agents `orc:build`/`orc:resume` use
(`review-correctness`, `review-security`, `review-quality`, `review-impact`,
`deploy-risk-scanner`, `ci-debugger`, `conflict-classifier`) and the same
`ai-review.md` template. Each plugin's agents are resolved from its own
`agents/` directory, so those files are duplicated here rather than shared
across the plugin boundary — keep both copies in sync if you change one.

## `--dry-run`

`push`, `bump`, and `setup` accept a trailing `--dry-run`. Local git commits
and local file writes still happen — so you can inspect real output with
`git log`/`git diff` — but `git push` and every GitHub-mutating `gh` call
(issue/PR/label create, edit, comment, merge) are skipped and printed
instead. Each skill documents its exact boundary at the top of its
`SKILL.md`. `list` is read-only and has no `--dry-run` of its own.

## Versioning

`plugin.json`'s `version` is semver and is the cache key Claude Code uses to
decide whether an installed copy needs updating — pushing commits alone does
not update anyone already installed. **Bump it in the same PR as any change
you want to ship**, and record it in `CHANGELOG.md`. See
[Version management](https://code.claude.com/docs/en/plugins-reference#version-management).
