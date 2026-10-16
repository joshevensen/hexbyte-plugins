# Decisions memory

Orc learns what to choose when several answers are correct. Decisions you
confirm are recorded in the repo; once you've chosen the same way three times,
the choice becomes a rule that `plan` and `build` apply instead of asking.

Two files in the repo, committed with the work:

- `.orc/decisions/made.md` — decisions seen, with a count. Never read to decide
  anything.
- `.orc/decisions/resolved.md` — rules. `plan` and `build` read it in full at
  the start of every run.

Both are created by `/util:setup`. If one is missing, treat it as empty and
create it when you first need to write to it.

## What counts as a decision

A choice between real alternatives that **could come up again in another
issue**: which library or pattern, where something lives, how errors are
handled, how a test is shaped. Skip anything specific to this issue's feature,
departures from the spec, constraints, and assumptions.

A decision is **confirmed** when you answered the question, or when orc chose
and the PR was reviewed and merged. Record from the final state of the work: if
the walkthrough changed a choice, record the changed choice.

## Formats

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

## Recording

For each decision in the work (situation S, choice C, why W, issue #n), match S
against the section headings by meaning, not by wording:

1. **Matches a rule in `resolved.md`:**
   - C is the rule's choice → nothing to record.
   - C differs → *settle it* (below) with the rule as the earlier answer.
2. **Matches a section in `made.md`:**
   - Add `- C — #n — W` unless #n is already there.
   - Another line has a different choice → *settle it*.
   - Otherwise, if three different issues now chose C → **promote**: remove the
     section from `made.md`, add the rule to `resolved.md` with `from:` listing
     the three, and report `📌 New rule: {situation} → {choice}`. No question —
     three of the same is enough.
3. **No match:** add a new section to `made.md`.

## Settle it

Different answers mean you need to make up your mind. Ask, with
`AskUserQuestion`: *For {S} you chose {A} (#…) and now {B} (#…). Which is the
rule?*

- **{A} is the rule** / **{B} is the rule** → write it to `resolved.md`
  (replacing the old rule if there was one), `from:` listing every issue that
  chose it, and remove the section from `made.md`.
- **It depends on…** → ask what it depends on, one line. Split the situation
  into two sections, each naming that factor, assign the existing lines to the
  side they belong to, and let each side count again from there.
- **Just this once** (offered only against a resolved rule) → keep the rule as
  is and record nothing.

Never promote a situation that has two different answers without asking.

## Applying

Before you ask a question or choose between alternatives, check
`resolved.md`. On a **clear** match — the same situation, and the rule's
*applies when* holds — apply it and don't ask. Log `- applied: {situation} —
{choice}` in the decision log (`plan`: a line in the spec's Design Rationale).
If the match isn't clear, ask as usual. A rule never overrides the spec or an
explicit instruction in the issue.
