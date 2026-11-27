---
name: idea
description: Record an idea as one GitHub issue without shipping it now — a title, the goal and why in the engineer's words, any rough scope, and open questions left open. Asks nothing, researches nothing, builds nothing. /orc:ship {number} picks it up later. Invoke as /orc:idea "the idea".
model: haiku
---

## User Input

```text
$ARGUMENTS
```

`idea` files a note and stops. It is deliberately thin: no interview, no
codebase research, no split, no parent, no mockups, no build. Ask nothing —
if `$ARGUMENTS` is empty, say `Usage: /orc:idea "the idea"` and stop.

## Steps

### 1. Check for an obvious duplicate

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest preflight                 # stop and show its message if it fails
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-list --limit 100    # open issues: number, title
mkdir -p .orc/tmp                                               # scratch for the body file
```

Only titles, and only an obvious match — the same idea in other words. Read
no code and open no issue. If one matches, don't file a second issue: add the
new text to it and stop.

```bash
# write the note to .orc/tmp/idea.md with <!-- orc:idea-note --> as its first line, then:
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-comment {n} --body-file .orc/tmp/idea.md
rm .orc/tmp/idea.md
```

```
#{n} already covers this — added your note there: {url}
```

### 2. File one issue

Write the body from what was said and nothing else. Keep the engineer's own
words; don't tidy the idea into a spec, and don't invent scope, behavior or
answers.

```markdown
<!-- orc:idea -->
## Goal
{what they want, in their words}

## Why
{why, in their words — or "Not stated."}

## Rough scope
{only what they gave: what's in, what's out, constraints — omit the section if they gave none}

## Open questions
- {each thing the note leaves unresolved or says they're unsure about}
```

- The marker is the literal first line; it is how `/orc:ship` recognizes an
  idea. Apply no label.
- The title is a short plain phrase naming the idea.
- Open questions holds only what the note itself leaves open — a "maybe", an
  "or", a missing "which". Don't go looking for more: `/orc:ship` settles
  them later. Write `None.` when the note is already clear.

```bash
# write the body to .orc/tmp/idea.md, then:
${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest issue-create --title "{title}" --body-file .orc/tmp/idea.md   # prints {number,url}
rm .orc/tmp/idea.md
```

### 3. Report and stop

One line, nothing after it:

```
#{number} — {title} — {url} · ship it later with /orc:ship {number}
```
