---
name: explain
description: Explain what a file, a route, or a PR is doing in plain language, as a chat reply. Read-only — writes no files, posts no comments. Invoke as /orc:explain {file path | route | pr number | pr url} [--junior|--intermediate|--senior].
model: sonnet
---

`explain` is a read-only orientation aid — point it at a file, a route/URL,
or a pull request and it summarizes what it does, in chat. It never writes
files, never posts a GitHub comment, and never runs a command that mutates
state.

## Explanation depth

Three optional flags control how much explanation comes back: `--junior`,
`--intermediate`, `--senior`. They may appear before or after the target, in
any order — `/orc:explain /dashboard --senior` and
`/orc:explain --senior /dashboard` are both valid.

`--intermediate` is the default when no depth flag is given — its behavior is
unchanged from before depth flags existed. `--junior` explains more; assumes
less prior familiarity and spells out the "why" behind patterns and
conventions, not just the "what". `--senior` explains less; assumes deep
familiarity and spends its words on non-obvious tradeoffs, risks, gotchas,
and coupling instead of restating what's obvious from a glance.

Depth affects step 5 (Summarize) and step 6 (Report) identically for every
target kind — file, route, or PR. See those steps for the exact behavior at
each level.

## Steps

### 1. Resolve target

First, parse flags out of the argument string. Recognized flags:
`--junior`, `--intermediate`, `--senior`. They may appear before or after the
target, in any order. Strip all recognized flags from the argument string
before classifying whatever remains as a target.

- Zero depth flags → use `--intermediate` (default).
- More than one depth flag → stop with
  `Pick one depth: --junior, --intermediate, or --senior.`
- Any other `--`-prefixed token → stop with `Unknown flag: {flag}`.
- Nothing left after stripping flags → the existing no-argument behavior:
  stop and ask what to explain — a file path, a route, a PR number, or a PR
  URL. Don't guess and don't default to the current branch's PR.

Otherwise classify the remaining argument strictly, in this exact order —
this decides which command runs next, so match it against a fixed shape
rather than guessing:

1. The whole argument matches `^#?[0-9]+$` (an optional leading `#`) → a PR;
   the number is the digits, with any leading `#` stripped. Continue to
   step 2.
2. The whole argument matches
   `^https?://github\.com/[^/]+/[^/]+/pull/[0-9]+$` (a `github.com`
   pull-request URL) → a PR; the number is the trailing digits. Continue to
   step 2.
3. The argument names a path that exists → a file target. Continue to step 3.
   (Existence is checked here only to pick a branch; step 3's scope guard
   still runs before any read.)
4. The argument doesn't exist as a path and is route-shaped → a route
   target. Continue to step 4. Route-shaped means: starts with `/`, or is an
   http/https URL that is not a GitHub pull-request URL (the URL's path
   component is the route).
5. Anything else → treat it as a file target. Continue to step 3, which
   stops with `No such file: {path}` as today.

If it matches one of the PR shapes, continue to step 2 with the extracted
number as `{pr}` — never pass the raw argument through uninspected.

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

The path must resolve inside the current repository's working tree — never
read a path that resolves outside it (via `..`, an absolute path outside the
repo, or a symlink escaping it), and never read known-credential files
(`.env`, SSH keys, cloud credential files, etc.) even if they're in-tree.
Refuse with a one-line reason instead of reading.

Otherwise, read the file. If it does not exist, stop with
`No such file: {path}`. If it is very large, read it in full where
practical; otherwise summarize structurally and say which parts were
skimmed.

### 4. Route target

Normalize the argument first: strip any query string and fragment; for a
full URL, keep only the path component; strip a trailing `/` except for the
root route `/`. Call the normalized value `{route}`; its `/`-separated
pieces are its segments.

This skill runs against arbitrary target repos, including ones with no app
or routes at all — so detect the project's shape rather than assuming a
framework. Take a cheap read first: look for `next.config.*`, `app/` or
`pages/` directories, `src/routes/`, `config/routes.rb`, any `urls.py`, a
`package.json` depending on express/koa/fastify, or a router file.

Then try these strategies in order, stopping at the first candidate found:

- **File-based routing** — source files whose path mirrors the route's
  segments: `app/{segments}/page.*` and `src/app/{segments}/page.*`;
  `pages/{segments}.*`, `pages/{segments}/index.*`, and their `src/`
  equivalents; `routes/{segments}.*` and `src/routes/{segments}.*`. If
  nothing matches, retry any literal segment against dynamic-segment
  spellings such as `[id]`, `[...slug]`, `:id`, `_id`, or `$id`.
- **Route-table declarations** — search route-declaring files for the
  literal route string: `config/routes.rb`, any `urls.py`, or files
  containing `app.get(`, `app.post(`, `router.`, `createBrowserRouter`, or
  `<Route path=`. On a hit, follow the mapping to the named handler (a Rails
  `dashboard#index` → `app/controllers/dashboard_controller.rb`, a Django
  view reference → its module, an Express handler → its module). This only
  counts as a candidate if the resolved file actually exists.
- **Plain text search** — a repo-wide literal search for the route string
  (falling back to just its last segment if nothing hits), excluding
  vendor/build/dependency directories.

A candidate is acceptable only if it is a file that exists and was found by
one of the strategies above. If more than one candidate turns up, explain
the highest-ranked one and name the others as alternates. If all three
strategies yield nothing, stop and report exactly this line:

```
Couldn't confidently locate code for {route} — no matching route/page file found.
```

No best-guess fallback, no invented file names.

Step 3's scope guard applies here too, to every file this route resolution
lands on: never read a path that resolves outside the current repository's
working tree, and never read known-credential files (`.env`, SSH keys,
cloud credential files, etc.) even if they're in-tree — refuse with a
one-line reason instead of reading.

Beyond the resolved entry file, read closely related code needed to explain
the page or endpoint — the controller/view/handler it delegates to, the
component/template it renders, its direct local imports. Cap this at about
five files total, and say which ones were read.

### 5. Summarize

The summary's length and focus depend on the depth flag from step 1; report
headings stay the same at every depth — only density and emphasis change.

- **`--junior`** — more explanatory. Define jargon at first use, explain
  *why* a pattern, library, or convention is used and not just what it does,
  and assume no prior framework familiarity. 4-8 sentence summary; bullets
  carry "why" as well as "what".
- **`--intermediate`** (default) — exactly today's behavior, unchanged.
  Plain language, no line-by-line narration. 2-5 sentence summary.
- **`--senior`** — terser. Assume deep familiarity, skip what's obvious from
  a glance, and spend the space on non-obvious tradeoffs, risks, gotchas, or
  coupling. 1-3 sentence summary. If there's nothing non-obvious to flag,
  say so in one line.

For a file: its purpose, its key behaviors/exports, its notable
dependencies or callers, and anything surprising.

For a route: what the page or endpoint does, what it renders or returns,
and how it connects to the related code read in step 4.

For a PR: what changed, why (from the title and body), the shape of the
change across files, and any behavior or risk worth flagging.

State uncertainty explicitly rather than inventing intent, at every depth.

### 6. Report

The block shape below is fixed across depths — depth only changes the
summary length and the density of the bullets, per step 5.

For a file:

```
{path}

{summary per step 5's depth rules}

Key behavior
- {point}
```

For a route:

```
{route} → {path}

{plain-language summary of what this page/endpoint does}

Key behavior
- {point}
```

List any alternates found in step 4 after the block, as also-matched paths.

For a PR:

```
#{number} {title} — {author}, {state}

{summary per step 5's depth rules}

What changed
- {file or area} — {what it does now}
```

This output is a chat reply only — nothing is posted to GitHub, no file is
written, and no state-mutating command is run, at any depth or for any
target kind.
