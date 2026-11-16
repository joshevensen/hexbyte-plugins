---
name: build
description: Take a specced issue to a reviewed PR — decompose into a dependency-ordered task list, build it in waves (parallel subagents where tasks are independent), prove each acceptance criterion, AI-review, and record decisions with confidence. Verification depth follows the spec's size and risk. Never merges. Invoke as /orc:build {number}.
model: opus
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say.

`build` takes one specced issue and drives it to a reviewed PR ready for
`/orc:walkthru`. It runs on its own: the engineer did their thinking in
`plan`, so build asks only when an answer changes work it hasn't done yet.
Everything else it decides, records with a confidence level, and leaves for
the walkthrough.

Everything project-specific — how to verify — comes from the repo's
`CLAUDE.md`. This skill hardcodes nothing about any one project.

## What build proves

Every build, whatever its path, ends with:

1. **Every required acceptance criterion met, with proof** — a test name or
   command and its result, posted to the PR as the criteria ledger.
2. **Tests that can fail** — written from the spec by an agent blind to the
   implementation, each shown to fail against `main`.
3. **An independent review** — fresh agents that see only the spec, the
   decision record, and the diff, with every finding checked by a verifier
   before anyone acts on it.
4. **Every decision recorded** — options, choice, confidence — in the PR's
   Decisions comment.

The full test suite and mergeability are left to the PR's own CI;
`/orc:walkthru` checks both before merging.

## Paths

Read **Size** and **Risk** from the spec. High risk always takes the L path.
If the spec has no Size and Risk section (written by an older `plan`), assess
them yourself from the spec as `plan` step 5 describes, and say which you
chose in the report.

| | S, low risk | M, low risk | L, or high risk |
|---|---|---|---|
| Implementers | one, sequential | parallel waves | parallel waves |
| `test-writer` (blind, from spec) | ✅ | ✅ | ✅ |
| Red against base + behavior map | ✅ | ✅ | ✅ |
| Changed-line coverage (if a tool exists) | — | ✅ | ✅ |
| Breaks (mutation testing) | — | Key Logic functions, ≤ 3 each | every changed function with logic, ≤ 5 each |
| Gap-fill rounds | 0 | 1 | 2 |
| `[e2e]` criteria | if specced | ✅ | ✅ |
| `[optional]` criteria | try | try | try |
| Review agents | correctness, quality | + security, impact | + security, impact, `/code-review` |
| `finding-verifier` | ✅ | ✅ | ✅ |
| Deploy notes | ✅ | ✅ | ✅ |
| PR context comments | — | ✅ | ✅ |

## `--dry-run`

`/orc:build {number} --dry-run` runs everything exactly as normal, including
local git — the branch is created and each wave is committed locally, so
`git log` / `git diff origin/main...HEAD` show real, inspectable output. It
stops at the network boundary: skip every `git push`, every `gh-rest
issue-edit` label change, and every `gh-rest pr-*`, `comment-upsert`, and
`gh api` call — print what each would have sent instead (the decision record,
criteria ledger, and deploy notes stay in `.orc/tmp/` for inspection). End
with:
```
DRY RUN — {n} wave(s) committed locally on branch {branch}, not pushed. Would
open a PR "{title}" with the decision record, criteria ledger, AI review,
{and deploy notes}.
Re-run without --dry-run to push and open it.
```
Gates still trip on real problems — dry-run previews the push/PR boundary, it
doesn't skip validation.

## Asking

Ask (with `AskUserQuestion`, batched up to four per call, recommended answer
first, each option's cost stated) only when:

- the answer changes **work not yet done** — a later wave builds on it, or
  the remaining tasks can't proceed without it; or
- a gate would otherwise trip (confidence, ambiguity).

Everything else — a local choice, a low-confidence call with no downstream
effect, a review finding with more than one reasonable fix — is decided or
left open, recorded in the decision record, and asked in `/orc:walkthru`.
When nobody can answer (no interactive user, or `AskUserQuestion`
unavailable), the questions that would have been asked become the gate.

## Decision record

Keep `.orc/tmp/{number}-decisions.md` (`mkdir -p .orc/tmp`) in the format of
`${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`, starting from the spec's
Decisions table. Add each decision as it's made — yours, each implementer's,
answers you got, accepted or open review findings, and departures from the
spec — with options, choice, confidence, and why. Post it to the PR as the
Decisions comment once the PR exists, and re-post after every wave and after
review:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {pr} "<!-- orc:decisions -->" --body-file .orc/tmp/{number}-decisions.md
```

It's the only record of *why* the code looks the way it does — PR context
and the walkthrough are forbidden from inventing reasons it doesn't hold.

## Gate procedure

Referenced throughout as "**gate: {name}**". When a gate trips:

1. Commit and push whatever exists on the branch (so it's inspectable) —
   unless nothing was built yet. Post the decision record if a PR exists.
2. Comment on the issue:
   ```
   🚧 Build paused: {gate name}

   {specific reason}

   What's needed: {the concrete fix}
   Resume: fix the above, then re-run `/orc:build {number}` (it rebuilds from origin/main and reuses the PR).
   ```
3. Create the label defensively first (idempotent), then apply it:
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:blocked"
   ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:building" --add-label "status:blocked"
   ```
4. Stop.

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

Invoke `issue-loader` with `{number}`. Use the returned title, slug, branch,
labels, status, body, and spec comment.

Expect `status:ready`. `status:blocked`, `status:building`, or `status:built`
from a prior run: continue — this run rebuilds from scratch. If the work is
already built and only needs changes, `/orc:walkthru` is the cheaper path; say
so and ask before rebuilding. `status:draft`: **gate: spec** (run
`/orc:plan {number}`).

### 2. Gate: spec

Validate the spec comment against `${CLAUDE_PLUGIN_ROOT}/templates/spec.md`:

1. A `## Spec` comment exists.
2. Every required **Acceptance Criterion** (not `[optional]`) is
   machine-verifiable — tied to a test, command, or observable outcome.
3. **Open Questions** reads `None.`

If any fail, **gate: spec** naming the specific criteria that can't be checked
or the questions still open. Point to `/orc:plan {number}`.

Pick the path from Size and Risk (see *Paths*).

### 3. Gate: confidence

Read the spec's touchpoints and locate the real files. If there is material
ambiguity — a named file/symbol doesn't exist, two readings of a criterion
would produce different code, an unstated dependency blocks the work — ask
each unknown as a question with a recommended answer, or, when nobody can
answer, **gate: confidence** listing them. Judged on concrete facts, not a
score, and **not** a size check.

### 4. Gate: missing infra

If `CLAUDE.md` has no `## Verification` section (and no `## Focused
Verification` section), there is no way to prove the build is sound →
**gate: missing infra** (run `/util:setup`).

### 5. Branch

Always start from a clean base so reruns are deterministic, carrying over the
mockups `plan` committed to this branch:

```bash
git fetch origin main
git fetch origin {branch} 2>/dev/null || true
git switch -C {branch} origin/main
if git cat-file -e origin/{branch}:.orc/mockups/{number} 2>/dev/null; then
  git checkout origin/{branch} -- .orc/mockups/{number}/
  git commit -m "docs(#{number}): mockups"
fi
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:building"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:ready,status:blocked,status:built" --add-label "status:building"
```

`switch -C` deliberately discards a previous run's commits, so the **first
push** of this run is `git push --force-with-lease -u origin {branch}`; later
pushes are plain `git push`.

**Open the PR at the first push** — right here if the mockups commit exists,
otherwise after wave 1's commit (GitHub won't open a PR with no commits).
Reuse an open PR left by a previous run of this issue:

```bash
existing=$(${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-find "{branch}" open)   # {number,url,state,draft} or empty
```

- **None** — create it in draft:
  ```bash
  ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-create --draft --base main --title "{title}" \
    --body "🚧 Build in progress. Closes #{number}."   # prints {number,url}
  ```
- **Exists** — reuse it (`{pr}` = its number), and put it back in draft if it
  isn't: `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-ready {pr} --undo 2>/dev/null || true`.

Then post the PR URL as an issue comment and post the decision record.

### 6. Plan the task list

Decompose the spec into a **task list with a dependency graph**. For each task,
note the files it will touch and which other tasks it depends on. A real
dependency is a decision or artifact one task produces that another needs (a
schema settled in task 2 that task 4 builds on) — not thematic similarity.

Group the tasks into waves:

- **Independent tasks** (no unmet dependency, and — ideally — disjoint file
  sets) run in **parallel**, one subagent each. On the S path, run tasks
  sequentially in one implementer instead.
- **Dependent tasks** run **after** the tasks they depend on.

Where two otherwise-independent tasks **share a file**, either serialize them
or run them in isolated git worktrees and reconcile the file before the
integration pass. Never let two parallel subagents write the same file
concurrently.

### 7. Execute the waves

For each wave, dispatch its tasks:

- Invoke `implementer` once per task, launched together. Give each the spec,
  its task, the exact files it owns, the focused verification command, and
  the mockup files for any page it builds. It touches nothing outside its
  files and reports its decisions — with options and confidence — for you to
  record.
- **Choose each implementer's model by explicit rule**, set at dispatch (the
  agent defaults to `opus`). Downgrade to `sonnet` only when the task is
  *purely mechanical* — a rename, boilerplate, config, or copying an existing
  pattern to a new file — **and** touches none of: auth or permissions, data
  migrations or schema, shared or public interfaces, concurrency, money, or
  anything the spec's Key Logic calls out. When unsure, stay on `opus`.
- **Write the acceptance tests in parallel.** In wave 1, alongside the
  implementers, invoke `test-writer` with the spec, the repo's test locations
  and commands from `CLAUDE.md`, and the test files it owns. It writes tests
  from the spec **without reading the implementation**, `[e2e]` criteria
  included. Skip it when every criterion is verified by a command or
  observable outcome, or the repo has no test framework. Implementers don't
  write these tests; leave the test-writer's files unstaged until they pass
  (step 9).
- **A stopped task.** An implementer that stops returns a question. If it
  changes work not yet done, ask it once the rest of the wave finishes, then
  re-dispatch the task with the answer. Otherwise decide it yourself, record
  it as **low** confidence, and re-dispatch. Nobody to ask and it blocks:
  **gate: ambiguity**.

After each wave, integrate the results (resolve any worktree reconciliation),
then run focused verification and commit (step 8) before the next wave.

### 8. Focused verification + commit per wave

Run only the tests covering what that wave changed — never the full suite.
Prefer the command in `CLAUDE.md`'s **`## Focused Verification`** section. If
it is absent, derive a narrow invocation from `## Verification` by scoping it
to the touched paths. If `CLAUDE.md` has a **`## CI-Only Verification`**
section, never run anything it lists, in any form.

If a focused command fails and the fix isn't a clear, safe correction within
the spec, **gate: verify** with the failing command and output. If a command
can't run (missing binary/env), record it in the ledger and continue.

Once a wave passes, commit and push it, staging only the files that wave
changed (never `git add .` blindly), then re-post the decision record:

```bash
git add {wave's files}
git commit -m "feat(#{number}): {wave summary}"
git push            # --force-with-lease -u origin {branch} if this is the run's first push
```

### 9. Prove the tests

After the last wave, if `test-writer` wrote tests, run them with the focused
command it returned. Each failure is one of two things — find out which before
touching anything:

- **The test contradicts the spec** (it asserts something the spec doesn't
  say, or relied on an interface the spec doesn't define — check its
  Assumptions against the implementation): fix the test, and record
  `- test: {file} — {what changed} — because {reason}` under Constraints in
  the decision record.
- **The implementation misses the spec**: fix the implementation (re-dispatch
  the owning `implementer` with the failure), then re-run.

Never weaken an assertion just to make it pass. If a failure can't be
classified from the spec, ask, or **gate: ambiguity**.

Then prove the tests can fail and cover the change, at the depth the path
sets (see *Paths*):

1. **Red against base** (every path). Run the new tests against `origin/main`'s
   code, in place — a fresh worktree has no installed dependencies or local
   env file. The implementation is committed and the new tests are still
   uncommitted, so this is safe: for each source file the branch changed
   (`git diff --name-only --diff-filter=M origin/main...HEAD`), `git checkout
   origin/main -- {file}`; for each source file it added (`--diff-filter=A`),
   delete it. Leave test files, dependency manifests, lockfiles, and
   `.orc/` alone. Run the focused command, then restore with `git checkout
   HEAD -- {every file you touched}` and confirm `git status` shows only the
   uncommitted tests. Every test not marked `guards existing` must fail
   there — on its **assertion**, not only on a missing import or symbol (if
   the only failure is a missing symbol, judge from the test's `catches:` line
   whether its assertion would still bite). A test that passes on base and
   isn't guarding existing behavior tests nothing: rewrite or delete it.
2. **Behavior map** (every path). Every behavior on `test-writer`'s list maps
   to a test or a stated reason it isn't tested. An unmapped behavior is a gap.
3. **Changed-line coverage** (M, L). If the repo already has a coverage tool
   set up, run the focused tests with coverage and list the **changed lines**
   they never execute. Never chase a whole-repo percentage, and don't install
   a tool to get this.
4. **Break the code** (M: Key Logic functions, up to 3 breaks each; L: every
   changed function with logic, up to 5 each). The implementation is
   committed, so this is safe.
   - If `CLAUDE.md` has a **`## Mutation Testing`** section, run its command
     scoped to the changed source files (or their classes, if it scopes by
     class); every surviving mutant is a gap. If the command must end with a
     test path, take it from the tests this build added or changed (combine
     `git diff --name-only origin/main` with `git ls-files --others
     --exclude-standard`); if only one path is allowed, use the directory
     containing them all. A non-zero exit with no report is a failed run,
     not "no survivors": record it as unmeasured.
   - Otherwise plant breaks by hand, one at a time, starting with what Key
     Logic calls out: invert a condition, shift a boundary, delete a branch
     or early return, return a wrong or empty value, drop a side effect, skip
     a validation. Run the tests covering that file after each, record whether
     any failed, and restore with `git checkout -- {file}`. A break no test
     catches is a gap. A break with no observable effect isn't a gap — note it
     and move on.
5. **Fill the gaps** (M: 1 round, L: 2). Invoke `test-writer` in `gap-fill`
   mode with the surviving breaks, unmapped behaviors, and uncovered lines.
   Its new tests go through checks 1 and 4 too. A question it returns is
   asked, or recorded as a low-confidence decision. Gaps still open after the
   last round (and every gap on the S path) go to review as WARNINGs
   ("untested: {behavior}").
6. **Read what's left.** Delete any remaining test that matches a pattern
   `test-writer` forbids (tautology, existence-only, over-mocked, framework,
   unreviewed snapshot, restated implementation), then re-check the
   behaviors it covered.

Record the totals under Constraints as `- coverage: {n} breaks planted, {n}
caught, {n} equivalent, {n} open`. Commit and push the tests with any fixes
(`test(#{number}): acceptance tests`).

### 10. End-to-end and optional checks

- **`[e2e]` criteria** are covered by `test-writer`'s feature tests; confirm
  each passed in step 9. One that can't be proven is a failing criterion:
  fix the implementation, or **gate: verify**.
- **`[optional]` criteria** — run each command if this environment can (it
  has the network access, credentials, and data it names). A failure is a
  finding for review, not a gate. If it can't run, record `⏭️ not run —
  {reason}` in the ledger and move on.

### 11. Review

Refresh the base first (`git fetch origin main`). Run the path's review agents
**in parallel**, passing each the spec, the decision record, and the full
diff (`git diff origin/main...HEAD`) — never the build conversation, so each
reviews with fresh eyes:

- `review-correctness` — acceptance criteria, scope drift, logic errors (every path)
- `review-quality` — complexity, pattern consistency, test coverage (every path)
- `review-security` — injection, auth gaps, data exposure, insecure defaults (M, L)
- `review-impact` — breaking changes, side effects, performance regressions (M, L)
- `deploy-risk-scanner` — deploy notes, not findings (every path)

On the L path, also run `/code-review` over the same diff; if it isn't
available here, note that and continue.

**Verify every BLOCKER and WARNING.** Invoke `finding-verifier` once per
finding, all in parallel, passing the finding, the spec, the decision record,
and the diff. **REFUTED** — drop it, recording `- refuted: {finding} —
{evidence}` under Review. **CONFIRMED** — keep it at the verifier's severity.
**UNCERTAIN** — keep it, marked uncertain. NOTEs are dropped.

**Fix what has one right answer.** Fix a surviving finding yourself when the
fix is unambiguous and stays inside the spec: lint, a missing import, a type
error, dead code the diff introduced, a confirmed spec violation, a crash, a
security hole with a standard remedy. Commit and push (`fix(#{number}):
address review findings`), re-run focused verification on what changed,
re-run the agent(s) that raised each fixed finding on the new diff, and
record `- fixed: {finding} — {what changed}`. A fixed finding that comes back
is not fixed again — it stays open.

**Leave the rest for the walkthrough.** A finding with more than one
reasonable fix, or one that might be accepted as is, goes into the decision
table as a **low**-confidence row: the finding, the options (each fix, and
"accept as is" with its risk), and your recommendation. Don't ask now — no
later work depends on it.

**Deploy notes.** If `deploy-risk-scanner` says **Needs notes: yes**, post
its steps as a PR comment:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {pr} "<!-- orc:deploy -->" --body-file .orc/tmp/{number}-deploy.md
```

starting with `<!-- orc:deploy -->` and `## 🚀 Deploy notes`. Deploy steps
are never findings and never block. A **destructive** change also goes into
the decision table as a **low**-confidence row ("Destructive: {what data is
lost}" — options: ship as is · make it non-destructive), so the walkthrough
asks about it.

**AI review comment.** Fill `${CLAUDE_PLUGIN_ROOT}/templates/ai-review.md`
from the state after fixes — organized by what needs the reader, not by
agent: duplicates merged, NOTEs dropped, line-specific WARNINGs left to the
PR context comments and only counted here. Capture the current commit
(`git rev-parse HEAD`) for the `sha:` marker, and post it:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {pr} "<!-- orc:ai-review" --body-file {filled-template}
```

The verdict is BLOCK while any BLOCKER is open — `/orc:walkthru` won't merge
until it's resolved there. Re-post the decision record.

### 12. Criteria ledger

Post one line per acceptance criterion, with proof, as a PR comment:

```markdown
<!-- orc:criteria -->
## ✅ Acceptance criteria

| # | Criterion | Status | Proof |
|---|---|---|---|
| 1 | {criterion} | ✅ met | `tests/Feature/ImportTest.php::it rejects oversized files` — passed, failed on base |
| 2 | [e2e] {flow} | ✅ met | `{test}` — passed |
| 3 | [optional] {check} | ⏭️ not run | needs network access to {host} |
| 4 | {criterion} | ❌ not met | {why — and the open decision row it's tied to} |

**Testing:** {n} tests added · {coverage totals} · focused runs only — CI runs the full suite.
```

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {pr} "<!-- orc:criteria -->" --body-file .orc/tmp/{number}-criteria.md
```

Proof is a test name or command plus its result — never "looks right". A
required criterion that's ❌ not met keeps the AI review verdict at BLOCK.

### 13. Docblocks and changelog

Update file-level docblocks for changed files. If the repo keeps a
`CHANGELOG.md`, invoke `changelog-writer` and insert its entry at the
placement it specifies (its output leads with a `Placement:` line). Commit and
push any changes.

### 14. PR context and ready for review

**M and L paths:** give the reviewer what they need in **Files changed**.
Remove context left by an earlier run first — only marker comments nobody has
replied to; a thread with a reply stays:

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
decision record, step 11's WARNING findings, `{pr}`, `git rev-parse HEAD`,
and the output paths `.orc/tmp/{number}-pr-body.md` and
`.orc/tmp/{number}-context.json`. Then post what it wrote — the body, the line
comments as one review with no summary body (skip the review when there are no
line comments), and each file-level comment:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-edit {pr} --title "{title}" --body-file .orc/tmp/{number}-pr-body.md
if jq -e '.comments | length > 0' .orc/tmp/{number}-context.json >/dev/null; then
  jq '{commit_id, event, comments}' .orc/tmp/{number}-context.json \
    | gh api -X POST repos/$nwo/pulls/{pr}/reviews --input -
fi
jq -c --arg sha "$(git rev-parse HEAD)" \
  '.file_comments[] | . + {commit_id: $sha, subject_type: "file"}' \
  .orc/tmp/{number}-context.json \
  | while read -r c; do echo "$c" | gh api -X POST repos/$nwo/pulls/{pr}/comments --input -; done
rm .orc/tmp/{number}-comments.json .orc/tmp/{number}-context.json
```

If GitHub rejects a review without a body, post each line comment on its own
through `pulls/{pr}/comments` (with `commit_id`). If a comment is rejected for
a line outside the diff, fold its text into that file's file-level comment
and post again — never skip the context entirely over one bad anchor.

**S path:** no context comments. Set the title and a body of
`{one-line summary}` + `Closes #{number}.` with `gh-rest pr-edit {pr} --title
"{title}" --body-file …`.

Then mark the PR ready and the issue built:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-ready {pr}
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:built"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {number} --remove-label "status:building" --add-label "status:built"
```

Build doesn't wait for CI — the PR runs it, and `/orc:walkthru` checks it
(and mergeability) before anything merges.

### 15. Report

```
PR for #{number} — {pr-url} ({size}/{risk} path)
Criteria: {m}/{n} met{, {o} optional not run}. Review: {verdict}, {f} fixed.
For you: {k} low-confidence decision(s){, deploy notes posted}.
```

End with the next-step line from `working-style.md`:
`➡️ Next: /orc:walkthru #{pr} — continue?` Not on a dry run, and not after a
gate.
