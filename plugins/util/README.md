# util

Companion utility skills for the [`orc`](../orc) pipeline: Dependabot triage
and repo scaffolding. Split out of
`orc` so that plugin stays focused on the create → plan → build pipeline
itself.

Part of the `hexbyte` marketplace. Install alongside `orc` — `setup` wires a repo for the issues and labels `orc`
manages, and `bump` reuses two of its review agents.

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
| `/util:bump` | Review open Dependabot grouped PRs for security and breaking changes, then merge if safe |
| `/util:setup` | Scaffold a repo for orc — labels, `.orc/`, `CLAUDE.md` sections, PR template, CHANGELOG, dependabot. Idempotent — safe to re-run |

## Why a separate plugin

`orc`'s skills (`create`, `plan`, `build`, `walkthru`, `status`, `learn`,
`discuss`) are the pipeline itself. `bump` and `setup` are useful around it
but don't drive it: `bump` handles Dependabot's PRs, not `build`'s, and
`setup` is one-time scaffolding. Keeping them separate lets each plugin
version and release independently.

## Shared agents

`bump` uses `review-security`, `review-impact`, and `ci-debugger`. Each
plugin's agents resolve from its own `agents/` directory, so those three are
copied here from `orc` — keep them in sync if you change one.

## `--dry-run`

`bump` and `setup` accept a trailing `--dry-run`. Local file writes still
happen, but `git push` and every GitHub-mutating `gh` call are skipped and
printed instead. Each skill documents its exact boundary at the top of its
`SKILL.md`.

## Versioning

`plugin.json`'s `version` is semver and is the cache key Claude Code uses to
decide whether an installed copy needs updating — pushing commits alone does
not update anyone already installed. **Bump it in the same PR as any change
you want to ship**, and record it in `CHANGELOG.md`. See
[Version management](https://code.claude.com/docs/en/plugins-reference#version-management).
