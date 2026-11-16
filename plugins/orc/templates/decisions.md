# Decision record

How orc records the choices it makes, so the engineer can see them and
`/orc:learn` can turn the recurring ones into project instructions. There is
no decisions file in the repo — the record lives on GitHub, next to the work.

## Where it lives

- **`plan`** — in the spec's `### Decisions` table, on the issue.
- **`build` and `walkthru`** — in one **Decisions comment on the PR**, created
  when the draft PR opens and edited in place as work lands. The PR exists
  from just after branching, so this is the normal home.
- **No PR** (a dry run, or a gate before the PR opened) — the same comment on
  the issue instead.

The comment is posted and updated with
`${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {pr} "<!-- orc:decisions -->" --body-file .orc/tmp/{number}-decisions.md`.
Keep the working copy at `.orc/tmp/{number}-decisions.md`; the comment is
the durable one. If the working copy is missing (new container), read the
comment back before editing it.

## What counts as a decision

A choice between real alternatives that a reviewer couldn't see from the
diff: which pattern or library, where something lives, how errors are
handled, how a test is shaped, a departure from the spec, a review finding
accepted rather than fixed. Skip anything obvious or forced by the spec, the
codebase, or `CLAUDE.md`. An empty table is fine for a mechanical change.

## Confidence

Every decision carries one:

- **high** — the evidence settles it: an existing repo pattern, the spec, a
  `CLAUDE.md` rule, a test, a hard constraint. Name the evidence.
- **low** — a reasonable senior could choose the other way, or the choice
  rests on an assumption. Name what would change your mind.

Never mark a decision high to avoid a question. A departure from the spec is
always **low** unless the engineer already approved it.

`build` asks about a low-confidence decision **during the build** only when
the answer changes work that hasn't been done yet (a later wave builds on
it). Every other low-confidence decision waits for `/orc:walkthru`, which
asks about low-confidence rows and nothing else.

## Format

```markdown
<!-- orc:decisions -->
## ⚖️ Decisions

| # | Where | Decision | Options | Chose | Confidence | Why | Status |
|---|---|---|---|---|---|---|---|
| 1 | `app/Jobs/Import.php:40` | Where the retry lives | job · caller | job | high | every other job retries itself (`app/Jobs/Sync.php:22`) | |
| 2 | `resources/js/pages/Setup.tsx` | Empty-state copy | spec wording · shorter | shorter | low | spec wording wrapped on mobile; would keep spec wording if it must match the email | |

**Constraints found**
- {something in the codebase that shaped the work, and where}

**Review**
- accepted: `{file}:{line}` — {finding} — because {reason}
- fixed: {finding} — {what changed}

**Deploy notes** → see the Deploy notes comment, if any.
```

- **Status** is empty until the engineer acts: `✅ confirmed`, `🔁 changed to
  {choice}`, and `📌 rule` when they ask for the choice to become a project
  rule. `/orc:walkthru` writes these.
- Plan's spec uses the same columns minus **Where** and **Status**.
- Escape a literal `|` inside a cell as `\|`.
