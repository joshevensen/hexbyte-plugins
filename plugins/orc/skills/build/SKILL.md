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

The build workflow's `PATHS` constant mirrors the middle rows (review agents,
coverage, breaks, gap-fill rounds); change both together.

## `--dry-run`

`/orc:build {number} --dry-run` runs everything exactly as normal, including
local git — the branch is created and each wave is committed locally, so
`git log` / `git diff origin/main...HEAD` show real, inspectable output. It
stops at the network boundary: skip every `git push`, every `gh-rest
issue-edit` label change, and every `gh-rest pr-*`, `comment-upsert`, and
`gh api` call — print what each would have sent instead (the decision record,
criteria ledger, and deploy notes stay in `.orc/tmp/` for inspection). The
workflow (step 7) gets `dryRun: true`: it commits locally but pushes nothing,
opens no PR, and posts nothing. With `pr` still null after the workflow, the
post-workflow steps print each comment body — decision record, AI review,
criteria ledger, deploy notes, PR body — instead of upserting it. End
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
   unless nothing was built yet. Post the decision record — to the PR, or to
   the issue if no PR exists yet (`templates/decisions.md`).
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

Invoke `issue-loader` with `{number}`. Use the returned title, slug, PR URL,
labels, status, body, and spec comment.

Expect `status:ready`. `status:blocked`, `status:building`, or `status:built`
from a prior run: continue — this run rebuilds from scratch. If the work is
already built and only needs changes, `/orc:walkthru` is the cheaper path; say
so and ask before rebuilding. `status:draft`: **gate: spec** (run
`/orc:plan {number}`).

**Blockers.** `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-blockers {number}`.
If any is still open, this build would start from a `main` that lacks code it
needs. Ask whether to build anyway (only right if the spec was planned
against the blocker's spec and doesn't touch its code); otherwise, or with no
one to ask, **gate: blocked** naming the open blockers.

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

The middle of the build runs as the plugin workflow `/orc:build-execute`
(step 7). If the `Workflow` tool isn't available in this session — workflows
are disabled, `CLAUDE_CODE_DISABLE_WORKFLOWS=1` is set, the `disableWorkflows`
setting is on, or a Pro plan hasn't turned on the `/config` toggle — or the
launch in step 7 errors because workflows are unavailable, that is also
**gate: missing infra**. What's needed: workflows enabled — a paid plan (on
Pro, turn workflows on in `/config`), with `CLAUDE_CODE_DISABLE_WORKFLOWS`
unset and `disableWorkflows` not set. Unattended runs (`claude -p`, the SDK,
scheduled runs) never show the approval prompt, so they also need a
`Workflow(orc:build-execute)` (or `Workflow(build-execute)`) allow rule in
`settings.json` — see the plugin README.

### 5. Branch

Resolve `{branch}` as `${CLAUDE_PLUGIN_ROOT}/templates/branch.md` describes —
never ask about it. In a cloud session with no PR yet, that's the session's
own branch. Note the issue's open PR, if rule 1 found one, as `{pr}`.

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

Write the decision record now: `mkdir -p .orc/tmp`, then create
`.orc/tmp/{number}-decisions.md` from the spec's Decisions table in the
format of `templates/decisions.md` (see *Decision record*). Every later
append and post works on this file.

`switch -C` deliberately discards a previous run's commits, so the **first
push** of this run is `git push --force-with-lease -u origin {branch}`; later
pushes are plain `git push`.

**Open the PR at the first push** — right here if the mockups commit exists
(push it now and launch the workflow with `pushed: true`), otherwise the
workflow opens it after wave 1's commit (GitHub won't open a PR with no
commits). Reuse the issue's open PR (`{pr}` from the branch rule) — `plan`
opens one when it commits mockups, and a previous build run leaves one:

- **None** — create it in draft, from `{branch}`:
  ```bash
  ${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-create --draft --base main --title "{title}" \
    --body "🚧 Build in progress. Closes #{number}."   # prints {number,url}
  ```
- **Exists** — reuse it, and put it back in draft if it isn't: `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-ready {pr} --undo 2>/dev/null || true`.

Then, when a PR was created or reused here, post the PR URL as an issue
comment and post the decision record. With no PR yet, the workflow does both
at its first push.

### 6. Plan the task list

Decompose the spec into a **task list with a dependency graph**. For each task,
note the files it will touch and which other tasks it depends on. A real
dependency is a decision or artifact one task produces that another needs (a
schema settled in task 2 that task 4 builds on) — not thematic similarity.

Group the tasks into waves:

- **Independent tasks** (no unmet dependency, and disjoint file sets) run in
  **parallel**, one subagent each.
- **Dependent tasks** run **after** the tasks they depend on.
- **Tasks that share a file** go in different waves, even when otherwise
  independent. Never let two parallel subagents write the same file.
- **S path:** one wave holding one task that carries the whole list, run by a
  single implementer.

Give each task an `id`, `title`, `description`, `files`, `dependsOn`, and a
`model`:

- **Choose each implementer's model by explicit rule**, set at dispatch (the
  agent defaults to `opus`). Downgrade to `sonnet` only when the task is
  *purely mechanical* — a rename, boilerplate, config, or copying an existing
  pattern to a new file — **and** touches none of: auth or permissions, data
  migrations or schema, shared or public interfaces, concurrency, money, or
  anything the spec's Key Logic calls out. When unsure, stay on `opus`.

Decide whether `test-writer` runs (`testWriter`): it writes the acceptance
tests from the spec, blind to the implementation, in parallel with wave 1.
Set it false when every criterion is verified by a command or observable
outcome, or the repo has no test framework. If it runs, pick the test files
it owns (`testFiles`) from the repo's test locations in `CLAUDE.md`; no
implementer task owns them.

### 7. Run the build workflow

The middle of the build — the waves, acceptance tests and their proofs,
`[e2e]` and `[optional]` checks, the review agents, and a `finding-verifier`
per finding — runs as the plugin workflow `/orc:build-execute`. It keeps every
intermediate result out of this conversation and returns one result object.

**Launch.** Launch `/orc:build-execute` through the `Workflow` tool with
these args, in this order:

```
Launch args
- number — the issue number
- title — the issue title, used for the draft PR
- branch — the branch from step 5
- pluginRoot — the expanded value of ${CLAUDE_PLUGIN_ROOT} (an absolute path); the workflow can't expand it
- pr — the PR number from step 5, or null when none exists yet
- pushed — true when step 5 already pushed the mockups commit
- dryRun — true on a --dry-run
- path — S, M or L, from step 2
- spec — the full spec comment text
- decisionsPath — .orc/tmp/{number}-decisions.md
- focused — the Focused Verification command from CLAUDE.md, or the rule for deriving a narrow one from Verification, plus any CI-Only Verification list
- mutation — the Mutation Testing command from CLAUDE.md, or null
- testInfo — test locations and commands from CLAUDE.md, or null when the repo has no test framework
- testWriter — step 6's decision on running test-writer
- testFiles — the files test-writer owns
- mockups — the mockup file paths under .orc/mockups/{number}/
- waves — step 6's waves: an array of waves, each an array of tasks {id, title, description, files, dependsOn, model}
- answers — {id, answer} entries; empty on the first launch, always the last key
```

If the launch errors because workflows are unavailable, **gate: missing
infra** (step 4). Otherwise record `{runId, args, relaunches}` (`relaunches`
starts at 0) to `.orc/tmp/{number}-workflow.json`, then wait for the
completion notification — the launch returns at once and the result arrives
later. Don't poll.

**On `question`.**

1. Ask the questions with `AskUserQuestion`, as *Asking* describes.
2. With nobody to ask, decide each question with `blocksLaterWork: false`
   yourself, record it as a **low**-confidence decision, and use your choice
   as its answer. Any question with `blocksLaterWork: true` → append
   `result.decisions` to the decision record, then **gate: ambiguity** with
   the questions.
3. Append `result.decisions` and each answer to the decision record, then
   post it.
4. Relaunch with `resumeFromRunId: {runId}` and the **identical** args object
   — nothing changed except `{id, answer}` entries appended to `answers`, so
   completed agents replay from their saved results. Update `runId` and
   increment `relaunches` in `.orc/tmp/{number}-workflow.json`, and wait
   again.
5. After 3 relaunches, a further `question` result is **gate: ambiguity**
   (append its `result.decisions` first).

**On `gate`.** Append `result.decisions` to the decision record first, then
run the Gate procedure with `gate.name`, `gate.reason` as the reason, and
`gate.needed` as what's needed. The gate commit stages only expected paths —
the test files, the failing wave's owned files, and files already committed
on the branch — by name; never `git add .` or `git add -A`. Any other path
`gate.reason` lists stays unstaged and is named in the issue comment.

**On `done`.** Take `pr` from the result. Append to the decision record, with
no deduping (the workflow's `wave-integrator` already wrote each wave's
implementer decisions):

- every entry in `result.decisions`
- `- test: {file} — {change} — because {reason}` under Constraints, one per
  `tests.testFixes` entry
- `- coverage: {planted} breaks planted, {caught} caught, {equivalent}
  equivalent, {open} open` under Constraints, from `tests.breaks`
- `- refuted: {finding} — {evidence}` under Review, one per REFUTED finding

**New session.** `resumeFromRunId` works only in the session that launched
the run. When `/orc:build` runs in a new session, steps 0–6 rerun as normal;
a `.orc/tmp/{number}-workflow.json` left by an earlier session is discarded,
and the workflow launches fresh with `pr` re-resolved by the branch rule.

**The result** has exactly these keys:

```
Workflow result
- status — done, question or gate
- questions — on question: {id, source, taskId, text, options, blocksLaterWork} per question; otherwise empty
- gate — on gate: {name (verify or ambiguity), reason, needed}; otherwise null
- pr — the PR number (the workflow opens it if none was passed); null on a dry run with no PR
- headSha — the commit the review diff was taken at
- commits — {sha, message} for each commit the workflow made
- decisions — decisions not yet in the record (test-writer, test-prover, review, workflow-level), each with its source; on a gate, also the failing wave's implementer decisions
- tests — {files, runWith, added, redOnBase, unmapped, uncoveredLines, breaks, mutationUnmeasured, testFixes, deleted}
- criteria — {criterion, status (met, not_met or not_run), proof} per acceptance criterion
- findings — {agent, severity, title, file, line, detail, verdict, evidence} per BLOCKER or WARNING, REFUTED ones included and marked; untested gaps and failed optional checks come as WARNINGs
- deploy — {needsNotes, destructive, notes} from the deploy scanner, or null
- notRun — {command, reason} for each command that couldn't run here
```

### 8. Review follow-through

On the L path, run `/code-review` over `git diff origin/main...HEAD`; if it
isn't available here, note that and continue. Invoke `finding-verifier` on
each BLOCKER and WARNING it raises (all in parallel, with the finding, the
spec, the decision record and `.orc/tmp/{number}-diff.patch`), exactly as the
workflow does for the review agents: REFUTED is dropped and recorded as
`- refuted:`, CONFIRMED and UNCERTAIN join `result.findings`. REFUTED findings
from the workflow are already recorded (step 7); UNCERTAIN ones stay, marked
uncertain.

**Fix what has one right answer.** Fix a surviving finding from
`result.findings` yourself when the fix is unambiguous and stays inside the
spec: lint, a missing import, a type error, dead code the diff introduced, a
confirmed spec violation, a crash, a security hole with a standard remedy.
Commit and push (`fix(#{number}): address review findings`), re-run focused
verification on what changed, rewrite the diff file
(`git diff origin/main...HEAD > .orc/tmp/{number}-diff.patch`, since the
review agents can't run git), re-run the agent(s) that raised each fixed
finding (its `agent` field) by invoking them directly with the spec, the
decision record, and the new diff, and record `- fixed: {finding} — {what changed}`. A fixed finding that comes back
is not fixed again — it stays open.

**Leave the rest for the walkthrough.** Every surviving finding not fixed
above — more than one reasonable fix, a fix outside the spec, a fixed finding
that came back, an `untested:` gap — goes into the decision table as a
**low**-confidence row: the finding, the options (each fix, and "accept as
is" with its risk), and your recommendation. The walkthrough only asks about
low-confidence rows, so nothing open may live anywhere else. Don't ask now —
no later work depends on it.

**Deploy notes.** If `result.deploy.needsNotes` is true, post
`result.deploy.notes` as a PR comment (when false, and a Deploy notes
comment exists from an earlier run, upsert it to `<!-- orc:deploy -->` + `## 🚀 Deploy notes` +
`None needed.` so stale steps never survive):

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {pr} "<!-- orc:deploy -->" --body-file .orc/tmp/{number}-deploy.md
```

starting with `<!-- orc:deploy -->` and `## 🚀 Deploy notes`. Deploy steps
are never findings and never block. A **destructive** change
(`result.deploy.destructive`) also goes into the decision table as a
**low**-confidence row ("Destructive: {what data is lost}" — options: ship as
is · make it non-destructive), so the walkthrough asks about it.

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

### 9. Criteria ledger

Post one line per acceptance criterion, with proof, as a PR comment — built
from `result.criteria`, with the Testing line from `result.tests` and each
`result.notRun` command recorded as not run:

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

### 10. Docblocks and changelog

Update file-level docblocks for changed files. If the repo keeps a
`CHANGELOG.md`, invoke `changelog-writer` and insert its entry at the
placement it specifies (its output leads with a `Placement:` line). Commit and
push any changes.

### 11. PR context and ready for review

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
decision record, step 8's WARNING findings, `{pr}`, `git rev-parse HEAD`,
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

### 12. Report

```
PR for #{number} — {pr-url} ({size}/{risk} path)
Criteria: {m}/{n} met{, {o} optional not run}. Review: {verdict}, {f} fixed.
For you: {k} low-confidence decision(s){, deploy notes posted}.
```

End with the next-step line from `working-style.md`:
`➡️ Next: /orc:walkthru #{pr} — continue?` Not on a dry run, and not after a
gate.
