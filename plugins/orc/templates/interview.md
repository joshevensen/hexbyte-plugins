# Interview

How `/orc:ship` settles what to build. The aim is the fewest questions that
still leave nothing about scope or behavior to guess.

## Research first

Read before asking anything:

- the code the idea touches — routes, models, pages, components, jobs, and
  the tests that show how they're expected to behave
- **the wiring around it** — what reads and writes the data involved, and the
  user flows that pass through. A feature can pass every unit test and never
  run because nothing writes the value it reads
- `CLAUDE.md` (root, and any in the directories involved), the README and docs
- `.orc/decisions/resolved.md`, if it exists — rules already settled
- open issues that overlap

When the work spans several independent areas, send one read-only Explore
agent per area in parallel and reason over what they return. Never ask what
any of this answers.

## Say so if the idea doesn't fit

Before the first question, in one short message, only what applies:

- 🔴 it won't work as described, and why (a conflict with existing behavior,
  data that doesn't exist, a constraint the idea missed)
- 💡 a simpler way reaches the same goal, or existing code already does most
  of it
- ⚠️ a cost the idea didn't account for (a migration on a large table, a
  breaking change to a shared interface, a flow it quietly changes)

Anything here that changes the scope becomes the first question. If nothing
applies, say nothing.

## What to ask

Only what changes what gets built:

- **Scope** — what is in.
- **Behavior** — what the user sees or gets in each case that matters,
  including the empty, error and no-permission cases when the code doesn't
  settle them.
- **Boundaries** — what is explicitly out.
- **UI** — whether anything a user sees changes, and on which pages.
- **Split** — one PR, or ordered issues under a parent. Propose the split
  and say why; this is telling, not asking, unless there is a real choice.

Not the approach, the libraries, the file layout, the names, the tests or the
risk. Decide those and record them.

## How to ask

- Use `AskUserQuestion`: up to four questions per call, one call per
  exchange.
- Each question gives the recommended answer first, marked "(Recommended)",
  with one line of why, then each alternative with its cost in one line.
- Aim for one to three exchanges. Stop when scope, behavior, boundaries and
  split are settled — not when you run out of things you could ask.
- An answer that opens a new fork gets one follow-up exchange. Never re-ask
  something already answered, in this session or in the issue.

## When to skip

Skip the interview when the request is already clear and small — a one-line
fix, a copy tweak, a well-described bug — or when an existing issue's body
already settles scope, behavior and boundaries. Research still happens.

## Starting from an existing issue

The issue's body and comments are the starting point; everything they settle
is settled.

- An **idea** issue (its body starts with `<!-- orc:idea -->`): ask only
  about its Open questions and whatever research shows the note leaves
  unsettled. A note that is already clear skips the interview.
- Any other issue: the same rule. A `## Spec` comment written by an earlier
  version of orc counts as settled scope and behavior.

## Close

End with this statement, then continue **without waiting**. It exists so the
engineer can interrupt, not so they can approve.

```
📋 Building: {what will be built, in their terms — one to three lines}
Out: {what is explicitly not included}
Assuming: {each assumption made without asking, one line each — or "nothing"}
Shape: {one issue | {n} ordered issues under a parent: {titles, in order}}
UI: {pages that get a mockup for approval | none}
```
