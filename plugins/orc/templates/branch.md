# Which branch an issue's work goes on

Resolved the same way every time, in this order, and **never asked about**.
`{base}` is the repo's default branch.

1. **The issue already has a branch** — an open PR (the PR column of its
   status row, or a PR link an earlier orc left in the issue's comments; its
   `head_ref` from `gh-rest pr-view {pr}`) or the Branch column, when
   `git fetch origin {branch}` finds it. Use it:
   `git switch -C {branch} origin/{branch}`.
2. **The session's own branch**, when it is free. The current branch
   (`git rev-parse --abbrev-ref HEAD`) is free when it is not `{base}`, has
   no open PR (`gh-rest pr-find {current} open` prints nothing), and holds no
   unmerged work of its own (`git log --oneline origin/{base}..HEAD` is
   empty, or shows only commits whose PR has merged). Claude Code on the web
   gives every session one branch and expects pushes to go there. Restart it
   from the latest base: `git fetch origin {base} && git switch -C {current} origin/{base}`.
3. **A new branch** otherwise — a local session sitting on `{base}`, or the
   session branch is held by a stopped issue's open PR:
   `git switch -C orc/{number}-{slug} origin/{base}`, with `{slug}` the title
   in lowercase with hyphens, at most five words.

Children are built one after another, so rule 2 normally gives every child
the same branch in turn: once a child's PR is squash-merged and its branch
deleted, the next child restarts that branch from the new `{base}`.

## Pushing

- The first push of a child: `git push --force-with-lease -u origin {branch}`
  (the name may still exist on origin with an earlier, already merged
  child's commits). Later pushes: `git push`.
- Push after every commit that would be expensive to redo. A pushed branch
  with its name in the status row is what a later session resumes from.

## When a push is refused

Some environments let a session push only its own branch.

- **Rule 1 branch refused** (picking up another session's work): move the
  commits to the branch rule 2 or 3 gives
  (`git switch -C {new} origin/{branch}`), push, open a new PR whose body
  says it replaces #{old}, then close the old one:
  `gh-rest pr-comment {old} --body $'<!-- orc:reply -->\nReplaced by #{new}.'`
  and `gh-rest pr-close {old}`.
- **Rule 3 branch refused**: this session can't build that issue. Leave its
  row `queued` with the Note `needs a new session — this one can only push
  its own branch`, go on to anything else that can still build, and say so in
  the final report with the command to run.
