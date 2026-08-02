---
name: explain
description: Explain what a file or a PR is doing in plain language, as a chat reply. Read-only — writes no files, posts no comments. Invoke as /orc:explain {file path | pr number | pr url}.
model: sonnet
---

`explain` is a read-only orientation aid — point it at a file or a pull
request and it summarizes what it does, in chat. It never writes files,
never posts a GitHub comment, and never runs a command that mutates state.

## Steps

### 1. Resolve target

With no argument, stop and ask what to explain — a file path, a PR number,
or a PR URL. Don't guess and don't default to the current branch's PR.

Otherwise classify the argument:

- A number, or a `github.com/.../pull/{number}` URL → a PR. Continue to
  step 2.
- Anything else → treat it as a file path. Continue to step 3.

### 2. PR target

Fetch the description, metadata, and diff:

```bash
gh pr view {pr} --json number,title,body,author,state,files --jq '.'
gh pr diff {pr}
```

If `gh pr view` fails (unknown PR, `gh` missing, not authenticated), report
the error verbatim and stop. For a large diff, read the file list first and
summarize by area rather than truncating silently.

### 3. File target

Read the file. If it does not exist, stop with `No such file: {path}`. If
it is very large, read it in full where practical; otherwise summarize
structurally and say which parts were skimmed.

### 4. Summarize

Plain language, no line-by-line narration.

For a file: its purpose, its key behaviors/exports, its notable
dependencies or callers, and anything surprising.

For a PR: what changed, why (from the title and body), the shape of the
change across files, and any behavior or risk worth flagging.

State uncertainty explicitly rather than inventing intent.

### 5. Report

For a file:

```
{path}

{2-5 sentence plain-language summary}

Key behavior
- {point}
```

For a PR:

```
#{number} {title} — {author}, {state}

{2-5 sentence plain-language summary of what changed and why}

What changed
- {file or area} — {what it does now}
```

This output is a chat reply only — nothing is posted to GitHub and no file
is written.
