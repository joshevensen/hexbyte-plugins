# Decisions, rules and learning

orc decides nearly everything itself. This is how it records what it decided,
applies the rules a repo already has, and turns a choice that keeps recurring
into a new rule.

## What counts as a decision

A choice between real alternatives that someone couldn't see from the diff:
which pattern or library, where something lives, how errors are handled, how
a test is shaped, how a review finding or PR comment was settled, a departure
from the issue as written.

**Not** decisions: anything obvious, and anything forced by the issue, the
codebase, `CLAUDE.md` or a rule in `.orc/decisions/resolved.md`. An empty
table is right for a mechanical change.

## Before deciding: apply the rules

Read `.orc/decisions/resolved.md` once at the start of a run (a missing file
is an empty one). Before choosing between alternatives, look for a rule whose
situation matches and whose *applies when* holds:

- **Clear match** — follow it. That is not a decision and is not recorded.
- **No clear match** — decide, and record it.

`CLAUDE.md` outranks `resolved.md`. Neither overrides behavior the engineer
agreed to in the issue; a real conflict between a `CLAUDE.md` rule and the
agreed behavior that following the rule can't resolve is a stop condition.

## The record

One table per issue, in the issue body's `## Decisions` section
(`${CLAUDE_PLUGIN_ROOT}/templates/issue.md`). It starts with the choices made
while specifying and grows during the build. Keep the working copy of the
body at `.orc/tmp/{number}-body.md` and write it back to the issue after each
commit that added a decision, and before the PR opens — the issue is the
durable copy. If the working copy is gone, read the body back first.

```markdown
| # | Where | Decision | Options | Chose | Confidence | Why |
|---|---|---|---|---|---|---|
| 1 | `app/Jobs/Import.php:40` | Where the retry lives | job · caller | job | high | every other job retries itself (`app/Jobs/Sync.php:22`) |
| 2 | `resources/js/pages/Setup.tsx` | Empty-state copy | issue wording · shorter | shorter | low | issue wording wrapped on mobile; would keep it if it must match the email |
| 3 | review | N+1 in the export query (review-impact) | eager load · leave | eager load | high | confirmed by finding-verifier; fixed in `app/Exports/Orders.php:31` |
```

- **Where** — `path:line`, or `review`, `PR comment`, `CI`, `spec`.
- **Confidence**
  - **high** — evidence settles it: a file, an existing pattern, a rule, a
    test, a hard constraint. The Why cites it.
  - **low** — a reasonable senior could choose the other way, or it rests on
    an assumption. The Why says what would change the choice.
  - Never mark a row high to make it look settled. A departure from the issue
    as written is always low.
- Escape a literal `|` inside a cell as `\|`.

Nothing here is asked about. Low-confidence rows are where the engineer's
attention goes afterwards: each one is listed in the PR description and in
the parent's summary.

## History and rules: `.orc/decisions/`

Two files in the repo, committed with the work that changes them. Create
either one when it is first written to.

- `.orc/decisions/made.md` — the history: what was chosen, per situation.
  Never read to make a choice.
- `.orc/decisions/resolved.md` — the rules. Read at the start of every run.

`made.md` — one section per situation, one line per issue it came up in:

```markdown
## {situation — one specific line, so unrelated decisions don't merge}
- {choice} — #{issue} — {why}
```

`resolved.md` — one section per rule:

```markdown
## {situation}
- applies when: {area, paths, or conditions}
- choose: {the choice}
- why: {the reason}
- from: #{issue}, #{issue}, #{issue}
```

## Learning

After an issue's checks are done and before its PR opens, go through its
Decisions table. Take only the choices that **could come up again in another
issue** — how this codebase does a *kind* of thing. Skip anything about this
feature's own behavior, copy or data, and skip departures from the issue.

For each one (situation S, choice C, why W, issue #n), match S against the
section headings by meaning, not wording:

1. **A rule in `resolved.md` covers S** — nothing to record. (If C differs
   because the rule's *applies when* didn't hold, the row's Why already says
   so.)
2. **A section in `made.md` matches S**
   - Add `- C — #n — W`, unless #n is already listed.
   - The section has a `- promoted:` line → stop there. It was already made a
     rule once; if that rule is no longer in `resolved.md` the engineer
     vetoed it, so never promote it again.
   - Lines in the section disagree (different choices) → never promote. Note
     it once for the final summary: `no rule yet: {S} — chosen both ways
     (#a, #b)`.
   - Otherwise, when **three different issues** chose C → **promote**: add
     the rule to `resolved.md` with `from:` listing the three, add
     `- promoted: #a, #b, #c` to the section in `made.md`, and note
     `📌 {S} → {C}` for the PR description and the final summary.
3. **No match** — add a new section to `made.md`.

Commit both files with the issue's PR (`docs(#{number}): record decisions`).
Promotion never asks. The engineer vetoes a rule by deleting it from
`resolved.md`; it stays deleted.
