# Which branch an issue's work goes on

Every orc skill that commits for an issue (`plan` for mockups, `build`,
`walkthru`) resolves the branch the same way, in this order, and **never asks
the engineer about it**:

1. **The issue already has an open PR** — use that PR's branch. Find the PR
   from the issue, not from a branch name: the most recent PR link in the
   issue's comments (`issue-loader`'s **PR URL**), confirmed with
   `gh-rest pr-view {pr}` (its `head_ref`, state OPEN). This is the case for a
   rebuild, a walkthrough, and any session that picks up existing work.
2. **The session's own branch** — otherwise, if the current branch
   (`git rev-parse --abbrev-ref HEAD`) is not the default branch, use it,
   provided that:
   - it has no open PR for a different issue
     (`gh-rest pr-find {current} open` is empty, or its body says
     `Closes #{number}`), and
   - it holds no commits of other work
     (`git log --oneline origin/main..HEAD` is empty, or only touches this
     issue's `.orc/mockups/{number}/`).

   Claude Code on the web gives each session its own branch and expects work
   to be pushed there; using it avoids a permission question.
3. **A new branch** — otherwise (e.g. a local session sitting on `main`),
   create `issue/{number}-{slug}` with the slug from `issue-loader`.

Call the result `{branch}`. Once a PR exists, rule 1 makes every later skill
and session land on the same branch automatically.
