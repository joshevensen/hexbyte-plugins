---
name: do
description: Run the full orc pipeline — create, plan, build — for one simple issue in a single pass, skipping the separate handoff between stages. For work small enough that three commands would be pure overhead. Invoke as /orc:do {description}.
model: sonnet
---

`do` is the fast path through the pipeline for work simple enough that
running `/orc:create` → `/orc:plan` → `/orc:build` as three separate commands
is pure overhead: a copy tweak, an obvious one-file bug fix, a small config
change. It drives all three stages back to back for one issue in one pass —
it does not replace any of them, and it does not weaken any of their gates.
**The moment the work turns out not to be simple** — a real open question, a
split into separate issues, genuine ambiguity against the codebase, or a spec
that decomposes into several waves — `do` stops and hands off to the normal
stage-by-stage commands rather than forcing a judgment call the slower path
exists to make properly.

## When not to use this

If you already know the work is nontrivial — touches auth/billing/migrations,
spans several files with real logic, or you expect back-and-forth on scope —
start with `/orc:create` directly. `do` is for the cases where you'd begrudge
running three commands for one paragraph of code.

## `--dry-run`

`/orc:do {description} --dry-run` previews only the `create` stage (step 1) —
`plan` and `build` both need a real, filed issue number to research and build
against, so there's nothing further to preview without one. Run `create`'s own
`--dry-run` behavior and stop there:
```
DRY RUN — would create issue:
  {title} [labels: {labels}]
  {body}

Re-run without --dry-run to file it and continue straight through plan and build.
```

## Steps

### 1. Create the issue (condensed)

Follow `${CLAUDE_PLUGIN_ROOT}/skills/create/SKILL.md` steps 1-5, condensed for
a single simple task:

- Skip the 2-4 exchange discussion `create` normally budgets — treat the
  supplied description as the starting scope, and file directly from it.
  Ask only if something genuinely blocks filing (missing detail no reasonable
  default can cover).
- Keep `create`'s hard rule exactly as-is: **never file with an unresolved
  open question.** If real open questions surface, that's a signal the work
  isn't as simple as assumed — resolve them the same way `create` would,
  however many exchanges that takes. Don't rush past this to hit "one pass."
- Never split into multiple issues. If the description reveals genuinely
  separable pieces, stop and tell the user to use `/orc:create` instead —
  that's no longer a single simple issue `do` is for.
- File it exactly as `create` step 4 describes (`status:draft`, `type:bug` if
  applicable). Capture `{number}` from the created issue.

### 2. Plan (unabridged)

Follow `${CLAUDE_PLUGIN_ROOT}/skills/plan/SKILL.md` steps 1-5 in full against
`{number}` — the codebase research and the spec's open-question gate don't
shrink for "simple," since a weak spec here undermines the confidence check
`build` runs next.

If the resulting spec needs several files or waves, or its touchpoints are
genuinely uncertain, stop here and tell the user to continue by hand with
`/orc:build {number}` — it's no longer the one-wave case `do` is for.
Otherwise continue straight to step 3.

### 3. Build (unabridged)

Follow `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` in full, unmodified,
against `{number}`. Nothing about `build` changes for a simple issue — its
gates and dependency-ordered waves already handle a one-file, one-wave change
correctly. `do`'s only value is not stopping between stages, never weakening
what any stage checks.

### 4. Report

If all three stages completed:
```
#{number} — {title}
{build's own step-13 report}
```

If it stopped early — a split was needed in step 1, or step 2 turned out
larger than one wave — report what was filed/specced so far and name the
next manual command instead of a normal completion report.
