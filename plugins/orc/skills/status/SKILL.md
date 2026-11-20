---
name: status
description: Recap this session after time away — which issue it's working on, where in the pipeline it stopped, what was decided, what changed on GitHub since, and the options for what to do next. Read-only and quick. Invoke as /orc:status.
model: haiku
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you word what you say.

Sessions run for days with gaps. `status` answers "where was I?" for **this
session** — not the whole repo. It reads this conversation for what happened
and GitHub for what changed since. It writes nothing, posts nothing, and
changes nothing.

## 1. Read this conversation

From this session's own history (including any summary of earlier context),
work out:

- **The issue** (and PR) this session is about. Usually one; list each if
  there are several.
- **Where it stopped** — the last orc skill run (`create`, `plan`, `build`,
  `walkthru`, `learn`, `discuss`) and the exact point: finished, gated, or
  mid-step (e.g. "plan, waiting for mockup approval on the settings page";
  "walkthru, question 2 of 3 unanswered").
- **What was decided** in this session — the few choices that matter, one
  line each.
- **What's still open** — unanswered questions, change requests not yet
  made, anything the engineer said they'd come back to.

Never fill a gap with a guess. If the history doesn't say, say "not recorded
in this session".

## 2. Check what changed since

For each issue and PR found, run only what applies — quick reads, no loops
(except step 4's next-issue reads after a merge):

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-view {issue}          # labels: status:*, state
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-blockers {issue}      # open blockers
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-view {pr}                # state, draft, mergeable
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-checks {pr}              # CI: exit 0 pass, 1 fail, 8 pending
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-threads {pr}             # unresolved review threads
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-comments {pr}            # new comments; the orc:decisions comment
git status --short --branch                                       # uncommitted or unpushed work
```

Note what differs from where the conversation left it: CI finished or
failed, new Copilot or other comments, a blocker merged, the PR merged or
closed, the label changed, the branch went missing (the container was
replaced — uncommitted work from before is gone; say so plainly).

## 3. Report

```
### 📋 #{issue} — {title}
**Stopped at:** {skill} — {exact point}
**Since then:** {what changed on GitHub, or "nothing"}

⚖️ Decided
- {decision}

⚠️ Open
- {open item}
```

At most about 12 lines. Omit a section with nothing in it.

## 4. Offer next steps

Ask with `AskUserQuestion` (header: `Next`), up to four options, most useful
first:

- **Pick up where it stopped** — the exact skill and point (e.g. "Continue
  walkthru at question 2", "Re-run build — it gated on verify").
- **Handle what changed** — when something did (e.g. "Walkthru: CI failed
  and Copilot left 2 comments").
- **The next pipeline step** — when the last one finished (`plan` → `build`
  → `walkthru`). When the session's PR is merged, find the issue's parent and
  pick the next issue as
  `${CLAUDE_PLUGIN_ROOT}/templates/build-plan.md` describes; the option names
  that issue. If there is no parent, or nothing is startable, don't offer it.
  These candidate reads are the one place status reads more than the
  session's own issue — still read-only.
- **Stop here.**

On a choice, run that skill now with the Skill tool and the same issue or PR
number — except the post-merge next-issue option: for it,
print the block and run nothing, because the next issue starts in a new
session. On **Stop here** or free text, do what it says or stop.
