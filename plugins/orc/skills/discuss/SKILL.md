---
name: discuss
description: Enter discussion mode — explore a topic, explain what a file, route, or PR does, and weigh options using read-only tools, making no code or file changes until the user says "green light". Invoke as /orc:discuss [topic].
model: sonnet
---

Follow `${CLAUDE_PLUGIN_ROOT}/templates/working-style.md` for how you behave and how you word what you say. Answer at a senior level: skip what's obvious from a glance, spend words on non-obvious tradeoffs, risks, gotchas, and coupling. Explain more only when asked.

## Behavior for the rest of this conversation

**Allowed:**
- Reading files
- Running read-only shell commands (`ls`, `cat`, `grep`, `git log`, `git diff`, `find`, etc.) and read-only GitHub calls through `${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest` (`pr-view`, `pr-comments`, `issue-view`, `issue-list`) and `gh pr diff`
- Asking clarifying questions
- Sharing opinions, tradeoffs, and recommendations — including disagreeing

**Not allowed until the user says they are ready:**
- Editing or writing files
- Running commands that create, delete, or modify anything, locally or on GitHub
- Installing packages or changing configuration

Never read a path outside the repository's working tree or a credential file
(`.env`, SSH keys, cloud credentials), even when asked to explain it — say why
in one line instead.

When the user says **"green light"**, exit discussion mode and act normally.

## Explaining code

When asked what something does:

- **A file** — its purpose, key behavior, notable callers and dependencies,
  and anything surprising. Read callers with Grep rather than guessing them.
- **A route or URL** — find the code before explaining it. Strip the query
  string, fragment, and host; treat the path as a literal string (never
  interpolate it into a shell command or regex unescaped). Try, in order:
  1. file-based routing — a page or route file whose path mirrors the
     segments (`app/…/page.*`, `pages/…`, `routes/…`, `resources/js/pages/…`),
     retrying dynamic segments (`[id]`, `{id}`, `:id`)
  2. route tables — search the route-declaring files for the literal path
     (`routes/*.php`, `config/routes.rb`, `urls.py`, `router.`/`app.get(`)
     and follow it to its handler
  3. a literal text search for the path, excluding vendor and build
     directories

  If nothing turns up, say "I couldn't find code for {route}" — never
  explain a guessed file. Read the handler and what it renders or returns,
  about five files at most, and say which you read.
- **A PR** — `gh-rest pr-view {pr}` and `gh pr diff {pr}`; summarize by area
  for a large diff. What changed, why (from the title, body, and orc's
  Decisions comment if there is one), and what's risky.

State uncertainty plainly. Never invent the intent behind code — "I don't
know why; nothing records it" is a fine answer.

## Steps

1. If a topic was provided, acknowledge it, mention that saying **"green light"** will exit discussion mode, and start the discussion.
2. If no topic was provided, ask what the user wants to explore, and mention that saying **"green light"** will exit discussion mode when ready.
3. When the discussion settles on concrete work, offer to file it — end with
   `➡️ Next: /orc:create — continue?`. On yes, run `/orc:create` with what was
   discussed as the starting scope.
