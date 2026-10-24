---
name: build
description: Take a specced issue from spec to open PR — decompose into a dependency-ordered task list, execute it (parallel subagents where tasks are independent), verify with focused tests, AI-review, and open the PR. Never merges. Invoke as /orc:build {number}.
model: opus
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say.

`build` takes one specced issue and drives it to an open, AI-reviewed PR for you
to merge. An issue of any size is built in one `build` run producing one PR —
there is no size gate. A draft PR opens right after branching (step 5) so you
can watch the diff land wave by wave; it's marked ready for review only once
implementation is done (step 9), which is also the earliest point `/orc:resume`
is allowed to act — before that, the implementation itself is still in
question, so a gate means a full rebuild, not a resume. When it can't safely
continue, it stops at a **gate**: commits and pushes whatever exists, comments
on the issue explaining why, sets `status:blocked`, and stops.

Everything project-specific — how to verify — comes from the repo's `CLAUDE.md`.
This skill hardcodes nothing about any one project.

## `--dry-run`

`/orc:build {number} --dry-run` runs everything through implementation,
verification, and review exactly as normal, including local git — the branch
is created and each wave is committed locally, so `git log` / `git diff
origin/main...HEAD` show real, inspectable output. It stops being "real" at
the network boundary: skip the `gh-rest issue-edit` label changes in steps 5 and
13, skip every `git push` (steps 8, 10, 11 — step 5 itself never pushes, it
only branches and opens the PR), and skip every `gh-rest pr-*` and `gh api` call in
steps 5, 9, 10, and 12 (create, edit, ready, comment, review) — print what
each would have sent instead. Step 12 still runs `pr-context-writer`, so its
body and comments can be inspected. Step 13 (CI watch, mergeability, the label
flip) needs a real, pushed PR to check against, so there's nothing genuine to
run there. End with:
```
DRY RUN — {n} wave(s) committed locally on branch {branch}, not pushed. Would
open a draft PR "{title}", mark it ready for review, and post an AI review
and review context.
Re-run without --dry-run to push and open it.
```
Gates still trip on real problems (spec, confidence, ambiguity, focused
verification, review blockers) — dry-run previews the push/PR boundary, it
doesn't skip validation.

## Gate procedure

Referenced throughout as "**gate: {name}**". When a gate trips:

1. Commit and push whatever exists on the branch (so it's inspectable) —
   unless nothing was built yet.
2. Comment on the issue. The recovery command depends on whether the PR has
   reached ready-for-review (step 9):
   ```
   🚧 Build paused: {gate name}

   {specific reason}

   What's needed: {the concrete fix}
   Resume: fix the above, then re-run `/orc:resume {number}` (continues from the reviewed PR).
   ```
   or, if the PR is still draft (implementation not yet complete — a full
   rebuild is correct here, not a resume):
   ```
   🚧 Build paused: {gate name}

   {specific reason}

   What's needed: {the concrete fix}
   Resume: fix the above, then re-run `/orc:build {number}` (it resets to origin/main and rebuilds from scratch — the draft PR is reused, not recreated).
   ```
3. Create the label defensively first (idempotent — a no-op if it already
   exists), then apply it:
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:blocked"
   ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:building" --add-label "status:blocked"
   ```
4. Stop.

If the user is actively in the loop, a gate may instead surface the problem and
offer to resolve it inline rather than pausing-and-exiting.

## Asking instead of gating

When you can ask — an interactive session with `AskUserQuestion` — the
judgment gates (**confidence**, **ambiguity**, and unresolved review findings)
become questions instead of a pause-and-exit. Everything else still gates, and
so does any run nobody can answer (no interactive user, or `AskUserQuestion`
unavailable): there, the gates work exactly as written below. A question left
unanswered becomes the gate.

**Rules first.** Read `.orc/decisions/resolved.md` (if the repo has one) in step
1. Before asking a question or choosing between alternatives, check it — on a
clear match, apply the rule and log `- applied: …` instead of asking. See
`${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`.

How to ask (the persona in `working-style.md`):

- **Only what changes the build.** Read the code, spec, and docs first. If the
  answer wouldn't change what gets built, decide, and log
  `- assumption: {what} — because {reason}` in the decision log.
- **Batch.** Collect every open question from a step (or a wave) and ask them
  in one round, up to four per `AskUserQuestion` call.
- **Propose.** Each question: what's unclear, your recommended answer as the
  first option (marked Recommended), the realistic alternatives, and what each
  costs.
- **Record the answer** in the decision log, so it reaches the PR and
  `/orc:walkthru`.

## Steps

### 0. Resolve target

Require an issue number (`^\d+$`) as `{number}`. If none is given, stop and ask
which issue to build.

Check GitHub access once, up front (cached, so repeat calls are free):

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight
```

If it fails, stop and show its message. GitHub calls in this skill go through
`gh-rest` (REST only), never `gh issue`/`gh pr`/`gh repo` subcommands — those
use GraphQL, which Claude Code on the web blocks with a 403.

### 1. Load

Invoke `issue-loader` with `{number}`. Use the returned title, slug, labels,
status, body, and spec comment.

Expect `status:ready`. If `status:blocked` or `status:building` from a prior
run, continue (this run resets the branch) — but if a PR already exists for
this issue **and it's marked ready for review**, `/orc:resume {number}` is
almost always what's wanted instead: it continues from the reviewed PR rather
than redoing real work. If the PR is still draft, there's nothing finished to
resume — a full `/orc:build` rebuild is correct. If `status:draft`: **gate:
spec** (no spec yet — run `/orc:plan {number}`).

### 2. Gate: spec

Validate the spec comment against `${CLAUDE_PLUGIN_ROOT}/templates/spec.md`.
Three conditions must hold:

1. A `## Spec` comment exists.
2. Every **Acceptance Criterion** is machine-verifiable — tied to a test,
   command, or observable outcome (not "looks right").
3. **Open Questions** reads `None.`

If any fail, **gate: spec** naming the specific criteria that can't be checked or
the questions still open. Point the user to `/orc:plan {number}` to (re-)spec.

### 3. Gate: confidence

Read the spec's touchpoints and locate the real files in the codebase. If there
is material ambiguity — a named file/symbol doesn't exist, two readings of a
criterion would produce different code, an unstated dependency blocks the work —
**gate: confidence**, listing the exact unknowns to resolve — or, when you can
ask, ask each unknown as a question with a recommended answer (see *Asking
instead of gating*) and continue once they're answered. Confidence is
judged on concrete facts, not a numeric score, and it is **not** a size check:
a large but well-specified issue passes. Only genuine ambiguity gates here.

### 4. Gate: missing infra

If `CLAUDE.md` has no `## Verification` section (and no `## Focused Verification`
section), there is no way to prove the build is sound → **gate: missing infra**
(run `/util:setup`).

### 5. Branch + draft PR

Always start from a clean base so reruns are deterministic:

```bash
git fetch origin main
git switch -C issue/{number}-{slug} origin/main
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:building"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:ready,status:blocked" --add-label "status:building"
```

`switch -C` force-recreates the branch even if a previous run already pushed
commits to it — that's deliberate, so a rerun of `/orc:build` (as opposed to
`/orc:resume`) always starts genuinely clean.

Open a draft PR immediately so the diff is visible as waves land, or reuse one
left over from a previous run of this same issue:

```bash
existing=$(${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-find "issue/{number}-{slug}" open)   # {number,url,state,draft} or empty
```

- **No open PR** — create one, in draft, with a placeholder body (the real
  body goes in at step 12):
  ```bash
  ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-create --draft --base main --title "{title}" \
    --body "🚧 Build in progress. Closes #{number}."   # prints {number,url}
  ```
  `{pr}` is the `number` it prints.
- **An open PR already exists** — reuse it (`pr` = its number). If it isn't
  already draft, put it back — its branch is about to be wiped and redone, so
  its state has to match:
  ```bash
  ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-ready {pr} --undo 2>/dev/null || true
  ```

Post the PR URL as an issue comment.

### 6. Plan the task list

Decompose the spec into a **task list with a dependency graph**. For each task,
note the files it will touch and which other tasks it depends on. A real
dependency is a decision or artifact one task produces that another needs (a
schema settled in task 2 that task 4 builds on) — not mere thematic similarity.

Group the tasks into waves:

- **Independent tasks** (no unmet dependency, and — ideally — disjoint file
  sets) run in **parallel**, one subagent each.
- **Dependent tasks** run **after** the tasks they depend on, in sequence.

Where two otherwise-independent tasks **share a file**, either serialize them
(same wave, but one after the other) or run them in isolated git worktrees and
reconcile the file before the integration pass. Never let two parallel subagents
write the same file concurrently.

### 7. Execute the waves

For each wave, dispatch its tasks:

- **Parallel** independent tasks via subagents: invoke `implementer` once per
  task, launched together. Give each the spec, its specific task, the exact files it
  owns, the focused verification command, and any `resolved.md` rules that
  apply. It touches nothing outside its files and reports its decisions back
  for you to record.
- **Choose each implementer's model by explicit rule**, set at dispatch (the
  agent defaults to `opus`). Downgrade to `sonnet` only when the task is
  *purely mechanical* — a rename, boilerplate, config, or copying an existing
  pattern to a new file — **and** touches none of: auth or permissions, data
  migrations or schema, shared or public interfaces, concurrency, money, or
  anything the spec's Key Logic calls out. Everything else stays on `opus`.
  When unsure, stay on `opus`.
- **Write the acceptance tests in parallel.** In wave 1, alongside the
  implementers, invoke `test-writer` with the spec, the repo's test locations
  and commands from `CLAUDE.md`, and the test files it owns. It writes tests
  from the spec **without reading the implementation**. Skip it when the spec's
  criteria are all verified by commands or observable outcomes rather than
  tests, or the repo has no test framework. Implementers don't write these
  tests; leave the test-writer's files unstaged until the tests pass (below).
- **No guessing.** If a task is ambiguous, incomplete, or conflicts with the
  codebase, stop that work and **gate: ambiguity** with the exact question and
  the options you see. When you can ask, a stopped task reports its question
  instead; once the rest of the wave finishes, ask the wave's questions
  together, then re-dispatch the stopped task with the answers.

After each wave, integrate the results (resolve any worktree reconciliation),
then run **focused verification and commit** (step 8) before starting the next
wave.

**Keep a decision log** at `.orc/tmp/{number}-decisions.md` (`mkdir -p
.orc/tmp` first) across all waves. It's the only record of *why* the code looks
the way it does — step 12 builds the reviewer context from it, and is forbidden
from inventing reasons the log doesn't hold. Record only what a reviewer couldn't see from the diff, one entry
per decision, as soon as it's made (subagents report theirs back for you to
record):

```markdown
- `{file}:{lines}` — {the choice} — over {rejected alternative(s)}, because {reason}
- `{file}` — departs from spec: {how}, because {reason}
- constraint: {something discovered in the codebase that shaped the work}
```

Skip anything obvious or forced by the spec. An empty log is fine for a
mechanical change.

### 8. Focused verification + commit per wave

Verification defaults to **scoped/filtered** test runs — never the full suite.
After each wave, run only the tests covering what that wave changed: the test
file(s) a task touched, or the domain around a shared file it modified.

Prefer the command in `CLAUDE.md`'s **`## Focused Verification`** section (a
PHPUnit `--filter`, `pytest -k`, a JS test-path arg, etc. — necessarily
per-repo). If that section is absent, derive a narrow invocation from
`## Verification` by scoping it to the touched paths. **Never run the whole
suite** — that is CI's job (step 13).

If `CLAUDE.md` has a **`## CI-Only Verification`** section, never run anything
it lists, in any form — those suites (typically slow, browser-driven e2e) are
left to CI entirely.

If a focused command fails and the fix isn't a trivially safe correction,
**gate: gate/verify** with the failing command and output. If a command can't
run (missing binary/env), record it and continue.

Once a wave's focused verification passes, commit and push it immediately —
this is what makes the draft PR's diff update live as the build progresses.
Stage only files that wave changed (never `git add .` blindly):

```bash
git add {wave's files}
git commit -m "feat(#{number}): {wave summary}"
git push
```

### 8b. Acceptance tests

After the last wave, if `test-writer` wrote tests, run them with the focused
command it returned. Each failure is one of two things — find out which before
touching anything:

- **The test contradicts the spec** (it asserts something the spec doesn't say,
  or relied on an interface the spec doesn't define — check its Assumptions
  against the implementation): fix the test, and log `- test: {file} — {what
  changed} — because {reason}`.
- **The implementation misses the spec**: fix the implementation (re-dispatch
  the owning `implementer` with the failure), then re-run.

Never weaken an assertion just to make it pass. If a failure can't be
classified from the spec, **gate: ambiguity**.

Once the tests pass, prove two things: **every test can fail**, and **every
behavior the change adds would be caught if it broke**. A test that can never
fail is worse than none, because it reads as coverage; a gap is a bug that will
ship green.

1. **Red against base.** Run the new tests against `origin/main`'s code with
   the new test files copied in (`git worktree add .orc/tmp/{number}-base
   origin/main`, copy the test files, run the focused command there, then
   `git worktree remove --force` it). Every test not marked `guards existing`
   must fail there — and fail on its **assertion**, not only on a missing import
   or undefined symbol; if the only failure is a missing symbol, judge from the
   test's `catches:` line whether its assertion would still bite. A test that
   passes on base and isn't guarding existing behavior tests nothing: rewrite
   it to assert what the change adds, or delete it.
2. **Behavior list.** Every behavior on `test-writer`'s list must map to a test
   or to a stated reason it isn't tested. An unmapped behavior is a gap.
3. **Changed-line coverage.** If the repo already has a coverage tool set up
   (`pytest-cov`, PHPUnit/Pest coverage with a driver, `c8`/Istanbul/Vitest
   coverage, JaCoCo, `go test -cover`, …), run the focused tests with coverage
   and list the **changed lines** (from `git diff origin/main...HEAD`) they
   never execute. Never chase a whole-repo percentage, and don't install a
   tool to get this — skip the step if none is set up.
4. **Break the code.** The implementation is committed, so this is safe.
   - If `CLAUDE.md` has a **`## Mutation Testing`** section, run its command
     scoped to the changed source files; every surviving mutant is a gap.
   - Otherwise plant breaks by hand. For **each changed function or method
     with logic** (skip pure wiring, getters, and declarations), make up to
     **five** small, realistic breaks, one at a time, starting with the logic
     the spec's Key Logic calls out: invert a condition, shift a boundary
     (`<` ↔ `<=`, off-by-one), delete a branch or early return, return a wrong
     or empty value, drop a side effect (a write, an event, a call), skip a
     validation. Run the tests covering that file after each break, record
     whether any failed, and restore with `git checkout -- {file}` before the
     next. A break no test catches is a gap.
   - A break that changes nothing a caller could observe (an equivalent
     mutant) isn't a gap: log `- test: {file}:{line} — break has no observable
     effect — {why}` and move on. Don't write a test for it.
5. **Fill the gaps.** Invoke `test-writer` in `gap-fill` mode with the
   surviving breaks, unmapped behaviors, and uncovered lines. Its new tests go
   through steps 1 and 4 too: each must fail on base (unless it guards existing
   behavior) and must catch the break it was written for. Any question it
   returns is a **gate: ambiguity**. Run one gap-fill round, then re-check;
   gaps still open after a second round go to step 10 as `WARNING`s ("untested:
   {behavior}") instead of looping.
6. **Read what's left.** Delete any remaining test that matches a pattern
   `test-writer` forbids (tautology, existence-only, over-mocked, framework,
   unreviewed snapshot, restated implementation), even if it passed the checks
   above — then re-run step 4 on the behaviors it covered, since deleting it
   may reopen a gap.

Log each deleted or rewritten test as `- test: {file}::{name} — {deleted |
rewritten} — because {it passed on base | survived a break | pattern}`, and the
totals as `- coverage: {n} breaks planted, {n} caught, {n} equivalent, {n} open`.
Then run focused verification on what changed, and commit and push the tests
together with any fixes (`test(#{number}): acceptance tests`).

### 9. Ready for review

All waves are implemented, verified, and pushed. Mark the PR ready and stash
the decision log in its body, hidden, so `/orc:resume` can recover it if this
run gates before step 12. The visible body stays a placeholder — step 12
writes the real one once review is done, so nothing is written here only to
be overwritten. Write `.orc/tmp/{number}-pr-body.md` as:

```markdown
Implementation done — review context posts after AI review. Closes #{number}.

<!-- orc:decisions
{the decision log, with any `-->` written as `--&gt;`}
-->
```

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-edit {pr} --title "{title}" --body-file .orc/tmp/{number}-pr-body.md
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-ready {pr}
```

Marking the PR ready for review **here** — not after review passes — is the
signal `/orc:resume` checks: a draft PR means implementation isn't finished
(resume refuses); ready-for-review means it is, and only review/CI/mergeability
are left (resume can continue from there).

### 10. Review (folded in)

Review the branch's full diff against `origin/main`. Refresh it first
(`git fetch origin main`) — the waves and verification above take time, so
`origin/main` may have moved since step 5. Run all five agents **in
parallel**, passing each the spec, the decision log, and the full
diff (`git diff origin/main...HEAD`) — never the build conversation, so each
reviews with fresh eyes:

- `review-correctness` — acceptance criteria, scope drift, logic errors
- `review-security` — injection, auth gaps, data exposure, insecure defaults
- `review-quality` — complexity, pattern consistency, test coverage
- `review-impact` — breaking changes, side effects, performance regressions
- `deploy-risk-scanner` — migrations, env vars, job schema, webhook/API changes

Each review agent tags findings `BLOCKER`, `WARNING`, or `NOTE`.
`deploy-risk-scanner` returns a risk level — treat `HIGH` as a `BLOCKER`, `low`
as a `NOTE`. Then run `/code-review` over the same diff as a sixth, independent
pass; if it isn't available here, note that and continue with the five agents.

**Verify every BLOCKER and WARNING before anyone acts on it.** Invoke
`finding-verifier` once per finding, all in parallel, passing the finding, the
spec, the decision log, and the diff. Then:

- **REFUTED** — drop it. Log `- review: {finding} — refuted: {evidence}`.
- **CONFIRMED** — keep it, at the verifier's severity.
- **UNCERTAIN** — keep it, and say so when you ask.

Only surviving findings go to auto-fix and to the user. `deploy-risk-scanner`'s
`HIGH` is exempt — a deploy risk is never refuted away; it's confirmed or
asked about.

**Auto-fix the safe ones** — lint, missing import, type error, obvious typo,
dead code the diff introduced. Never auto-fix anything that changes behavior or
touches logic the spec depends on. Commit and push auto-fixes together
(`fix: address review findings`) and re-run focused verification on what they
touched.

**Resolve the rest with the user.** When you can ask, don't hand over a PR with
findings still open. Ask one question per remaining BLOCKER or WARNING that
wasn't auto-fixed, batched: the finding, your recommended fix as the first
option, **Accept as is** (with the risk), and any other realistic fix. Then:

- **Fix** — apply it, commit and push (`fix(#{number}): {finding}`), re-run
  focused verification on what it touched, and re-run the agent(s) that raised
  it on the updated diff. A finding that comes back is asked once more; after
  that, **gate: review blocker**. Log `- review: {finding} — fixed: {what
  changed}`.
- **Accept** — log `- accepted: {file}:{line} — {finding} — because {their
  reason}`. An accepted BLOCKER counts as a WARNING in the review comment below,
  marked "accepted by you"; only they can downgrade it.

NOTEs stay dropped. Accepted WARNINGs still flow to step 12 as inline context,
as before. These log entries ride the decision log into the PR body in step 12,
so the resolution is on the PR as well as in `/orc:walkthru`.

Fill `${CLAUDE_PLUGIN_ROOT}/templates/ai-review.md` from the state after this
resolution — it's organized by
what needs the reader, not by agent: duplicates merged, NOTEs dropped, line-specific
WARNINGs left to step 12's inline comments and only counted here. Capture the
current commit (`git rev-parse HEAD` — after any auto-fix or resolution commit above) for the
template's `sha:` marker, and post it as a **PR comment** — never fold review
content into the PR description:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-comment {pr} --body-file {filled-template}
```

The `sha:`/`verdict:` marker line is load-bearing: it's how `/orc:resume`
tells a still-fresh review apart from a stale one. If a residual **BLOCKER**
remains after safe auto-fixes and the resolution above (or you can't ask),
**gate: review blocker** with the finding —
the posted comment's `verdict:BLOCK` is what a later `/orc:resume` will see.
Warnings do not block. Keep the WARNING findings (with file and line where
they have one) for step 12.

### 11. Docblocks, changelog + decisions

Update file-level docblocks for changed files. If the repo keeps a
`CHANGELOG.md`, invoke `changelog-writer` and insert its entry at the placement
it specifies — its output leads with a `Placement:` line naming exactly where
the blocks go (an existing `## [Unreleased]` section, a new version heading,
etc.). Commit and push any changes.

**Record decisions.** Take the decisions that could come up again in another
issue: the decision-log entries with a rejected alternative, answers you got in
this run, accepted review findings, and the spec's `- decision:` lines. Record
each one in `.orc/decisions/` as `${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`
describes — match, add, promote on the third matching choice, or ask you to
settle a conflict. Commit and push it as `chore(#{number}): record decisions`.
It rides the PR, so merging it is what confirms the decisions. Note each
promotion as `- rule promoted: {situation} → {choice}` in the decision log.

### 12. PR context

Give the reviewer what they need to review in **Files changed**: why
non-obvious choices were made, what deserves scrutiny, what can be skimmed.
This runs after step 11 so its line anchors point at the code as it will be
reviewed.

Remove context left by an earlier run of this step, so a rerun replaces
rather than duplicates it. Delete only marker comments nobody has replied to —
a thread with a reply is a conversation, and stays:

```bash
nwo=$(${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest repo)   # owner/repo
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-review-comments {pr} > .orc/tmp/{number}-comments.json
jq -r '[.[] | select(.in_reply_to_id) | .in_reply_to_id] as $replied
  | .[] | select(.body | startswith("<!-- orc:context -->"))
  | select(.id as $id | $replied | index($id) | not) | .id' \
  .orc/tmp/{number}-comments.json \
  | xargs -r -I % gh api -X DELETE repos/$nwo/pulls/comments/%
```

Invoke `pr-context-writer` with the issue number and body, the spec, the
decision log, step 10's WARNING findings, `{pr}`, `git rev-parse HEAD`, and
the output paths `.orc/tmp/{number}-pr-body.md` and
`.orc/tmp/{number}-context.json`. Then post what it wrote — the body, the line
comments as one review with no summary body (a submitted review can't be
deleted, so a summary would pile up on every rerun; skip the review when there
are no line comments), and each file-level comment (the review endpoint
doesn't take file-level comments). The PR body's `<!-- orc:context sha:… -->`
first line is what marks context as posted — not the review:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-edit {pr} --body-file .orc/tmp/{number}-pr-body.md
if jq -e '.comments | length > 0' .orc/tmp/{number}-context.json >/dev/null; then
  jq '{commit_id, event, comments}' .orc/tmp/{number}-context.json \
    | gh api -X POST repos/$nwo/pulls/{pr}/reviews --input -
fi
jq -c --arg sha "$(git rev-parse HEAD)" \
  '.file_comments[] | . + {commit_id: $sha, subject_type: "file"}' \
  .orc/tmp/{number}-context.json \
  | while read -r c; do echo "$c" | gh api -X POST repos/$nwo/pulls/{pr}/comments --input -; done
rm .orc/tmp/{number}-comments.json .orc/tmp/{number}-pr-body.md .orc/tmp/{number}-context.json
```

If GitHub rejects a review without a body, post each line comment on its own
through the `pulls/{pr}/comments` endpoint instead (with `commit_id`), the same
way as the file-level ones. If the review post is rejected for a line outside
the diff, drop the offending
comment, fold its text into the file-level comment for that path, and post
again — never skip the context entirely over one bad anchor.

### 13. Merge readiness

"Ready for review" isn't useful if it's red or unmergeable — check both before
reporting done. Neither step merges. **This is where the full test suite
runs** — CI is the authoritative full-suite check that focused local runs
deliberately leave to it.

**CI:**
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-checks {pr} --watch   # exit 0 pass, 1 fail, 8 pending
```
If a check fails, fetch its log (`gh run view {run-id} --log-failed`) and the
diff, invoke `ci-debugger`, and apply the fix only if it's clearly safe (missing
import, type error, lint, fixture update). Commit (`fix(#{number}): fix CI —
{reason}`), push, re-watch. If the fix isn't safe or checks still fail after one
attempt, **gate: gate/verify** with the failing check and diagnosis.

**Mergeability:**
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-view {pr} | jq -r .mergeable
```
If `CONFLICTING`: `git fetch origin && git rebase origin/main` to surface
markers, invoke `conflict-classifier`. Auto-resolve files it marks simple,
stage, `git rebase --continue`, then `git push --force-with-lease`. If any file
is marked complex, **gate: gate/verify** with the conflicting sections.

If either fix pushed a commit, re-run step 12 so the context matches the final
code.

**Once CI is green and the PR is mergeable**, the issue is genuinely built —
only now flip the label:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:built"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:building" --add-label "status:built"
```
Setting this any earlier risks a gate firing after `status:building` has
already been replaced — the gate procedure's label swap would then have
nothing to remove, leaving `status:built` and `status:blocked` on the issue at
the same time.

### 14. Report

```
PR open for #{number} — {pr-url}
CI green, mergeable. Review: {f} fixed with you, {a} accepted. Ready for your review.
```

End with the next-step line from `working-style.md`:
`➡️ Next: /orc:walkthru #{pr} — continue?` Not on a dry run, and not after a
gate.
