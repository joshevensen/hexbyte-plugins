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
- WARNINGs with a file and line go inline (pr-context-writer posts them as
  "Look closely" comments) and are only counted in the headline — unless the
  verdict is BLOCK, in which case no context step runs, so list them under
  "Needs you" too.
- WARNINGs without a specific line go under "Needs you".
- One line per item: where, what, why it matters. No prose.
- "Clean" lists the areas (correctness, security, quality, impact, deploy)
  with no remaining findings.
- The hidden `orc:warnings` block lists every remaining WARNING, one per
  line, line-specific ones included — `resume` reads it to post inline
  context when it trusts this review instead of re-running it. Leave it empty
  when there are none; never omit it.
- Omit any headline part that's zero, the "Needs you" section when empty, and
  the details block when nothing was auto-fixed. A clean review is the marker,
  the headline, and an empty warnings block.
-->
<!-- orc:ai-review sha:{full-commit-sha} verdict:{PASS|WARNING|BLOCK} -->
## AI Review: {✅ nothing needs you | ⚠️ {n} need you | 🚫 blocked} · {i} inline · {a} auto-fixed · clean: {areas}

**Needs you**
- {🚫|⚠️} `{file}:{line}` — {what} — {why it matters}

<details><summary>Auto-fixed ({a})</summary>

- `{file}:{line}` — {what was fixed}

</details>

<!-- orc:warnings
{file}:{line} — {finding}
-->
