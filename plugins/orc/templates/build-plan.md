# Finding an issue's parent and its next issue

`plan`, `walkthru`, and `status` use these rules to find an issue's parent
and to pick the next startable issue from that parent's build plan.

## Finding the parent

For input issue `{issue}`:

1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-view {issue}`. If its
   `parent` is a number, that is the parent.
2. Otherwise, if the issue body has a `Part of #{parent}` line, that is the
   parent.
3. Otherwise there is no parent.

- If both exist and differ, the native link wins.
- Cross-repository parents are not supported: `issue-view` returns
  `parent: null` for them, so only a `Part of #{parent}` line in the body can
  name a parent.
- Every `gh-rest` call in this template uses the
  same -R `{owner/repo}` the issue was loaded with, if any.
- Checklist matching rule, used here and by `walkthru`'s tick: a line belongs
  to issue `{n}` only when `#{n}` is followed by a
  non-digit (a space, a dash, or the end of the line), so `#47` never matches
  a `#470` line.

## Picking the next issue

For input parent `{parent}` and the just-merged issue `{issue}`:

1. Read the parent body with `gh-rest issue-view {parent}`. The candidates are
   the issue numbers on its unticked lines, meaning lines that start with the
   prefix `- [ ] #{n}`, in document order. The title text and dash style after
   the number do not matter. `- [x]` lines are done.
2. The just-merged issue is never a candidate, ticked or not. Exclude it by
   number. Do not rely on its label or state.
3. For each candidate in order, run `gh-rest issue-view {n}` and
   `gh-rest issue-blockers {n}`. If either call fails (deleted or transferred
   issue, a PR number, API error), skip it and continue. A candidate is
   startable only if all of these hold:
   - its `state` is `OPEN`;
   - every blocker is `CLOSED`. Treat the
     just-merged issue as closed whatever the API says, because GitHub closes
     it asynchronously after the merge;
   - its `labels` include exactly one of `status:draft` / `status:ready`. If
     both are present, skip it as ambiguous. If neither is present, skip it.

   Siblings at `status:building`, `status:blocked`, or `status:built` are
   skipped. They do not stop the search.
4. Do not use `issue-subs` for selection. `{title}` comes from
   `issue-view {n}`, not the checklist line.
5. If nothing is startable, print no block and no list.
6. Otherwise, the first startable candidate is the next issue. Every other
   startable candidate gets one `Also ready:` line, in checklist order. The
   exact output is:

   ````
   ➡️ Next, in a new session: #{n} — {title} ({draft, needs a spec | ready to build})
   Also ready: #{m} — {title}
   ```
   /orc:plan {n}
   ```
   ````

   - `status:draft` maps to `/orc:plan {n}` with `draft, needs a spec`.
   - `status:ready` maps to `/orc:build {n}` with `ready to build`.
   - The number in the command is bare, with no `#`.
   - `Also ready:` lines are plain text with no command, and they use an em
     dash.
   - The fenced block holds only the command. It is the
     last thing in the message, and nothing follows it: no "continue?" and no
     question.
   - Do not run the command, and do not invoke the Skill tool for it. The
     next issue starts in a new session.
