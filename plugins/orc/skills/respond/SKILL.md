---
name: respond
description: Fetch unresolved PR comments — yours and everyone else's — and resolve them, no interactive per-item confirmation. Manually triggered, never watches or subscribes to a PR. Never merges. Invoke as /orc:respond [pr].
model: sonnet
---

`respond` only acts when you run it — nothing subscribes to webhooks or polls
in the background. It walks every unresolved comment on the PR — yours and
everyone else's — implements, commits, pushes, and stops — no CI check, no
mergeability check, no merge. Use `resume` for CI/mergeability once the
comments are settled, and merge the PR yourself.

**Comments authored by you are instructions, not suggestions.** Treat each
one as a direct order to carry out — implement it (or answer it) exactly as
written, no second-guessing whether it's a good idea, then close it out.

**Comments from anyone else — Copilot's automatic review, other bots, other
human reviewers — get judged before being acted on.** For each one, decide
whether it's accurate and worth acting on:
- If it holds up: make the change (or take the action it asks for), reply
  saying what you did, and resolve the thread.
- If it doesn't — wrong, already handled, out of scope, or not worth doing —
  reply explaining why not, and resolve the thread. Don't implement it, and
  don't resolve it without leaving that reply.

A non-author comment always gets a reply, whether or not you act on it —
silence isn't an option there the way it can be for your own comments.

## `--dry-run`

`/orc:respond [pr] --dry-run` runs steps 0-2 exactly as normal (read-only).
Step 3 still implements every item and commits locally (inspectable with
`git log`/`git diff`), but skips `git push`, the reply posts, and the resolve
mutations — print what each reply would have said instead. End with:
```
DRY RUN — {n} item(s) implemented locally, not pushed or posted. Re-run
without --dry-run to push and post replies.
```

## Steps

### 0. Resolve target PR

If `{pr}` is given, use it. Otherwise detect it from the current branch:

```bash
pr=$(gh pr view --json number --jq .number 2>/dev/null)
```

If neither yields a number, stop and ask which PR to respond to.

### 1. Sync

```bash
git fetch origin
gh pr checkout {pr}
git fetch origin main
```

### 2. Gather unresolved comments

```bash
me=$(gh api user --jq .login)
```

Every comment or thread pulled below is tagged against `{me}` — authored by
you, or by someone else — since step 3 treats the two differently. Nothing is
dropped at this stage purely for authorship.

**Unresolved review threads** (inline comments left via a "Files changed" review):

```bash
owner=$(gh repo view --json owner --jq .owner.login)
repo=$(gh repo view --json name --jq .name)
gh api graphql -f query='
  query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100) {
          nodes {
            id
            isResolved
            comments(first:50) {
              nodes { id body path line author { login } }
            }
          }
        }
      }
    }
  }' -f owner={owner} -f repo={repo} -F pr={pr} \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

A thread's authorship is decided by its **first** comment — the one that
opened it — regardless of who replied afterward.

**Unanswered general PR comments** (top-level conversation, not tied to a review):

```bash
gh pr view {pr} --json comments --jq '.comments'
```

Walk the full list in order. A comment counts as unanswered if **no later
comment in the list** — from anyone — already addresses it; treat an obvious
follow-up ("nvm, ignore that") as closing out the comment it follows,
regardless of who wrote either one.

If both sources are empty, report `Nothing unresolved on PR #{pr}.` and stop.

### 3. Work every item

Walk each unresolved thread and unanswered comment in order. Branch on who
opened it (the thread's first comment, or the general comment itself).

#### Items authored by you

Treat it as a direct instruction — no second-guessing, no per-item
confirmation:

- **A request for a code change** ("do X", "this should Y", "fix Z"):
  implement it, then commit:
  ```bash
  git commit -am "address review: {brief description of the comment}"
  ```
- **A genuine question** (nothing to change, an answer is what's being
  asked for): reply directly, no code change:
  - General comment: `gh pr comment {pr} --body "{reply}"`
  - Review thread: reply in-thread via GraphQL
    `addPullRequestReviewThreadReply` with the thread `id` and `{reply}` body.
- **Genuinely ambiguous** (conflicting with another comment, or unclear what
  change is wanted): don't guess — reply asking for clarification the same
  way as a question, and leave the thread unresolved (skip the resolve step
  below for it).

#### Items authored by someone else (Copilot, other bots, other reviewers)

Read the comment on its merits — is it accurate, and does it actually call
for something? Then:

- **Holds up and is actionable**: implement the change (or do what it asks),
  then commit:
  ```bash
  git commit -am "address review ({author}): {brief description}"
  ```
  and reply saying what you did.
- **Doesn't hold up** — factually wrong, already handled elsewhere in the
  diff, out of scope for this PR, or a stylistic take you're not taking —
  don't implement it. Reply explaining why not, in one or two sentences.
- **Genuine open question you can't resolve unilaterally** (e.g. it's asking
  the PR author to make a call that affects the design): reply with your
  read on it, and leave the thread unresolved if it still needs a human
  answer rather than yours.

Every non-author item gets a reply either way — never resolve one silently.

#### Resolving

After acting on or replying to a **review thread**, resolve it (skip this
only for a thread left open pending clarification/a human answer):
```bash
gh api graphql -f query='
  mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { id } } }
' -f id={thread-id}
```
General comments have no resolve state — a posted reply is the terminus.

### 4. Push

If any commits were made in step 3:
```bash
git push
```

### 5. Report

```
PR #{pr}: {n} implemented and pushed, {m} answered, {d} declined with reason,
{k} left open for clarification.
Run /orc:resume {issue-number} for CI/mergeability, or merge yourself when ready.
```
