---
name: create
description: Discuss an idea at the product/scope level and produce one or more GitHub issues — no spec-writing. Splits work into separate issues when it's naturally independent. Ends only when every open question is resolved. Interactive and local.
model: sonnet
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say.

`create` is the human-judgment front of the pipeline. You talk an idea through
at the product and scope level, then produce the GitHub issue(s) that `/orc:plan`
will later spec. It does **not** write specs and it does **not** explore the
codebase for implementation detail — that is `plan`'s job. Its one hard rule:
**it never ends with an unresolved open question.** Ask freely while discussing,
but every issue it creates reads `Open Questions: None.`

## `--dry-run`

`/orc:create --dry-run` runs the full discussion and open-question resolution
normally — nothing there touches GitHub anyway. At step 4, skip the label
self-provisioning and `gh-rest issue-create` calls; instead show each issue exactly
as it would be filed (title, body, labels) and stop:
```
DRY RUN — would create {n} issue(s){ and a parent with this build plan}:

  {title} [labels: {labels}]
  {body}
  ...

Re-run without --dry-run to file them.
```
Skip the `issue-sub-add`/`issue-block` links too.

## Steps

### 1. Discuss

Ask what the user wants and why. Read files or grep only enough to ground the
conversation in what exists (does this route/model already exist? is there a
similar feature to point at?) — this is scoping, not spec research. Aim for 2–4
exchanges and capture:

- what should change, from the user's perspective
- why it matters
- scope boundaries — what's explicitly in and out
- constraints and context the plan step will need

Don't over-interview. If the first message is already clear, move on.

### 2. Resolve every open question

As questions surface — scope, priority, expected behavior, edge cases — raise
them and get answers. **The discussion is not finished while any raised question
is unanswered.** This is the same standard `plan`'s spec gate holds specs to,
applied one stage earlier so `plan` inherits a clean scope.

### 3. Decide whether to split, and whether the pieces are related

If the discussion reveals genuinely separable pieces of work — deliverables
that could each be built and merged as their own PR — create one issue per
piece. Splitting is part of the discussion, not a separate step.

**There is no size threshold that forces a split.** A large but cohesive change
is one issue; `build` handles issues of any size. Split only when the work is
naturally separable, never because a single issue looks "too big."

When there are several issues, decide which kind they are:

- **Unrelated** — separate ideas that happened to come up together. File them
  as plain, independent issues. No parent, no links.
- **Related** — parts of one goal that only make sense together: one needs
  another's code, or they ship as a set. These get a **parent issue** and a
  **build plan** (step 4b).

For related issues, work out the order with the engineer:

- **Depends on** — B needs A's code merged first (a schema, an API, a shared
  component). B is blocked by A.
- **Parallel** — no dependency, so they can be built at the same time in
  separate sessions. Mark two issues parallel only when they change
  different areas; if they'd likely touch the same files, sequence them to
  avoid merge conflicts, and say why.

Group the issues into **phases**: phase 1 is everything with no blocker;
each later phase is everything whose blockers are all in earlier phases.
Issues in the same phase can run in parallel. Confirm the plan with the
engineer before filing.

### 4. Create the issue(s)

For each issue, write a body that captures the discussion at the scope level:
what should change, why, what's in and out of scope, and any constraints `plan`
needs. End the body with an `## Open Questions` section reading `None.` — every
issue leaves discussion fully resolved. Do **not** write a spec; the issue has
no acceptance criteria or file lists yet.

Apply `type:bug` when the work is a defect (so `plan` knows to spec a
reproduction and a regression test). Otherwise no type label.

```bash
# labels self-provision (idempotent)
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight                       # once; cached
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "status:draft"
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest label-ensure "type:bug"          # bugs only

# prints {number,url}; repeat --label for each label
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-create --title "{title}" --body "{body with Open Questions: None.}" \
  --label "status:draft" --label "type:bug"   # type:bug only if a defect
```

Every issue starts at `status:draft` — it has a resolved scope but no spec yet.

For **related** issues, follow step 4b instead of filing them one by one.

### 4b. Parent issue and links (related issues only)

Order matters so every reference points at a real issue:

1. File the parent first with its Goal and Shared context (no status label —
   it isn't built itself).
2. File the children **in phase order**, so a blocker always exists before
   the issue it blocks. Each child's body starts with `Part of #{parent}`
   and, if it has blockers, `Blocked by #{a}, #{b}`.
3. Link them, and replace the parent's body with the full version below.

Parent body:

```markdown
## Goal
{the shared goal, from the user's perspective}

## Shared context
{decisions and constraints that apply to every child — only what plan needs}

## Build plan
| Phase | Issues | Can start when |
|---|---|---|
| 1 | #{a}, #{b} — in parallel | now |
| 2 | #{c} | #{a} is merged |
| 3 | #{d} | #{b} and #{c} are merged |

- [ ] #{a} — {title}
- [ ] #{b} — {title}
- [ ] #{c} — {title}
- [ ] #{d} — {title}

## Open Questions
None.
```

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-create --title "{goal}" --body-file .orc/tmp/parent-body.md   # 1. no status label
# 2. children in phase order, with issue-create as in step 4
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-sub-add {parent} {child}          # 3. each child
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-block {child} {blocker}           #    each dependency
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {parent} --body-file .orc/tmp/parent-body.md   # full body
```

`walkthru` ticks a child's box when its PR merges and closes the parent when
the last one does.

### 5. Report

```
Created {n} issue(s):
  #{number} — {title}
  ...

```

For related issues, show the build plan table and say which issues can start
now — each in its own session; parallel ones can run at the same time.

Offer the first issue that can start now (unrelated issues: the first one) and
name the rest as `#{n} in its own session`. End with the next-step line from
`working-style.md`:

`➡️ Next: /orc:plan #{number} — continue?`
