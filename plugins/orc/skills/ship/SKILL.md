---
name: ship
description: Take an idea, an issue or a parent issue to merged code in one session — a short interview, build-ready issues, mockups approved in chat, then build, check and squash-merge on its own, stopping only when the scope grew or it can't make progress. Run it again on the same number to resume. Never deploys. Invoke as /orc:ship [idea | issue number | parent issue number].
model: opus
---

## User Input

```text
$ARGUMENTS
```

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say.

`ship` runs the whole flow in one session: interview, issues, mockups, build,
merge, report. The engineer describes an idea, answers a few questions and
approves any mockups. After that nothing needs them unless a stop condition
fires.

## What holds throughout

- **Three moments need the engineer:** interview questions (step 1), mockup
  approval (step 3), and a stop (step 8). Nothing else is asked — not the
  branch, not the spec, not a review finding, not whether to continue or
  merge.
- **State lives on GitHub.** The home issue's status table, the issues and
  pushed branches are the only memory
  (`${CLAUDE_PLUGIN_ROOT}/templates/parent.md`). The disk is ephemeral:
  write the home issue before starting a stage and after finishing it. If
  this conversation was summarized mid-run, re-read this skill and the home
  issue before the next action.
- **`CLAUDE.md` is the contract for verification.** Run its
  `## Focused Verification` command, scoped to what changed, while building.
  The full `## Verification` suite is CI's job; scope it down yourself only
  when there is no focused section. Never run anything under
  `## CI-Only Verification`, in any form.
- **GitHub goes through `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest`** (REST only).
  Never use the `gh issue`, `gh pr` or `gh repo` subcommands — they use
  GraphQL, which Claude Code on the web blocks. `gh api` (REST) and `gh run`
  are fine. `{gh-rest}` below stands for that script's full path.
- **No labels.** Read none, write none. Labels left by an earlier version of
  orc are ignored.
- **One child at a time.** Children build and merge in order. Agents run in
  parallel only inside one child's build.
- **Never deploy.** No deploy command, no release, no migration against a
  real environment. Risky changes merge and produce deploy notes instead.
- Scratch files go in `.orc/tmp/` (`mkdir -p .orc/tmp`); nothing there is
  ever the only copy of something a later session needs.

## Steps

### 0. Start

```bash
{gh-rest} preflight                                            # stop and show its message if it fails
base=$(gh api "repos/$({gh-rest} repo)" --jq .default_branch)   # {base}
git fetch origin "$base"
```

Read `CLAUDE.md` and, if it exists, `.orc/decisions/resolved.md` — the rules
that are applied instead of deciding again.

**What was passed:**

- **Nothing** — ask in one line what to ship. That is the interview's first
  question, and the answer is the idea.
- **Text** — a new idea. Go to step 1.
- **A number** — `{gh-rest} issue-view {n}`, then by what the issue is, first
  match wins:
  1. **Closed** — say so in one line and stop.
  2. **A child** (its `parent` is a number, or its body has a
     `Part of #{p}` line) — the run belongs to the parent. Continue as if
     `{p}` had been passed.
  3. **A home issue** — its body starts with `<!-- orc:parent -->` or
     `<!-- orc:issue -->`. This is a **resume**: follow "Reading state" in
     `${CLAUDE_PLUGIN_ROOT}/templates/parent.md` and continue at the step it
     gives for each row. Ask nothing that the issues already settle.
  4. **A parent without the marker** (it has sub-issues —
     `{gh-rest} issue-subs {n}` — or a `- [ ] #{k}` checklist; made by hand
     or by an earlier orc) — adopt it: its open children, in checklist
     order, are the children. Go to step 1 with what they already say as the
     starting point, then step 2 rewrites each body, and the parent's, in the
     current format.
  5. **An idea** (its body starts with `<!-- orc:idea -->`) or **any other
     issue** — its text is the starting point. Go to step 1.

**Readiness.** Check three things: `CLAUDE.md` has a `## Verification` or
`## Focused Verification` section; the repo has a PR template;
`.orc/.gitignore` ignores `tmp/`. If all hold, move on. If any is missing,
read `${CLAUDE_PLUGIN_ROOT}/templates/readiness.md` and set it up as it
describes — never fail or ask because of it.

### 1. Interview

Read `${CLAUDE_PLUGIN_ROOT}/templates/interview.md` and follow it: research
first, say so if the idea doesn't fit, ask only what changes what gets built,
each question with a recommendation.

**Skip the questions** when the request is already clear and small (a
one-line fix, a copy tweak, a well-described bug) or the issue already
settles scope, behavior and boundaries. Research still happens.

Either way, end with the closing statement from that template — what will be
built, what is out, the assumptions, the shape, the pages that get a mockup —
and **continue without waiting**.

### 2. Issues

Read `${CLAUDE_PLUGIN_ROOT}/templates/issue.md` and
`${CLAUDE_PLUGIN_ROOT}/templates/parent.md`.

- **One issue** when the work fits one PR a person could review in a sitting.
- **Ordered issues under a parent** when it doesn't: split into deliverables
  that can each merge on their own, ordered so each builds on code already
  merged. You decide the split; the closing statement already said it.

For each issue, write the build-ready body: goal, behavior, scope in and out,
checkable acceptance criteria, files likely touched, the tier with its reason
(table in step 5), the Decisions table with what you chose while specifying,
and assumptions. Run the template's own checks on it — nobody approves it.

File them as the templates describe:

- A **new idea**: create the issue, or the parent and then its children in
  order, with their links.
- An **existing issue** that stays one issue: replace its body with the
  build-ready one, keeping the original words in the collapsed section.
- An **existing issue** that is split: it becomes the parent; its children
  are new.

Every row starts `queued`. Set the home issue's Mockups line to
`none — no UI change` or `awaiting approval`. Say what was filed, one line
per issue (`#{n} — {title} — {tier}`), and end that message with the line
below, so the command is on screen before anything can cut the session short.
Then continue.

```
If this session ends early, continue with: /orc:ship {home issue number}
```

### 3. Mockups

Only when a child changes what a user sees — the layout, components, flow or
states of a page. A text-only change (copy, a label, a typo) gets no mockup;
the closing statement quoted the new text instead. No UI change: skip to
step 4.

1. **Write** one mockup per changed page, for every child, to
   `.orc/mockups/{number}/{page}.html`, starting from
   `${CLAUDE_PLUGIN_ROOT}/templates/mockup.html` and following the rules in
   its header: the app's real theme tokens and component markup, realistic
   content, every new control working, every state the issue names reachable,
   changed regions marked. Read the real page and its components first — the
   mockup shows the page after the change, not a redesign.
2. **Show** each one in the chat: publish it as a private Artifact when the
   Artifact tool is available; otherwise send the file for inline rendering
   (`SendUserFile` with `display: "render"`); otherwise give its path.
3. **Ask** per page with `AskUserQuestion`, up to four pages per call:
   **Looks right** or **Change it**, where the free-text answer says what to
   change. For a change, edit the same file, publish it again to the same
   Artifact, and ask about that page again.
4. **All pages of all children are approved before anything is built.** With
   nobody to approve, the run waits here: report as step 9 does and end.
5. **Commit them, once approved.** Do step 4.1 now for the first child that
   will build — its branch, its row set to `building` — so the commit below
   is on a branch the home issue names. Then:
   ```bash
   git add .orc/mockups && git commit -m "docs: approved mockups for #{a}, #{b}"
   git push --force-with-lease -u origin {branch}
   git rev-parse HEAD      # {sha}
   ```
   Write `Approved — commit {sha}` under Mockups in each of those issues, and
   `approved — commit {sha}` on the home issue's Mockups line. That one commit
   holds every child's mockups: later children find theirs on `{base}` once
   the first PR merges, or take them from `{sha}` (step 4.1). After this,
   nothing needs the engineer unless a stop condition fires.

### 4. Build the next child

Take the first row, in order, that is `queued` or `building` and whose Needs
are all `merged`. (A `building` row is one step 3 prepared, or one a resumed
run is continuing.) Never pick a row twice in one session: a row this session
stopped, or left `queued` because its branch couldn't be pushed, waits for
the next run. When there is none, go to step 9.

#### 4.1 Branch

Resolve `{branch}` as `${CLAUDE_PLUGIN_ROOT}/templates/branch.md` describes
(already done if step 3 prepared this child). Set the row to `building` with
its Branch and write the home issue. Then, on the branch:

- the first child of the run commits whatever Readiness set up
  (`chore: set up orc`);
- if the child has mockups and `.orc/mockups/{number}/` isn't on the branch,
  take them from the approval commit and commit them:
  `git checkout {sha} -- .orc/mockups/{number}`.

#### 4.2 Implement

**Light** — make the change yourself, directly. No agents.

**Standard and Heavy** — break the issue into tasks, each with the files it
owns and the tasks it depends on. A real dependency is something one task
produces that another needs (a schema, an interface), not a shared theme.
Group them into waves: independent tasks with disjoint files run in parallel;
tasks that depend on each other, or share a file, go in different waves. A
small change is one task.

- Invoke `implementer` once per task, a wave at a time, passing the issue
  body, the task, its owned files, the focused verification command, any
  mockups, and the rules in `.orc/decisions/resolved.md` that apply to the
  task. It runs on `opus`. Use `sonnet` only for a task that is purely
  mechanical — a rename, boilerplate, config, copying an existing pattern —
  **and** touches none of: auth or permissions, schema or data, shared or
  public interfaces, concurrency, money. When unsure, `opus`.
- Invoke `test-writer` alongside the first wave, passing the issue body, the
  repo's test locations and commands, and the test files it owns. It writes
  the tests for the agreed behavior without seeing the implementation. Skip
  it when every criterion is checked by a command or by observation, or the
  repo has no test framework.
- An implementer that stops with a question: answer it from the issue, the
  code and the rules, record the decision, and invoke it again. If the honest
  answer is "this needs work outside the agreed scope" or "this changes
  behavior the engineer agreed to", that is a stop (step 8).

**After each wave** (or after your own change, on Light):

1. `git status --short` — only the files the wave owns changed (the
   uncommitted test files aside).
2. Run focused verification on what changed, leaving `test-writer`'s files
   out until step 4.3.
3. A failure goes back to the implementer that owns the file, with the
   output — or fix it yourself when it's trivial. Three attempts per wave;
   still failing is a stop (can't make progress).
4. Commit by explicit path (never `git add .`), `feat(#{number}): {summary}`
   or `fix(#{number}): {summary}`, and push. Add the wave's decisions to the
   issue's Decisions table (`${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`).

#### 4.3 Tests that can fail

- **Run the new tests**, if any were written. For each failure, find out which side is wrong
  before touching anything: a test that contradicts the issue gets fixed; an
  implementation that misses the issue gets fixed (never weaken an assertion
  to pass). Three rounds, then a stop.
- **Red against base, where it's cheap.** When the focused run takes about a
  minute or less: with the implementation committed and the new tests not
  yet, put each source file the branch modified back to `origin/{base}`
  (`git checkout origin/{base} -- {file}`), delete each it added, run the
  new tests, then restore everything with `git checkout HEAD -- {files}` and
  confirm `git status --short` shows only the tests. Leave tests, manifests,
  lockfiles and `.orc/` alone. Every new test that isn't guarding existing
  behavior must fail there, on its assertion. One that passes tests nothing:
  rewrite or delete it. When the run is slow, or can't work against a partial
  tree, skip this and say so in the PR.
- **Light:** a change in behavior gets a test when the repo has a test
  framework (a bug fix gets a regression test, run once without the fix to
  see it fail). Docs, copy and config get none.
- Commit the tests (`test(#{number}): {summary}`) and push.

#### 4.4 Visual check (children with mockups)

Run the app the way the repo documents (`CLAUDE.md`, the README, the dev
script). With the preinstalled headless browser (Playwright's `chromium`),
open each changed page in each state its mockup names, at desktop (1280) and
phone (390) width, and take a screenshot; reach empty, loading and error
states with seed data or by intercepting the page's requests. Screenshot the
mockup file in the same states and widths. Look at each pair and compare
structure, content and states — styling comes from the app's real components,
so pixel differences don't count.

- A mismatch: fix it (the owning implementer, or yourself) and shoot again.
  Three rounds.
- The page can't be made to match because the mockup can't be built as
  drawn: stop (step 8).
- The app can't run here (a missing service, secret or database): that is not
  a stop. Record `not checked here: visual check — {why}` for the PR.

Attach the screenshots as `${CLAUDE_PLUGIN_ROOT}/templates/pr.md` describes.

#### 4.5 Docs and changelog

Update docs the change makes wrong. If the repo keeps a `CHANGELOG.md`, add
an entry in the convention the file already uses (an `Unreleased` section, or
version headings), written for someone using the project. Commit and push.

### 5. Check, scaled to risk

The tier was set when the issue was filed. Check it against the real diff
(`git diff --stat origin/{base}...HEAD`) and raise it if the change turned
out to touch a Heavy trigger or grew; never lower it. Record a change of tier
in the issue and the status row.

| Tier | Typical change | Before the merge |
|---|---|---|
| **Light** | docs, copy, config, a one-line fix, a small contained change with nothing to trace | verification commands and CI |
| **Standard** | a normal feature or bug fix | Light, plus one independent reviewer checking the diff against the agreed behavior, each finding challenged by a verifier |
| **Heavy** | auth or permissions, payments, schema or data changes, public API or contract changes, external side effects, or more than about 400 changed lines of hand-written code | Standard, plus a four-way review, a deploy scan, mutation or coverage checks where the repo supports them, and an audit of the decision record |

**Light** — nothing more here: the verification commands already ran, and CI
runs in step 6. Go to the deploy notes below.

**Standard** — write the diff where agents can read it. They get the issue
body and this file, and nothing from the build conversation:

```bash
git diff origin/{base}...HEAD > .orc/tmp/{number}-diff.patch
```

1. Invoke `review-correctness` with the issue body and the diff path.
2. For each BLOCKER or WARNING it raises, invoke `finding-verifier` (all in
   parallel) with the finding, the issue body and the diff path. REFUTED is
   dropped. CONFIRMED counts. UNCERTAIN: read the code and decide.
3. Fix every finding that counts, in this PR — including a security problem
   in existing code the change touches, and quality problems; nothing is
   deferred. Re-run focused verification, commit, push, and record each one
   as a decision row (Where: `review`). A finding with several reasonable
   fixes: pick one. A fix that needs work outside the agreed scope, or
   changes agreed behavior, is a stop.

**Heavy** — the same, except:

1. In place of the single reviewer, invoke `review-correctness`,
   `review-security`, `review-impact` and `review-quality` in parallel, and
   with them invoke `deploy-risk-scanner` on the same diff. Verify and fix
   their findings as above, then run the agent that raised each fixed
   BLOCKER once more on the new diff.
2. **Mutation or coverage, where the repo supports it.** If `CLAUDE.md` has a
   `## Mutation Testing` section, run its command scoped to the changed
   source files. If a coverage tool is already set up, run the focused tests
   with it and list the changed lines nothing executes. If either finds
   gaps, invoke `test-writer` in `gap-fill` mode, once, with the surviving
   mutants and uncovered lines, and run again. What is still open goes in
   the PR under Scrutinize. Install nothing for this, and plant no breaks by
   hand.
3. Invoke `decision-auditor` with the issue body and the diff path. Lower
   each row it re-rates, and add each real choice it found unrecorded.

**Deploy notes.** Heavy: what `deploy-risk-scanner` returned. Light and
Standard: look at the diff yourself for new environment variables or config
keys, changed jobs or schedules, and one-time commands, and write the steps.
A migration or other data change makes the issue Heavy. Deploy notes never
block and are never a question — they go in the PR and the summary.

**Then, for every tier:** write the Decisions table back to the issue, and
do the Learning pass in `${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`
(history, and any rule a third matching choice promotes), committing
`.orc/decisions/` with the work.

### 6. Open the PR and merge

Write the description as `${CLAUDE_PLUGIN_ROOT}/templates/pr.md` describes and
open the PR — ready for review, not a draft. Set the row to `PR open` with the
PR number and write the home issue.

```bash
{gh-rest} pr-create --base {base} --title "{issue title}" --body-file .orc/tmp/{number}-pr.md   # prints {number,url}
```

Then loop until it merges or stops:

**CI.**

```bash
{gh-rest} pr-checks {pr} --watch --settle 60 --timeout 540   # exit 0 pass · 1 fail · 8 still pending
```

Pass `--settle 60` when the repo has CI configured (`.github/workflows/`, or
another provider's config), so checks that register a few seconds after the
push are seen; leave it out otherwise.

- **0** — go on.
- **8** — run it again, up to six times. Still pending: stop.
- **1** — get the log (`gh run view {run-id} --log-failed`; the run id is in
  the failing row's URL) and invoke `ci-debugger` with the check name, the
  log and the diff. Apply its fix, run focused verification, commit
  `fix(#{number}): {what}`, push, and watch again. **Three fix attempts**; a
  fourth failure is a stop. A failure the branch didn't cause: re-run it once
  (`gh run rerun {run-id} --failed`); if `{base}` itself is red, stop and
  name the check.

**Comments.** Once CI is green:

```bash
{gh-rest} pr-comments {pr}     # conversation comments
{gh-rest} pr-threads {pr}      # review threads; keep isResolved == false
gh api user --jq .login        # the engineer's login
```

Ignore every comment that starts with `<!-- orc:` — those are orc's own.

- **From the engineer** (their login, no marker): an instruction. Do it as
  worded.
- **From a bot or anyone else:** judge it against the code. Clear and right:
  fix it. Wrong, or not worth it: decline. Unsure whether a claimed bug is
  real: invoke `finding-verifier` with the comment as the finding —
  CONFIRMED is fixed, REFUTED is declined with its evidence.
- **Every one gets a reply** — the commit that fixed it, or the reason it
  was declined in a sentence or two — starting with `<!-- orc:reply -->` on
  its own line (`{gh-rest} pr-reply {pr} {first-comment-id} --body-file …`
  for a thread, `{gh-rest} pr-comment {pr} --body-file …` otherwise). Then
  resolve the thread: `{gh-rest} pr-resolve {pr} {first-comment-id}`. Record
  each one as a decision row.
- A comment blocks the merge only when it shows the scope was wrong — the fix
  needs work outside the agreed scope or changes agreed behavior. That is a
  stop.
- If fixes were pushed, go back to CI, then read comments once more. Two
  rounds at most; comments that arrive later are listed in the report and
  never hold the merge.

**Conflicts.** `{gh-rest} pr-view {pr} | jq -r .mergeable`. On `CONFLICTING`:
`git fetch origin {base} && git merge origin/{base}`, then invoke
`conflict-classifier`. If every file is simple, resolve them, run focused
verification on those files, commit, push, and go back to CI. If any is
complex, `git merge --abort` and stop.

**Merge.** With CI green, comments handled and no conflict, write the
Decisions table back to the issue and update the PR description if either
changed since the PR opened. Then:

```bash
{gh-rest} pr-merge {pr} --delete-branch
{gh-rest} pr-view {pr} | jq -r .state      # MERGED
```

If GitHub refuses the merge, stop with its message.

### 7. After the merge

1. Set the row to `merged`, clear its Branch, tick its Build plan line, and
   write the home issue. `{gh-rest} issue-close {number}` (the PR's
   `Closes` line usually already has).
2. With a parent: rewrite the summary comment
   (`${CLAUDE_PLUGIN_ROOT}/templates/parent.md`) — what shipped, decisions
   made without the engineer, deploy notes, new rules.
3. `git fetch origin {base}`, and go back to step 4.

When every row is `merged`: with a parent, `{gh-rest} issue-close {parent}`.
Then step 9.

### 8. Stop

The only reasons to stop a child and alert the engineer:

1. **The scope grew** — the acceptance criteria can't be met without work
   outside the agreed scope, or the work revealed a requirement that changes
   behavior the engineer agreed to.
2. **An approved mockup can't be built as drawn.**
3. **A decision contradicts a rule in `CLAUDE.md`** and following the rule
   doesn't resolve it.
4. **No progress is possible** — verification or CI still failing after the
   bounded attempts, CI that never finishes, a complex merge conflict, a
   merge GitHub refuses.

Everything else is decided, recorded and merged. Risk is not a reason to
stop: a change to data, auth, payments or anything irreversible merges with
deploy notes.

When one fires:

1. Commit what exists by explicit path (`wip(#{number}): stopped — {reason}`)
   and push. If the branch has commits and no PR, open one, its description
   starting `🔴 Stopped — see #{number}`. Leave the PR open; never merge it.
2. Post the stop comment on the issue, in the format in
   `${CLAUDE_PLUGIN_ROOT}/templates/parent.md`: exactly what is wrong, what
   is needed (recommendation first), where it stands, the command to continue.
3. Set its row to `stopped` with the reason, and every row that needs it —
   directly or through another row — to `stopped` with `waits on #{n}`.
   Write the home issue, and the summary comment when there is a parent.
4. Tell the engineer now, in three lines at most, and send a push
   notification if the host has a notification tool (`PushNotification`).
5. Go back to step 4: children that don't depend on it still build and merge.

### 9. Report

One short message:

```
🏁 {title} — {m} of {n} merged
✅ #{a} — {title} — {pr url}
🔴 #{b} — stopped: {reason} — {pr url} — needs: {what, in a few words}
⚠️ {anything not checked here · comments that arrived late · a child that needs a new session · mockups awaiting approval}
🚀 Before you deploy: {k} step(s) — {link to the summary comment or the PR}
📌 New rule: {situation} → {choice}
```

Omit lines with nothing to say; a one-line fix is two lines. Whenever the
run ends with anything not merged, the message ends with the exact command to
continue, alone in a fenced block:

````
```
/orc:ship {home issue number}
```
````

Then send a push notification if the host has a notification tool
(`PushNotification`): how many merged, and what needs the engineer.
