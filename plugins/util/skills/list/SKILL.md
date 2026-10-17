---
name: list
description: List open orc issues, optionally filtered by status — draft (needs a spec), ready (buildable), building, blocked, or built. Use to see what to plan or build next.
model: haiku
---

`list` is the single read-only view of the orc pipeline. It replaces the old
`drafts` and `ready` skills — one command, filterable by status.

## Steps

### 1. Resolve filter

An optional status argument narrows the list: `draft`, `ready`, `building`,
`blocked`, or `built`. With no argument, show every open orc-managed issue
grouped by status.

### 2. Fetch

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight    # once; cached. Stop and show its message if it fails

# with a status argument:
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-list --label "status:{status}" --limit 100

# with no argument (all statuses):
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-list --limit 100
```

Each issue comes back as `{number, title, labels, updatedAt}` (REST only —
the `gh issue` subcommands use GraphQL, which is blocked on Claude Code on the web).

When listing everything, keep only issues that carry a `status:*` label and
group them in pipeline order: draft → ready → building → blocked → built.

### 3. Report

```
{Status heading} (n)

#{number}  {title}  [{type:bug if present}]  updated {relative time}
...
```

Headings and their next-step hint:

- **Drafts — needs a spec** → `Run /orc:plan {number} to write the spec.`
- **Ready to build** → `Run /orc:build {number}.`
- **Building** → in progress.
- **Blocked** → paused at a gate; read the latest issue comment for why.
- **Built** → PR open, awaiting your merge.

If a filtered list is empty: `No {status} issues.`
If nothing is open at all: `No open issues — /orc:create something new.`
