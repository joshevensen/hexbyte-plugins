# Build-ready issue

The body `/orc:ship` writes onto every issue it builds — a child of a parent,
or a single issue with no parent. The body **is** the spec: there is no
separate spec comment and nobody approves it. Agents are handed this body and
call it "the spec".

Write it after the research and the interview. Length follows the work: a
one-line fix is a few lines; never pad.

## Body

```markdown
<!-- orc:issue -->
Part of #{parent} · needs #{a}, #{b}

## Goal
{what changes and why, from the user's side — one short paragraph}

## Behavior
{what the user sees or gets, case by case. For a bug: steps to reproduce,
what happens, what should happen}

## Scope
**In:** {items}
**Out:** {items explicitly excluded}

## Acceptance criteria
- [ ] {condition} — check: {the command, the named test, or the behavior to observe}
- [ ] {user flow, end to end through the real wiring} — check: {feature test or command}
- [ ] `{page}` matches `.orc/mockups/{number}/{page}.html` in structure, content and states — check: screenshots compared with the mockup

## Files likely touched
- `{path}` — {what changes} ({new} when it doesn't exist yet)

## Mockups
- `.orc/mockups/{number}/{page}.html` — {page} — {what changes on it}
Approved — commit {sha}

## Tier
**{Light | Standard | Heavy}** — {the reason, one line}

## Decisions
| # | Where | Decision | Options | Chose | Confidence | Why |
|---|---|---|---|---|---|---|

## Assumptions
- {anything decided without asking that the engineer might want to know}

## Status
| Order | Issue | Needs | Tier | Status | Branch | PR | Note |
|---|---|---|---|---|---|---|---|
| 1 | #{number} — {title} | — | {tier} | queued | | | |

**Mockups:** {none — no UI change | awaiting approval | approved — commit {sha}}

<details><summary>Original request</summary>

{the issue's earlier body, word for word}

</details>
```

- The marker is the literal first line. It is how a later run knows the issue
  is build-ready.
- **Line 2** (`Part of … · needs …`) only on a child of a parent; drop
  `· needs …` when nothing must merge first. Name only real dependencies —
  code this issue can't be built without — not everything that comes earlier
  in the order.
- **Mockups** only when the issue changes what a user sees; the `Approved`
  line is added when the engineer approves them.
- **Status**, with its `**Mockups:**` line, only on a single issue with no
  parent — it is then its own home issue
  (`${CLAUDE_PLUGIN_ROOT}/templates/parent.md`). A child's status lives in
  the parent's table.
- **Original request** only when the body replaces one that already existed
  (an idea, or an issue the engineer wrote). Never drop their words.
- **Decisions** starts with the choices made while specifying and grows
  during the build (`${CLAUDE_PLUGIN_ROOT}/templates/decisions.md`).
- Apply no labels. Nothing in orc reads one.

## Check it before filing

Nobody else reviews the spec, so check it yourself:

1. **Paths** — every path under Files likely touched exists (`test -e`) or is
   marked `(new)` and sits in a directory that exists or is created by this
   work.
2. **Criteria** — each one names a command or test that can run in this repo
   (check `CLAUDE.md` for the real commands) or a behavior that can be
   observed. No "works correctly", no "looks right". Anything that needs
   production data or a deployed system is not a criterion — it goes in the
   PR's deploy notes as a step to do after deploying.
3. **Coverage** — every In item is covered by a criterion. Every user flow
   the change touches has a criterion that drives it end to end through the
   real wiring, so a value nothing writes, or a route nothing calls, fails
   it. A bug has a regression test that fails before the fix.
4. **Consistency** — In, Out, Behavior, the files and the mockups don't
   contradict each other.
5. **Edges** — the empty, null, duplicate, permission and failure cases the
   code shows this work touches are either in Behavior or explicitly Out.
6. **Rules** — nothing contradicts `CLAUDE.md` or `.orc/decisions/resolved.md`.
