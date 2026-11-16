## Spec

<!--
The canonical spec for all buildable work. Written onto an issue by /orc:plan
as a comment; consumed by /orc:build.

For the issue to reach status:ready, three things must hold:
  1. Every required Acceptance Criterion is machine-verifiable (a test,
     command, or observable outcome proves it).
  2. Open Questions reads "None." — every ambiguity resolved and folded in.
  3. The engineer approved the approach (plan's approval step).
/orc:plan holds the spec to all three before setting status:ready, and
/orc:build re-checks the first two. Do not weaken either to get a spec out
the door.

Length scales with Size: an S spec is short — omit the optional sections
(marked below) when they'd say "None." and keep Key Logic to what an
implementer could get wrong. Never pad.
-->

### Size and Risk
**Size:** {S | M | L} — {one line: files/areas touched, waves expected}
**Risk:** {low | high} — {one line: why. High when it touches payments, auth or permissions, migrations or schema, queues or jobs, external data or APIs, or a shared/public interface}

### Problem Statement
{one paragraph: what needs to be built and why, distilled from the issue}

### Reproduction
<!-- Bugs only. Omit for non-bugs. -->
{exact steps to reproduce, observed vs. expected behavior, and where it surfaces}

### Mockups
<!-- Only when the change touches UI. Omit otherwise. -->
- `.orc/mockups/{number}/{page}.html` — {page name} — {what changes on it}

### Codebase Touchpoints
{existing files the implementer must read first — `path` — one-line note on relevance. Every path here must actually exist.}

### Files to Create
{for each new file: path, purpose, and enough detail to know exactly what goes in it — or "None."}

### Files to Modify
{for each existing file: path, what changes, and why — or "None."}

### Data Models / Migrations
<!-- Optional: omit when "None." -->
{new tables, columns, indexes, or schema changes with names, types, constraints}

### Key Logic
{non-obvious details: edge cases, business rules, integration specifics, sequencing. Do not restate what the file list already makes clear.}

### In Scope
- {item}

### Out of Scope
- {item}

### Acceptance Criteria
<!-- Each required criterion must be independently, machine-verifiable.
     Bugs MUST include a regression test that fails before the fix, passes after.
     Tag criteria:
       [e2e]      — one per user flow the change touches, proving the flow
                    works end to end through the real wiring (request →
                    controller → service → storage → response), not a unit
                    in isolation. Required for M and L.
       [optional] — nice to have; build runs it when it can (e.g. a check
                    against real external data that needs network access)
                    and reports "not run — {reason}" otherwise. Never gates. -->
- [ ] {condition} — verified by: {test / command / observable outcome}
- [ ] [e2e] {user flow} — verified by: {feature test or command exercising the whole path}
- [ ] [optional] {real-data check} — verified by: {command, and what it needs}

### Decisions
<!-- Choices made in planning. Format and confidence rules:
     orc's templates/decisions.md. Rejected options live here. -->
| # | Decision | Options | Chose | Confidence | Why |
|---|---|---|---|---|---|

### Open Questions
<!-- MUST read "None." before the issue moves to status:ready. Anything
     unresolved keeps the issue at status:draft. -->
None.

### Notes / Constraints
<!-- Optional: omit when "None." -->
{technical constraints, dependencies, risks}
