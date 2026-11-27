# Run state: the home issue

Every run has one **home issue** that holds its state until everything is
merged:

- a split idea → the **parent issue**
- a single issue → **that issue itself**

The session's disk is ephemeral. Anything a later session would need is
written here, to the issue being built, or to a pushed branch — never only to
a local file. Update the home issue *before* starting a stage and *after*
finishing it, so a session that dies leaves the truth behind.

Edit a body by reading it, changing it, and writing it back whole:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-view {home} | jq -r .body > .orc/tmp/{home}-body.md
# edit the file
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {home} --body-file .orc/tmp/{home}-body.md
```

## Parent body

```markdown
<!-- orc:parent -->
## Goal
{the shared goal, from the user's side}

## Shared context
{decisions and constraints that apply to every child — only what a build needs}

## Build plan
- [ ] #{a} — {title}
- [ ] #{b} — {title} — needs #{a}
- [ ] #{c} — {title}

## Status
| Order | Issue | Needs | Tier | Status | Branch | PR | Note |
|---|---|---|---|---|---|---|---|
| 1 | #{a} — {title} | — | Standard | queued | | | |
| 2 | #{b} — {title} | #{a} | Heavy | queued | | | |
| 3 | #{c} — {title} | — | Light | queued | | | |

**Mockups:** {none — no UI change | awaiting approval | approved — commit {sha}}

<details><summary>Original request</summary>

{the earlier body, word for word — only when an existing issue became the parent}

</details>
```

File the parent first, then the children in order, then link each one and
write the parent's full body:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-create --title "{goal}" --body-file .orc/tmp/parent-body.md      # prints {number,url}
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-create --title "{title}" --body-file .orc/tmp/{k}-body.md         # each child, in order
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-sub-add {parent} {child}       # each child
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-block {child} {needed}         # each real dependency
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-edit {parent} --body-file .orc/tmp/parent-body.md
```

The native links are a convenience. If `issue-sub-add` or `issue-block`
fails, carry on: the `Part of #{parent}` line in each child and the tables
here are the record. Cross-repository parents are not supported.

A single issue carries the same `## Status` table, with one row, and the
`**Mockups:**` line, in its own body
(`${CLAUDE_PLUGIN_ROOT}/templates/issue.md`).

## The status table

One row per child, in build order. **Needs** lists only real dependencies.

| Status | Means | Also set |
|---|---|---|
| queued | not started | — |
| building | work in progress on a branch | Branch, before the first push |
| PR open | built and checked; waiting on CI, comments or the merge | PR |
| merged | squash-merged | tick its Build plan line, clear Branch |
| stopped | a stop condition fired, or it waits on a stopped child | Note: the reason in a few words, or `waits on #{n}` |

**Note** also carries anything a later session must know about the row (for
example `needs a new session — this one can only push its own branch`).

## Stop comment

Posted on the **stopped issue** with
`gh-rest comment-upsert {number} "<!-- orc:stop -->" --body-file …`, so a
second stop replaces the first:

```markdown
<!-- orc:stop -->
## 🔴 Stopped: {scope grew | mockup can't be built as drawn | contradicts a CLAUDE.md rule | can't make progress}

**What is wrong:** {exactly what, with `path:line`, the criterion, the rule or the failing check}
**What I need:** {the decision or fix — recommended option first, then the alternative and its cost}
**Where it stands:** {PR #{pr} open on `{branch}` | branch `{branch}` pushed, no PR | nothing built}
**Also waiting on this:** {#{n}, #{m} | nothing}

Continue with `/orc:ship {home}` — answer here first, or it will ask.
```

## Summary comment

One comment on the **parent**, created when the first child finishes (merged
or stopped) and rewritten after each one, so it is always current:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest comment-upsert {parent} "<!-- orc:summary -->" --body-file .orc/tmp/{parent}-summary.md
```

```markdown
<!-- orc:summary -->
## 📋 Summary — {m} of {n} merged

**Shipped**
- #{a} — {title} — #{pr} ({tier})

**Stopped**
- #{b} — {reason} — {#{pr} open | no PR}

**Decided without you** — {total} decisions, {k} low confidence
- #{a}: {decision} → {choice} — {why} *(low)*

**🚀 Before you deploy**
- #{a}: {step, with the exact command}

**📌 New rules** — delete one from `.orc/decisions/resolved.md` to veto it
- {situation} → {choice} (from #{x}, #{y}, #{z})

Not finished? Continue with `/orc:ship {parent}`.
```

Omit a section with nothing in it, and the last line once every child is
merged. List every low-confidence decision; high
ones are only counted — they are in each issue's Decisions table. If the
working copy is gone (new session), read the comment back from
`gh-rest issue-view {parent}` before adding to it. A single issue gets no
summary comment: its PR description and the final report carry the same
things.

## Reading state (resume)

`/orc:ship {number}` on a home issue continues from what GitHub says, without
re-asking anything already settled. Read the home issue, then take each row
in order:

| Row says | Check | Then |
|---|---|---|
| merged | — | skip |
| PR open | `gh-rest pr-view {pr}` | `MERGED` → do the after-merge bookkeeping that's missing, skip. `OPEN` → check out its branch and continue at the merge stage. `CLOSED` → treat as stopped: "its PR was closed without merging" |
| building | `git fetch origin {branch}`; `gh-rest pr-find {branch} all` | a PR exists → as **PR open**. The branch exists → check it out and continue the build from what is committed: compare `git diff origin/{base}...HEAD` with the acceptance criteria and do what is missing. Neither → build it from the start |
| queued | every issue in Needs is merged | build it when its turn comes |
| stopped | the stop comment on that issue, and anything the engineer wrote on the issue or its PR after it | answered → apply the answer, update the issue body if scope changed, set the row back to `queued` (or `PR open`) and continue. Not answered → ask the stop comment's question, recommendation first; this is the one question a resume may ask. `waits on #{n}` → clears when #{n} merges |

Before the rows:

- **Mockups line** — `approved` and the files exist (on `origin/{base}`, on
  the recorded commit, or on an open PR's branch): never ask again.
  `awaiting approval`: the session died before approval; write any missing
  mockup again and ask.
- **The table is missing or short** (the session died while filing): rebuild
  it from the Build plan lines and `gh-rest issue-subs {parent}`, every row
  `queued` unless its issue is closed (then `merged`).
- An issue that was edited by the engineer since it was filed wins over what
  the table or an old comment says.
