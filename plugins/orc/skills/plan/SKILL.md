---
name: plan
description: Take a draft issue from /orc:create, analyze the codebase, challenge and choose the technical approach, assess size and risk, mock up any UI change, and write a build-ready spec onto the issue once the engineer approves it. Sets status:ready. Invoke as /orc:plan {number}.
model: opus
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say.

`plan` is where the engineer's effort goes. It turns a scoped issue into a
buildable one: it researches the codebase, tests whether the idea and the
approach hold up, settles every real decision with the engineer, mocks up any
UI change, and posts a spec the engineer has approved. `build` should then be
able to run without asking anything — every question plan leaves open
becomes an interruption later.

## `--dry-run`

`/orc:plan {number} --dry-run` runs research, decisions, mockups, spec-writing,
and approval exactly as normal — the spec goes to the local
`.orc/tmp/{number}-spec.md` scratch file and mockups to
`.orc/mockups/{number}/`, both left in place for inspection (skip the `rm` in
step 8). Skip every GitHub write — `gh-rest issue-edit`, `issue-comment`,
`issue-block`, the parent's build-plan update, and the draft PR — and the
mockup commit and push; print what each would have done. End with:
```
DRY RUN — spec written to .orc/tmp/{number}-spec.md, not posted.
{approved — would set status:ready | still open: {what's open}}
Re-run without --dry-run to post it.
```

## Steps

### 1. Load the issue

Check GitHub access once, up front (cached, so repeat calls are free). If it
fails, stop and show its message. GitHub calls in this skill go through
`gh-rest` (REST only), never `gh issue`/`gh pr`/`gh repo` subcommands — those
use GraphQL, which Claude Code on the web blocks with a 403.

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight
```

Require an issue number (`/orc:plan {number}`). Invoke `issue-loader` with it.
Use the returned title, body, labels, and any existing spec comment.

Set it to `status:draft` while a spec is being written or revised. Create
both labels defensively first — idempotent, a no-op once `/util:setup` or a
prior run has already made them, but `--add-label` 404s on a label that's
never existed in the repo at all:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:draft"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:ready"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:ready" --add-label "status:draft"
```

**Related issues.** If the body says `Part of #{parent}`, read the parent
(`gh-rest issue-view {parent}`) for its Shared context and Build plan. Then
check blockers:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-blockers {number}
```

If any blocker is still open, its code isn't on `main`, so research against
it is guesswork. Say which, and ask: **Wait** (stop here; plan once it
merges) or **Plan against its spec** (treat the blocker's posted spec as the
contract — its files, interfaces, and schema — and record that as a
low-confidence decision). A blocker with no spec yet leaves only **Wait**.

### 2. Research the codebase

Explore what already exists before choosing an approach. When the work spans
several independent areas (schema, routes and services, frontend, tests),
dispatch one read-only Explore subagent per area **in parallel** and have each
return the files, conventions, constraints, and existing tests it found —
then reason over the combined result yourself. For work confined to one area,
explore directly. Read `CLAUDE.md` (root and any in the directories the work
touches) for conventions and the project's `## Verification` /
`## Focused Verification` commands. Focus on whatever the work touches:

- models, migrations, and schema in scope
- routes, controllers, services, jobs, or integrations in scope
- frontend pages, components, and theme, if UI is touched
- existing tests that reveal expected behavior of related code
- **the wiring around the change** — what reads and writes the data it
  depends on, and the user flows that pass through it. A feature can pass
  every unit test and still never run because nothing writes the value it
  reads. Trace each affected flow from entry point to storage and back.

Write what you found to `.orc/tmp/{number}-research.md` (`mkdir -p .orc/tmp`):
touchpoints with one line each, conventions, constraints, the flows traced,
and existing tests. `spec-writer` builds from this instead of researching
again.

For a related issue, also read the specs of its siblings in the **same
phase** of the parent's build plan. If this spec would modify files a
same-phase sibling also modifies, they can't safely build in parallel: say
so, and offer to make one block the other (`gh-rest issue-block`) and update
the parent's build plan.

### 3. Challenge the idea

Before choosing *how*, check *whether*. From the research, say plainly — in
one short message, only what applies:

- 🔴 the idea won't work as described, and why (a conflict with existing
  behavior, data that doesn't exist, a constraint the issue missed)
- 💡 a simpler approach that meets the same goal, or existing code that
  already does most of it
- ⚠️ a cost the issue didn't account for (a migration on a big table, a
  breaking change to a shared interface, a flow this quietly changes)

If none apply, say "No concerns with the idea." in one line and move on. If
something changes the scope, settle it with the engineer before step 4 —
update the issue body if scope changes.

### 4. Settle decisions

List every real fork — two or more reasonable approaches the issue doesn't
settle. Decide what the code, `CLAUDE.md`, or an existing pattern settles,
and record it as **high** confidence with the evidence. Ask about the rest:
batch them (up to four per `AskUserQuestion` call), each with your
recommended approach as the first option, the realistic alternative(s), and
what each costs. Never ask what the code already answers.

Record every decision — asked or not — in the spec's Decisions table, with
its options, choice, confidence, and why, per
`${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`. A decision the engineer
answered is **high**.

### 5. Assess size and risk

- **Size** — S: one area, one wave, a few files. M: a few areas or waves.
  L: many areas, a schema change plus UI plus jobs, or anything you'd expect
  to need several waves with dependencies.
- **Risk** — **high** if it touches payments, auth or permissions,
  migrations or schema, queues or jobs, external data or APIs, or a shared or
  public interface; otherwise **low**.

Each with a one-line reason. `build` picks its verification path from these,
so err high when unsure. Scale the spec to the size: an S spec is short.

### 6. Mock up UI changes

Skip this step when no page changes.

For each page the change adds or alters, write an interactive, responsive
mockup to `.orc/mockups/{number}/{page}.html` starting from
`${CLAUDE_PLUGIN_ROOT}/templates/mockup.html` and following the rules in its
header: the app's own theme tokens and component markup, realistic content,
every new control working, every state the spec names reachable, changed
regions marked. Read the real page and components first — the mockup shows
the page *after* the change, not a redesign of it.

Show each mockup to the engineer in the session: send the file with
`SendUserFile` (`display: "render"`) when that tool is available; otherwise
give the path. Ask with `AskUserQuestion` per page: **Looks right** /
**Change it** (free text says what) — iterate until every page is approved.
Approved mockups are part of the spec: list them under `### Mockups`, and add
an acceptance criterion per page that the built page matches its mockup's
structure, content, and states.

### 7. Write and critique the spec

Invoke `spec-writer`, passing the issue body (scope and intent from
`create`), whether it's a bug (`type:bug` present), the research file path,
the size and risk with their reasons, the Decisions table, the mockup paths,
and an output path of `.orc/tmp/{number}-spec.md`. It fills
`${CLAUDE_PLUGIN_ROOT}/templates/spec.md`.

Then invoke `spec-critic` with the spec path, the issue body, the research
file path, and the Decisions table. Act on what it returns before the
engineer sees the spec:

- **Phantom or wrong paths** — fix them in the spec yourself.
- **Unverifiable criteria** — rewrite each to name a real test, command, or
  observable outcome; if it can't be made verifiable, make it `[optional]` or
  an open question.
- **Missing end-to-end coverage** — add an `[e2e]` criterion for each flow
  the change touches (required for M and L).
- **Inconsistencies and missing edge cases** — fold them into the spec when
  the code or the settled decisions answer them; otherwise add them to Open
  Questions.
- **Open questions to add** — add them verbatim.

Re-invoke `spec-critic` once if you changed more than paths. A second round is
only for real changes — don't loop on nits.

Resolve whatever is still in Open Questions with the engineer — batched, each
with your recommended answer first — folding answers back into the spec and
its Decisions table, until **Open Questions reads `None.`** and every
required criterion is tied to a test, command, or observable outcome. This is
the gate `build` re-checks. Do not weaken it.

### 8. Approve and post

Show the engineer a one-screen summary — not the spec:

```
### 📋 #{number} — {title}
**Size:** {S|M|L} · **Risk:** {low|high} — {reason}
🧭 Approach: {2–4 bullets}
⚖️ Decisions: {n} ({k} low confidence — listed below)
✅ Criteria: {n} ({e} e2e, {o} optional)
📁 Mockups: {n} page(s)
{each low-confidence decision, one line}
```

Ask with `AskUserQuestion`: **Approve** / **Change something** (free text) /
**Show the full spec**. Apply changes and ask again until approved. If the
engineer won't approve yet, leave `status:draft` and say what's open.

On approval, commit any mockups to the issue's branch so `build` and the PR
carry them. Resolve `{branch}` as `${CLAUDE_PLUGIN_ROOT}/templates/branch.md`
describes — no question asked; it's normally the session's own branch. Never
commit them to the default branch. If `{branch}` isn't the current branch,
switch to it and move the mockups over — onto the existing branch if it's
already on origin (an open PR's branch: never reset it), else a new one from
`origin/main`:

```bash
# only when {branch} isn't the current branch:
git stash push --include-untracked -- .orc/mockups/{number}/
git fetch origin main
if git fetch origin {branch} 2>/dev/null; then
  git switch -C {branch} origin/{branch}
else
  git switch -C {branch} origin/main
fi
git stash pop
# always:
git add .orc/mockups/{number}/
git commit -m "docs(#{number}): mockups"
git push -u origin {branch}
```

Then open the issue's draft PR now, unless it already has one, so `build` —
in this session or another — finds this branch (and the mockups) through the
branch rule. Post its URL on the issue; that link is how later skills find it:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-create --draft --base main --title "{title}" \
  --body "🗒️ Planned — mockups only, build hasn't started. Closes #{number}."   # prints {number,url}
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-comment {number} --body "Draft PR: {url}"
```

Then post the spec:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-comment {number} --body-file .orc/tmp/{number}-spec.md
rm .orc/tmp/{number}-spec.md .orc/tmp/{number}-research.md
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:ready"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label status:draft --add-label status:ready
```

### 9. Report

```
#{number} specced — {size}/{risk} — ready to build.
```

End with the next-step line from `working-style.md`:
`➡️ Next: /orc:build #{number} — continue?`. If it's still draft, say what's
open and offer nothing.
