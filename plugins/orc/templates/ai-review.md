<!--
Posted (and later updated) as a PR comment via `gh-rest comment-upsert` —
never folded into the PR description. The marker line must be the literal first line, with the full
commit SHA review ran against (after any auto-fixes are committed) and the
overall verdict: BLOCK if any BLOCKER remains, WARNING if any WARNING remains,
otherwise PASS. `walkthru` reads this marker for the verdict, and updates
it after each mini build's re-review. The SHA records what was reviewed; later
non-code commits (docblocks, changelog) don't make it stale. Do not omit it
or reorder it after the fact.

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
- "Clean" lists the areas reviewed (by path: correctness and quality for S;
  plus security and impact for M and L) with no remaining findings. Deploy
  steps are not findings — they go in the separate Deploy notes comment.
- The hidden `orc:warnings` block lists every remaining WARNING, one per
  line, line-specific ones included — `walkthru` reads it. Leave it empty
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
