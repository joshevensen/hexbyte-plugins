# orc

One command takes an idea to merged code. You describe the idea, answer a few
questions, and approve mockups of anything visual. orc files the issues,
builds, checks and squash-merges on its own, and alerts you only when the
scope grew or it can't make progress. Production deploys stay yours.

Built for Claude Code on the web. Part of the `hexbyte` marketplace.

### Install — Claude Code CLI (local)

```
/plugin marketplace add joshevensen/hexbyte-plugins
/plugin install orc@hexbyte
```

### Install — Claude Code on the web (cloud sessions)

The interactive `/plugin` command isn't available in web sessions, and plugins must be installed **into the cloud environment** so they load before Claude Code launches. Add the plugin to your environment's **Setup script**:

1. In [claude.ai/code](https://claude.ai/code), open the environment (⋯ → **Update cloud environment**, or the environment picker).
2. In the **Setup script** field, add:

   ```bash
   claude plugin marketplace add joshevensen/hexbyte-plugins
   claude plugin install orc@hexbyte

   # orc drives GitHub through the gh CLI, which isn't preinstalled in web
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

3. **Save changes.** The script runs on each new session, so orc is installed, `gh` is on the PATH and authenticated, and the `/orc:*` skills are available. Existing sessions aren't affected — start a new one.

Requires the environment's network access to reach `github.com` **and `cli.github.com`** (the default **Trusted** policy does). Under a locked-down policy that blocks the `gh` install source, this won't work — orc needs `gh` present, so either allow the install host in your policy or run orc from a Trusted environment.

## Skills

| Skill | What it does |
|---|---|
| `/orc:ship [idea \| issue number \| parent issue number]` | The whole flow in one session: interview, issues, mockups, build, merge, report. Run it again on the same number to resume |
| `/orc:idea "…"` | File an idea as one issue, without shipping it now. No questions, no research. `/orc:ship {number}` picks it up later |
| `/orc:discuss [topic]` | Read-only mode — talk an idea through, or ask what a file, route or PR does; nothing changes until you say "green light" |

`/util:setup` and `/util:bump` live in the [`util`](../util) plugin. Neither
is needed to use orc.

## The flow

```
 idea ─▶ interview ─▶ issue(s) ─▶ mockups ─▶ build ─▶ check ─▶ merge ─▶ report
         you answer               you approve └─ each issue in turn, orc alone ─┘
```

1. **Interview.** orc reads the code first, then asks only what changes what
   gets built — scope, behavior, what's out, the split — each question with a
   recommendation. A clear, small request skips the questions. It states what
   it will build and what it assumed, and keeps going.
2. **Issues.** Work that fits one PR is one issue; larger work becomes ordered
   issues under a **parent issue** that tracks them until all are merged. orc
   writes each spec into the issue body. Nobody approves it.
3. **Mockups** (UI changes only). Every changed page gets an interactive
   mockup in your app's theme, shown in the chat. You approve them all up
   front — the last thing orc needs from you.
4. **Build, check, merge**, one issue at a time: implement, write tests shown
   to fail without the change, run your repo's verification commands, compare
   screenshots of the built pages with the mockups, open the PR, wait for CI,
   fix or decline review comments with a marked reply, squash-merge.
5. **Report.** PR links and anything that needs you, plus a push notification
   when the host has one. A parent gets one summary comment: what shipped,
   what was decided without you, deploy notes, new rules.

**Checking scales with risk.** Findings that survive are fixed in the PR.

| Tier | Typical change | Before the merge |
|---|---|---|
| Light | docs, copy, config, a one-line fix | verification commands and CI |
| Standard | a normal feature or bug fix | plus one independent reviewer, each finding challenged by a verifier |
| Heavy | auth, payments, schema or data, public contracts, external side effects, a large diff | plus a four-way review, a deploy scan, mutation or coverage checks where the repo has them |

**orc stops only when** the scope grew (the criteria can't be met inside what
was agreed, or the work changes behavior you agreed to), an approved mockup
can't be built as drawn, a decision contradicts a `CLAUDE.md` rule, or it
can't make progress (CI still red after three fixes, a merge conflict that
isn't simple). A stop pauses that issue and what depends on it, leaves its PR
open, says exactly what is wrong, and the run carries on with the rest.

**On its own, orc** writes the specs, picks the branch and the approach, fixes
findings and CI failures, resolves simple conflicts, merges when CI is green,
records every non-obvious decision, and turns a choice made on three issues
into a rule you can veto by deleting it.

**It never** deploys or runs a migration against a real environment, asks you
to approve a spec, a finding or a merge, merges a stopped issue, changes repo
settings or labels, or holds back a risky change — that merges with a "before
you deploy" list in the PR and the parent's summary. Your manual deploy is the
gate.

**Resuming.** State lives on GitHub, so after a dead session, or once you've
answered a stop, run `/orc:ship {number}` again: it continues without
re-asking anything. Every report that ends early prints that command.

## What orc reads in your repo

| File | Used for |
|---|---|
| `CLAUDE.md` — `## Verification`, `## Focused Verification`, optional `## CI-Only Verification` and `## Mutation Testing` | The contract for what to run and what not to. Missing sections are added on the first run |
| `.github/PULL_REQUEST_TEMPLATE.md` | The shape of each PR description. Added if missing |
| `.orc/decisions/resolved.md` | Rules orc applies instead of deciding again. Delete a rule to veto it |
| `.orc/decisions/made.md` | Decision history. The same choice on three issues becomes a rule, listed in the report |
| `.orc/mockups/{issue}/` | Approved mockups, committed with the work |

No labels, branch protection or other settings are required. A repo that used
an earlier orc works as it is: its `CLAUDE.md` sections, `.orc/decisions` and
`.orc/mockups` are read, and leftover `status:` labels are ignored.

Templates for everything orc writes are in [`templates/`](templates): the
[interview rules](templates/interview.md), the
[issue](templates/issue.md) and [parent](templates/parent.md) bodies,
[decisions](templates/decisions.md), the [mockup starter](templates/mockup.html)
and the [PR description](templates/pr.md).

## Versioning

`plugin.json`'s `version` is semver and is the cache key Claude Code uses to
decide whether an installed copy needs updating — pushing commits alone does not
update anyone already installed. **Bump it in the same PR as any change you want
to ship**, and record it in `CHANGELOG.md`. See
[Version management](https://code.claude.com/docs/en/plugins-reference#version-management).
