<!--
Posted as a PR comment via `gh pr comment` — never folded into the PR
description. The marker line must be the literal first line, with the full
commit SHA review ran against (after any auto-fixes are committed) and the
overall verdict: BLOCK if any BLOCKER remains, WARNING if any WARNING remains,
otherwise PASS. `resume` reads this marker to decide whether a review already
on the PR is still fresh (SHA matches current HEAD) or stale (HEAD has moved —
something changed since, so re-review) — do not omit it or reorder it after
the fact.

Organize by what the reader needs to do, not by which agent found it:
- Merge duplicate findings across agents into one line.
- Drop NOTEs entirely.
- BLOCKERs always go under "Needs you", line-specific or not.
- Every WARNING you deferred with `(r)` goes under "Needs you" — `push`
  posts no inline comments, so this list is the only place they appear.
- One line per item: where, what, why it matters. No prose.
- "Clean" lists the areas (correctness, security, quality, impact, deploy)
  with no remaining findings.
- "Fixed" covers both auto-fixes and findings fixed with `(f)`.
- Omit any headline part that's zero, the "Needs you" section when empty, and
  the details block when nothing was fixed. A clean review is the marker
  plus the headline.
-->
<!-- orc:ai-review sha:{full-commit-sha} verdict:{PASS|WARNING|BLOCK} -->
## AI Review: {✅ nothing needs you | ⚠️ {n} need you | 🚫 blocked} · {a} fixed · clean: {areas}

**Needs you**
- {🚫|⚠️} `{file}:{line}` — {what} — {why it matters}

<details><summary>Fixed ({a})</summary>

- `{file}:{line}` — {what was fixed}

</details>
