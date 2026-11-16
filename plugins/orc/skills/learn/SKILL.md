---
name: learn
description: Turn decisions from merged orc PRs into project instructions — reads the Decisions comment on each merged PR not yet learned from, proposes rules for the choices that recur or that the engineer tagged as rules, and on approval writes them into the right CLAUDE.md files and opens a PR. Run every so often. Invoke as /orc:learn [--dry-run].
model: opus
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say.

`learn` is how orc gets better at a repo over time. `build` and `walkthru`
record every decision on the PR (`${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`);
most are specific to one feature and should stay there. `learn` finds the few
that are really project conventions and moves them into `CLAUDE.md`, where
every session — orc or not — reads them. It also keeps those files lean by
proposing to remove rules that went stale.

Nothing is written without the engineer's approval, and nothing merges: the
result is a PR.

## `--dry-run`

Run steps 1–5 as normal and write approved edits to the working tree, but
skip the branch, commit, push, PR, and labels. End with:
```
DRY RUN — {n} rule(s) written to the working tree, not committed. {m} PR(s) would be labelled orc:learned.
```

## Steps

### 1. Collect

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "orc:learned"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-merged-list --label orc:learned --limit 50
```

That lists merged PRs not yet learned from, newest first. For each, read its
comments (`gh-rest pr-comments {pr}`) and take the one starting with
`<!-- orc:decisions -->`. A PR without one has nothing to learn from — it
still gets labelled in step 6.

From each record, keep every decision row with: the decision (situation), the
choice, the options it beat, why, where (paths), confidence, status, and the
PR number. Ignore the Constraints and Review sections except for accepted
review findings, which are decisions too.

**Legacy decisions files.** If the repo still has `.orc/decisions/made.md` or
`.orc/decisions/resolved.md` (from orc before 0.15), read them as extra
input: every rule in `resolved.md` is a candidate, and every `made.md`
section with two or more issues that chose the same way is a candidate. The
PR from step 6 deletes `.orc/decisions/` once its content has been
considered — say so when proposing.

### 2. Find candidates

A decision becomes a candidate rule when **any** of these hold:

- its status includes `📌 rule` — the engineer asked for it
- the same situation was decided the same way in **two or more** PRs
  (match by meaning, not wording — "where retries live in queued jobs" and
  "retry placement for jobs" are the same situation)
- it was `🔁 changed` by the engineer in a walkthrough **and** the situation
  is general (not about this feature's own behavior) — a correction worth not
  repeating

Drop anything specific to one feature's behavior, copy, or data — a
convention says how this codebase does a *kind* of thing.

**Conflicts.** If the same situation was decided differently across PRs,
it's a candidate only if the engineer settles it: ask which is the rule, or
what it depends on (then the rule names that condition).

### 3. Check what's already there

Find every instruction file (`git ls-files '*CLAUDE.md'`) and read the ones
relevant to each candidate. For each candidate:

- **Already covered** — the same rule exists → drop it.
- **Contradicts an existing rule** → propose replacing the old rule, quoting
  both.
- **New** → pick where it goes: the `CLAUDE.md` in the **deepest directory
  that contains every path the rule applies to** (e.g.
  `database/migrations/CLAUDE.md` for a migration convention); the root
  `CLAUDE.md` only for rules that span the codebase. Propose creating a
  directory `CLAUDE.md` only when that directory already holds a distinct
  area (its own models, jobs, or pages) — otherwise use the nearest existing
  one.

Also look for **stale rules** in the files you read: a rule naming a path,
class, command, or package that no longer exists, or one a recent merged
decision reversed. Propose removing or updating each.

### 4. Write the proposals

Each rule is one or two lines in the target file's existing style:

```markdown
- {Do X} when {situation} — {why, in one clause}. (#{pr}, #{pr})
```

Imperative, specific enough to act on, no history beyond the PR numbers. If
the target file has a section that fits, the rule goes there; otherwise add
it at the end under a short heading that fits the file.

### 5. Approve

Show the proposals grouped by target file, then ask with `AskUserQuestion`,
up to four per call, one question per proposal: the file, the exact text
(and for a replacement or removal, the text it replaces), and the PRs it
comes from. Options: **Add** / **Reword** (free text gives the wording) /
**Skip**. Apply only what was approved.

Zero candidates is a normal result: say "Nothing new to learn from {n} PR(s)."
and go to step 6 to label them.

### 6. Open the PR and label

```bash
git fetch origin main
git switch -C orc/learn-$(date +%Y%m%d) origin/main
# apply the approved edits; git rm -r .orc/decisions if the legacy files were folded in
git add {edited files}
git commit -m "docs: learn project rules from merged PRs"
git push --force-with-lease -u origin orc/learn-$(date +%Y%m%d)
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest pr-create --base main --title "Learn project rules from {n} merged PR(s)" --body-file .orc/tmp/learn-pr-body.md
```

The PR body lists each rule added, changed, or removed, with its source PRs.
Skip the branch and PR when nothing was approved.

Then label every PR collected in step 1 — including ones with nothing to
learn and ones whose candidates were skipped — so the next run doesn't
reconsider them:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {pr} --add-label "orc:learned"
```

### 7. Report

```
Learned from {n} PR(s): {a} rule(s) added, {c} changed, {r} removed — {pr-url}
```

Offer nothing next.
