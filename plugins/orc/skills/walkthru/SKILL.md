---
name: walkthru
description: Finish a built PR with the engineer — check CI and mergeability (fixing them if needed), handle PR comments (Copilot, bots, the engineer's own), show a one-screen summary, ask only about low-confidence decisions, departures from the spec, and open findings, take last-minute changes through a mini build, then squash-merge on an explicit yes. Use after /orc:build. Invoke as /orc:walkthru [pr number].
model: opus
---

## User Input

```text
$ARGUMENTS
```

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md`; what follows is specific to this skill.

The engineer did their thinking in `plan` and `build` ran on its own. This
skill spends their time only where it's needed: what orc wasn't sure about,
and any last changes. It replaces the GitHub PR review — the independent AI
review already ran in `build`.

You are the junior developer who built this, reporting to your senior. First
person ("I chose…"), short, no apologizing, no flattery. Never invent a
reason: every *why* comes from the decision record, the spec, or the code —
label anything inferred.

## 1. Gather

Check GitHub access once (`${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight`;
stop with its message if it fails). GitHub calls go through `gh-rest`, never
GraphQL-backed `gh` subcommands.

1. **PR.** `$ARGUMENTS` PR number, else
   `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-current`. None → say so in one line
   and stop. The issue number is in the PR body (`Closes #n`) or the branch
   name.
2. **PR comments** (`${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-comments {pr}`),
   each found by its first line:
   - `<!-- orc:decisions -->` — the decision record
   - `<!-- orc:criteria -->` — the criteria ledger
   - `<!-- orc:ai-review sha:… verdict:… -->` — the review verdict and the
     `orc:warnings` block
   - `<!-- orc:deploy -->` — deploy notes, if any
3. **Spec** (`${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-view {issue}`, the
   `## Spec` comment) — criteria, Size and Risk, Mockups.
4. **Unresolved PR comments** — everything not written by orc (skip any
   comment whose body starts with `<!-- orc:`):
   - review threads: `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-threads {pr}`,
     keeping `isResolved == false`. A thread's author is its first non-orc
     comment's author.
   - conversation comments from `pr-comments`, unless a later comment already
     answers or withdraws them.
   Tag each as **yours** (`gh api user --jq .login`) or **someone else's**
   (Copilot, other bots, other people).
5. **The change.** Check out the PR branch
   (`${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-checkout {pr}`) and read
   `git diff origin/main...HEAD` as needed — never dump it.

**Not built by orc** (no decision record) → say so up front: "I didn't build
this — I'm working from the diff and spec, so I can say what, not what else
was considered." There are no flagged decisions to ask about; go straight from
the summary to last changes.

## 2. Make it mergeable

Before taking the engineer's time, make sure the PR can actually merge.

**CI.** `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-checks {pr}` (exit 0 pass,
1 fail, 8 pending).
- **Failing** — fetch the log (`gh run view {run-id} --log-failed`), invoke
  `ci-debugger` with it and the diff. If its fix is clearly safe (missing
  import, type error, lint, fixture update) and inside the spec, apply it as a
  mini build (step 6) without asking. Otherwise make it the first question in
  step 4, with ci-debugger's diagnosis and proposed fix.
- **Pending** — carry on; re-check before merging.

**Mergeability.** `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-view {pr} | jq -r .mergeable`.
If `CONFLICTING`: `git fetch origin main && git rebase origin/main` to
surface the markers, invoke `conflict-classifier`, resolve the files it marks
simple, and `git rebase --continue`. A file it marks complex → resolve it
only if the right answer is clear from both sides' intent, else ask in step 4
with the conflicting hunks. Re-run focused verification on the conflicted
files, then `git push --force-with-lease`.

**PR comments.** Work each one from step 1:

- **Yours** — an instruction. A change request goes into the next mini build
  as worded, no question asked; a question gets a short reply. Unclear what
  you want → ask in step 4.
- **Someone else's** — judge it before acting. Invoke `finding-verifier` on
  each, all in parallel, passing the comment as the finding.
  - **REFUTED** — don't act on it.
  - **CONFIRMED, one right fix** inside the spec — fix it in a mini build
    (step 6) without asking.
  - **CONFIRMED with more than one reasonable fix, UNCERTAIN, or outside the
    spec** — ask in step 4, with your recommendation.

Every comment gets a reply when it's settled — what was done, or in one or
two sentences why not — via `gh-rest pr-reply {pr} {first-comment-id}` for a
thread or `gh-rest pr-comment {pr}` for a conversation comment. Start every
reply with `<!-- orc:reply -->` on its own line: replies post under the
engineer's login, and without the marker a later run would read them as the
engineer's own instructions. Then resolve
the thread (`gh-rest pr-resolve {pr} {first-comment-id}`). Never resolve one
silently. A thread still waiting on the engineer stays open.

## 3. Summary — one screen, no question

```
### 📋 #{issue} — {title}  ({size}/{risk})
- {2–3 bullets: what was built, in the engineer's terms}

✅ Criteria: {m}/{n} met{ · {o} optional not run}
{each ❌ or ⏭️ criterion, one line with why}
🔍 Review: {verdict} · {f} fixed{ · {w} open}
🚦 CI: {green | fixed: {what} | pending | red: {why}} · {mergeable | conflicts resolved | conflicts need you}
💬 Comments: {none | n — {f} fixed, {d} declined, {q} need you}
🚀 Deploy: {none | n step(s) — see Deploy notes}
⚖️ Decisions: {n} recorded · {k} need you
📁 Mockups: {paths, if any}
```

If the spec has mockups, send them with `SendUserFile` (`display: "render"`)
when that tool is available, so the engineer can compare them with what was
built.

## 4. Ask only what needs the engineer

The questions are, in this order:

1. A CI failure or merge conflict step 2 couldn't fix safely.
2. PR comments step 2 couldn't settle on its own.
3. Every **low**-confidence row in the decision record — including departures
   from the spec, open review findings, and destructive changes.
4. Every ❌ not-met required criterion, with your proposed fix.

Nothing else: high-confidence decisions, fixed findings, met criteria, and
safe files are not asked about. Zero questions is the normal case for a clean
build — then go straight to step 5.

Ask with `AskUserQuestion`, batched up to four per call. Each question names
the item and where it is (`path:line`), then gives:

- your recommendation first (marked Recommended), with one line on why
- the realistic alternative(s), each with what it costs
- for a review finding, **Accept as is** with its risk

Free text ("Other") takes anything else — a question, a different change, or
"show me the code". Answer a question briefly and ask the item again; show
code as the changed hunk only (≤ 30 lines, link the rest as `path:line`).

**When the engineer pushes back.** If you have evidence (a test, an existing
pattern, a constraint in the spec or the record), state it once. If they still
disagree, take their choice. If you have none, say so: "No strong reason — the
other way works too." Never cave instantly, never argue twice, never invent a
reason.

Record each answer in `.orc/tmp/{issue}-decisions.md` (a copy of the
decision record): the row's **Status** becomes `✅ confirmed` when they kept
the choice, or `🔁 changed to {choice}` — which is a change request for
step 6.

## 5. Last changes

Ask with `AskUserQuestion` (header: `Last changes`):

- **Merge it** — only offered when nothing blocks it (see step 7)
- **Make changes** — free text: what to change
- **Stop here**

The free text may also say a decision should become a project rule ("make
decision 3 a rule") — mark that row `📌 rule` (alongside its other status);
`/orc:learn` picks it up after merge.

If there are change requests — from step 4 or here — run a mini build
(step 6), then come back and ask this again.

## 6. Mini build

For each batch of change requests:

1. **Implement.** Small, local changes: make them yourself. Anything touching
   several files or Key Logic: invoke `implementer` per task, as `build`'s
   waves do. Pass the mockups if a page changes.
2. **Test.** Add or update tests for the changed behavior; each new test must
   fail against the code before the change (check by stashing the change, as
   `build`'s `test-prover` does against base). Run focused verification on everything
   touched.
3. **Commit and push** — `fix(#{issue}): {change}`.
4. **Review the delta.** Run `review-correctness` and `review-quality` (plus
   `review-security` on a high-risk spec) on `git diff {sha before}..HEAD`,
   passing the spec and the decision record. Invoke `finding-verifier` on each
   BLOCKER or WARNING. Fix the ones with one right answer; ask about the rest
   in the next step-4 round.
5. **Update the PR** with `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert`:
   the decision record (`<!-- orc:decisions -->`, with statuses and any new
   decisions), the criteria ledger (`<!-- orc:criteria -->`) if a criterion's
   proof changed, and the AI review comment's `sha:` and verdict
   (`<!-- orc:ai-review`). Re-run `deploy-risk-scanner` if the change touched a
   migration, job, env var, or contract, and update `<!-- orc:deploy -->` —
   to `None needed.` if the notes no longer apply. A deploy notes comment
   reading `None needed.` counts as no deploy steps in the summary and merge
   report.
6. **Report** in ≤ 4 bullets: what changed, the tests, the review result.

A change that undoes or reshapes the spec itself (new scope, a different
approach) isn't a last change — say so and suggest `/orc:plan {issue}` instead.

## 7. Merge

Before offering **Merge it**, all of these must hold:

- CI green — `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-checks {pr} --watch --timeout 900`
  (re-check now; a mini build pushed new commits)
- mergeable
- AI review verdict not BLOCK
- no required criterion ❌ not met
- no unanswered low-confidence row
- no unresolved PR comment (re-check `pr-threads` — Copilot reviews again
  after a push)

If any fails, say exactly which in one line and offer **Make changes** /
**Stop here** only.

Before merging, post the final decision record (statuses included) with
`comment-upsert` — `/orc:learn` reads it later. Then, only on an explicit
**Merge it**:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-merge {pr} --delete-branch
```

Report in one line. If the PR has deploy notes, add:
`🚀 Deploy notes: {n} step(s) on the PR — run them with this deploy.`

**Related issues.** Find the parent as "Finding the parent" in
`${CLAUDE_PLUGIN_ROOT}/templates/build-plan.md` describes, using step 1's
`issue-view {issue}` output. If there is no parent, skip this paragraph
entirely — no tick, no block, no list, no message. Otherwise:

1. Read the parent's body (`gh-rest issue-view {parent}`) and find the merged
   issue's checklist line in either state (`- [ ] #{issue}` or
   `- [x] #{issue}`), using the template's non-digit matching rule. If it's
   unticked, tick it (`- [ ] #{issue}` → `- [x] #{issue}`) and save it
   (`gh-rest issue-edit {parent} --body-file …`). If it's already ticked (a
   re-run, or ticked by hand), change nothing and say nothing.
2. If the body has no line for the issue in either state, say so in one line:
   `Parent #{parent}'s build plan has no line for #{issue} — not ticked.`
   The issue is still excluded from candidates, and the parent is not closed.
3. Close the parent (`gh-rest issue-close {parent}`) and stop, with no block,
   only when item 1 found the merged issue's line **and** no unticked
   `- [ ] #` line remains. A parent whose body has no checklist line for the
   merged issue (e.g. a hand-linked epic without a build plan) is
   never closed by walkthru.
4. Otherwise pick the next issue as "Picking the next issue" in the same
   template describes, and end the message with its block.

Message order: the one-line merge report, then the no-line note if any, then
the deploy-notes line if any, then the next-issue block if any — always last.

## Rules

- Never merge without the explicit **Merge it** choice.
- Never ask about something high-confidence or already fixed; never pad.
- Every claim backed by the decision record, the spec, git, or the code.
  Label inferences.
- Nothing is posted except replies to PR comments, the orc comment updates
  in steps 6–7, and the merge.
