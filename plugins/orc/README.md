# orc

Issue-to-PR automation for a GitHub-issue-driven workflow, built for Claude Code
on the web. You discuss and spec an issue interactively; `build` implements it
autonomously — through code, review, and an open PR — stopping at well-defined
**gates** whenever it can't safely continue. You do the final merge.

Part of the `hexbyte` marketplace.

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
| `/orc:create` | Discuss an idea at the scope level and produce GitHub issue(s) — no spec |
| `/orc:plan` | Analyze the codebase, challenge the idea, settle decisions, assess size and risk, mock up UI changes, and post a spec you approve |
| `/orc:build` | Take a specced issue to a reviewed PR: waves of parallel implementers, blind acceptance tests, a criteria ledger, independent AI review, decisions recorded with confidence. Depth follows the spec's size and risk. Never merges |
| `/orc:walkthru` | Finish a built PR with you: fix CI or conflicts, handle Copilot and other PR comments, one-screen summary, questions only on low-confidence decisions, last changes through a mini build, squash-merge on your yes |
| `/orc:status` | Recap this session after time away: the issue, where it stopped, what was decided, what changed on GitHub since, and what to do next. Read-only, runs on haiku |
| `/orc:learn` | Every so often: turn decisions that recur across merged PRs (or that you tagged as rules) into `CLAUDE.md` rules, via a PR |
| `/orc:discuss` | Read-only exploration mode — talk through ideas, or ask what a file, route, or PR does; no changes until you say "green light" |

`/util:bump` and `/util:setup` live in the [`util`](../util) plugin — install
`util@hexbyte` alongside `orc` to use them.

## The pipeline

```
  create ──▶ issue (draft) ──▶ plan ──▶ issue (ready) ──▶ build ──▶ PR (built) ──▶ walkthru ──▶ merged
   scope        no spec yet      spec + mockups,          one PR,       reviewed       your questions,
                                 you approve              any size                     last changes
```

- **`create`** gets the idea out of your head: scope, in/out, open questions
  resolved. Splits only when work is genuinely separable. Pieces of one goal
  get a **parent issue** with a build plan — phases, what blocks what, and
  what can run in parallel — linked as GitHub sub-issues and dependencies.
- **`plan`** is where your effort goes. It researches the codebase (tracing
  the user flows the change touches), says plainly if the idea won't work or
  a simpler one would, settles every real fork with you, rates **size**
  (S/M/L) and **risk** (low/high), mocks up every changed page, and posts a
  spec only once you approve it.
- **`build`** runs on its own and asks only when an answer changes work it
  hasn't done yet. It proves every acceptance criterion and records every
  decision with a confidence level.
- **`walkthru`** asks only about what orc wasn't sure of, takes last changes,
  and merges on your explicit yes.
- **`learn`** turns recurring decisions into `CLAUDE.md` rules.

## Size and risk paths

`plan` writes Size and Risk into the spec; `build` picks its depth from them.
High risk (payments, auth, migrations, queues, external data, shared
interfaces) always takes the L path.

| | S, low risk | M, low risk | L, or high risk |
|---|---|---|---|
| Implementers | one, sequential | parallel waves | parallel waves |
| Blind acceptance tests, red against `main` | ✅ | ✅ | ✅ |
| Changed-line coverage, breaks / mutation testing | — | Key Logic only | everything with logic |
| Review agents | correctness, quality | + security, impact | + `/code-review` |
| PR context comments | — | ✅ | ✅ |

## How build proves the work

- **Acceptance tests written blind.** `test-writer` writes them from the spec
  alone, in parallel with the first wave, including an `[e2e]` test per user
  flow that drives the real wiring end to end.
- **Tests that can fail.** Every new test must fail against `main`; on M and
  L, planted breaks (or the repo's mutation testing) must be caught.
- **Criteria ledger.** A PR comment listing each acceptance criterion as met,
  not met, or not run, with the test or command that proves it. `[optional]`
  criteria (e.g. a check against real external data) run when the
  environment allows and never block.
- **Independent review.** Fresh agents see only the spec, the decision record
  and the diff. Every BLOCKER and WARNING goes to `finding-verifier`, which
  tries to disprove it first. Findings with one right fix are fixed; the rest
  wait for the walkthrough.
- **Deploy notes.** Migrations, queue restarts, env vars, and contract changes
  become a Deploy notes comment with the steps — never a blocker. A
  destructive data change is asked about in the walkthrough.

The full suite and mergeability are left to the PR's CI; `walkthru` checks
both (and fixes them with a mini build) before merging.

## Decisions

Every choice between real alternatives is recorded with its options, the
choice, and a **confidence** — high when evidence settles it, low when a
reasonable senior could choose otherwise. `plan`'s go in the spec; `build`'s
in a **Decisions comment on the PR**, updated as work lands. `walkthru` asks
about low-confidence decisions and nothing else, and marks each one confirmed,
changed, or "make this a rule". `/orc:learn` later moves the recurring ones
into `CLAUDE.md`. Format in [`templates/decisions.md`](templates/decisions.md).

## Mockups

When a change touches UI, `plan` writes an interactive, responsive mockup per
changed page to `.orc/mockups/{issue}/` — self-contained HTML in the app's own
theme, with a phone/tablet/desktop toggle and every state the spec names.
They're shown in the session for approval, committed to the issue's branch,
handed to implementers as the visual target, and shown again in the
walkthrough. Starter: [`templates/mockup.html`](templates/mockup.html).

## Branches

orc never asks which branch to use (`templates/branch.md`): an issue with an
open PR uses that PR's branch; otherwise the session's own branch (Claude
Code on the web gives every session one); otherwise, e.g. locally on `main`,
a new `issue/{n}-{slug}` branch. orc finds an issue's PR from the issue, not
from a branch name.

## Focused verification

`build` verifies with **scoped/filtered** test runs — only the tests around
what each wave changed. Each repo's `CLAUDE.md` carries a **`## Focused
Verification`** section (distinct from `## Verification`) with the filtered
command. A **`## CI-Only Verification`** section lists suites `build` never
runs (browser/e2e). A **`## Mutation Testing`** section, if present, is used
for the break check on M and L.

## Gates

`build` stops at a **gate** only when it can't continue and nobody can
answer: it pushes what exists, comments the reason on the issue, sets
`status:blocked`, and stops. Fix the cause and re-run `/orc:build {number}` —
it rebuilds from `origin/main` and reuses the PR.

| Gate | Trips when |
|---|---|
| Spec | no spec, a required criterion isn't machine-verifiable, or Open Questions ≠ `None.` |
| Confidence | material ambiguity between the spec and the codebase, and no one to ask |
| Ambiguity | mid-build, a question that blocks later work, and no one to ask |
| Verify | focused tests fail and can't be safely fixed, or an `[e2e]` criterion can't be met |
| Blocked | an issue it depends on (`Blocked by`) isn't merged yet |
| Missing infra | `CLAUDE.md` has no `## Verification` / `## Focused Verification` section |

## `--dry-run`

`create`, `plan`, `build`, and `learn` here, plus `bump` and `setup` in
`util`, accept a trailing `--dry-run`. (`walkthru` doesn't: it acts only on
your explicit answers.) Local commits and file writes still happen, but `git push` and
every GitHub-mutating call are skipped and printed instead. Each skill
documents its exact boundary at the top of its `SKILL.md`.

## Labels

`status:draft` (scoped, needs a spec) → `status:ready` (specced, buildable) →
`status:building` → `status:blocked` (needs you) or `status:built` (PR ready
for your walkthrough). Bugs additionally carry `type:bug`. Merged PRs that
`/orc:learn` has read carry `orc:learned`. Labels self-provision when a skill
first needs them.

## Versioning

`plugin.json`'s `version` is semver and is the cache key Claude Code uses to
decide whether an installed copy needs updating — pushing commits alone does not
update anyone already installed. **Bump it in the same PR as any change you want
to ship**, and record it in `CHANGELOG.md`. See
[Version management](https://code.claude.com/docs/en/plugins-reference#version-management).
