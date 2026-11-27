# PR description

What `/orc:ship` writes when it opens an issue's PR, and rewrites if the work
changes afterwards. The engineer no longer reviews line by line, so the
description says where their attention is worth spending and nothing else.

## Shape

Use the repo's own PR template (`.github/PULL_REQUEST_TEMPLATE.md`, or a
`pull_request_template.md` in the root, `docs/` or `.github/`): keep its
headings in its order and fill each one. Then add the sections below that the
template doesn't already cover. Leave out any section with nothing to say.

```markdown
<!-- orc:pr -->
Closes #{number}

{the repo template's headings, filled: what changed and why in two or three
lines; breaking changes; how it was tested — the verification commands that
ran and their result}

## Risk tier
**{Light | Standard | Heavy}** — {reason}. Checked by: {verification commands + CI | + independent review, {f} finding(s) fixed, {r} refuted | + four-way review, deploy scan, {mutation or coverage result}}

## Choices worth knowing
- {decision} → {choice} — {why} *(low confidence)*
- {a non-obvious high-confidence choice, only if a reader would trip on it}
{k} more in the Decisions table on #{number}.

## Where to look
**Scrutinize:** `{path}` — {why: subtle logic, a risky edge, a check that couldn't run here}
**Skim:** `{path}` — {why: generated, lockfile, mechanical rename, fixture data}

## Screenshots
| Page · state | Mockup | Built |
|---|---|---|
| Settings · empty | ![]({mockup shot url}) | ![]({built shot url}) |

## 🚀 Before you deploy
1. {step, with the exact command} — {why, one clause}

## 📌 New rules
- {situation} → {choice} — delete it from `.orc/decisions/resolved.md` to veto
```

- **Title** — the issue's title.
- **Risk tier** is always present, with the reason.
- **Choices worth knowing** lists every low-confidence decision and at most
  three others. Reasons come from the Decisions table — never invent one.
- **Where to look** — never list a file that holds logic under Skim. Anything
  that could not be checked in this environment (a visual check that couldn't
  run, a command that needs a missing service) goes under Scrutinize as
  `not checked here: {what} — {why}`.
- **Before you deploy** — every step a deploy of this change needs:
  migrations, worker or queue restarts, new environment variables, one-time
  commands, jobs that change data in outside systems. A destructive or
  irreversible step comes first, marked ⚠️. Also anything to verify after
  deploying. Omit the section when a plain deploy is enough.
- A light change is usually four or five lines in total.

## Screenshots

UI changes only. GitHub's REST API has no image upload, so the images travel
on the PR branch and are removed again before the merge:

```bash
mkdir -p .orc/screenshots/{number}            # {page}-{state}-{width}.png, mockup-{page}-{state}-{width}.png
git add .orc/screenshots/{number} && git commit -m "docs(#{number}): screenshots" && git push
sha=$(git rev-parse HEAD)
nwo=$(${CLAUDE_PLUGIN_ROOT}/scripts/gh-rest repo)
# each image: https://github.com/$nwo/blob/$sha/.orc/screenshots/{number}/{file}.png?raw=true
git rm -r -q .orc/screenshots/{number} && git commit -m "chore(#{number}): remove screenshots from the tree" && git push
```

Link every image by that commit SHA, never by branch name: the SHA stays
reachable through the PR after the branch is deleted, and the squash merge
leaves no image on `{base}`. If the screenshots change later, repeat the
three steps and update the links.

## Updating

Rewrite the description with `gh-rest pr-edit {pr} --body-file …` whenever a
later commit changes what it says — a fix for CI or a review comment that
adds a decision, new deploy steps, new screenshots.
