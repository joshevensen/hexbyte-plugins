#!/usr/bin/env python3
"""Structural lint for the orc plugin (and the util plugin that ships beside
it) — catches the class of bug that only shows up at runtime in prose-driven
skills: a renamed agent no skill was updated to match, a template path that
doesn't exist, a reference to a skill that was removed, a file nothing uses
any more, a version bump that was forgotten. Exits non-zero on any failure.
"""

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ORC_ROOT = REPO_ROOT / "plugins" / "orc"
UTIL_ROOT = REPO_ROOT / "plugins" / "util"
PLUGINS_ROOT = REPO_ROOT / "plugins"
# The skills orc must ship. Everything else it had (create, plan, build,
# walkthru, learn, status) was replaced by `ship`.
REQUIRED_SKILLS = {"ship", "idea", "discuss"}
# orc reads and writes no labels: a skill that needs one breaks in a repo that
# never had it. gh-rest keeps its label commands; nothing in orc may call them.
LABEL_DEPENDENCY = re.compile(
    r"label-ensure|--(?:add|remove)-label|--label\b"
    r"|status:(?:draft|ready|building|blocked|built)\b|orc:learned|type:bug"
)
# Files that must stay identical between plugins (each plugin installs alone,
# so shared files are copies).
SHARED_COPIES = [
    (ORC_ROOT / "templates" / "pull-request-template.md",
     UTIL_ROOT / "skills" / "setup" / "templates" / "pull-request-template.md"),
]
HELPER = Path("scripts") / "gh-rest"
# `gh` subcommands that use GitHub GraphQL, which Claude Code on the web blocks
# with a 403. `gh pr diff`, `gh run …` and `gh api` (REST) are fine.
GRAPHQL_GH = re.compile(
    r"\bgh\s+(?:issue|pr|repo|label|project)\s+"
    r"(?:view|list|create|edit|comment|ready|merge|checks|checkout|close|reopen|delete|status)\b"
    r"|\bgh\s+api\s+graphql\b"
)
VALID_MODELS = {"haiku", "sonnet", "opus"}

errors = []
warnings = []


def fail(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def parse_frontmatter(path):
    text = path.read_text()
    if not text.startswith("---\n"):
        fail(f"{path}: missing frontmatter (must start with '---')")
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        fail(f"{path}: frontmatter never closes with '---'")
        return {}
    block = text[4:end]
    fields = {}
    for line in block.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            fail(f"{path}: malformed frontmatter line: {line!r}")
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()
    return fields


def check_frontmatter_files(paths, kind):
    for path in paths:
        fields = parse_frontmatter(path)
        for required in ("name", "description", "model"):
            if not fields.get(required):
                fail(f"{path}: missing or empty '{required}' in frontmatter")
        model = fields.get("model")
        if model and model not in VALID_MODELS:
            fail(f"{path}: model '{model}' is not one of {sorted(VALID_MODELS)}")
        expected_name = path.stem if kind == "agent" else path.parent.name
        if fields.get("name") and fields["name"] != expected_name:
            fail(
                f"{path}: frontmatter name '{fields['name']}' doesn't match "
                f"{'filename' if kind == 'agent' else 'directory'} '{expected_name}'"
            )


def check_plugin_root_paths(paths, plugin_root):
    pattern = re.compile(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\s`)\"']+)")
    for path in paths:
        text = path.read_text()
        for match in pattern.finditer(text):
            rel = match.group(1).rstrip(".,;:")
            target = plugin_root / rel
            if not target.exists():
                fail(f"{path}: references nonexistent path ${{CLAUDE_PLUGIN_ROOT}}/{rel}")


def check_agent_references(skill_paths, agent_paths, workflow_referenced=frozenset()):
    defined = {parse_frontmatter(p).get("name") for p in agent_paths}
    defined.discard(None)

    # "invoke `a`", and lists: "invoke `a`, `b` and `c`" (may wrap across lines).
    name = r"`([a-z][a-z0-9-]*)`"
    invoke_pattern = re.compile(
        rf"[Ii]nvoke(?:\s+the)?\s+((?:{name}(?:\s*,\s*|\s+and\s+)?)+)"
    )
    bullet_pattern = re.compile(r"^-\s+`([a-z][a-z0-9-]*)`\s+[—-]", re.MULTILINE)

    referenced = set()
    for path in skill_paths:
        text = path.read_text()
        names = [m.group(1) for m in bullet_pattern.finditer(text)]
        for match in invoke_pattern.finditer(text):
            names.extend(re.findall(name, match.group(1)))
        for agent in names:
            referenced.add(agent)
            if agent not in defined:
                fail(f"{path}: references undefined agent `{agent}`")

    for agent in sorted(defined - referenced - set(workflow_referenced)):
        fail(
            f"agent '{agent}' is defined but never invoked by any skill or workflow — "
            "delete it, or invoke it (\"invoke `name`\")"
        )


def _skip_leading_comments(text):
    """Index of the first character after leading blank lines and // or /* */ comments."""
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
        elif text.startswith("//", i):
            nl = text.find("\n", i)
            i = len(text) if nl == -1 else nl + 1
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = len(text) if end == -1 else end + 2
        else:
            break
    return i


def _matching_brace(text, start):
    """Index of the `}` matching the `{` at `start`, skipping string literals; -1 if none."""
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch in "'\"`":
            i += 1
            while i < len(text) and text[i] != ch:
                i += 2 if text[i] == "\\" else 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def check_workflows(workflow_paths, agent_paths):
    defined = {parse_frontmatter(p).get("name") for p in agent_paths}
    defined.discard(None)

    meta_prefix = "export const meta = {"
    string_value = r"\s*:\s*(['\"`])((?:\\.|(?!\1).)*)\1"
    agent_literal = re.compile(r"['\"]orc:([a-z][a-z0-9-]*)['\"]")

    referenced = set()
    for path in workflow_paths:
        text = path.read_text()

        start = _skip_leading_comments(text)
        if not text.startswith(meta_prefix, start):
            fail(f"{path}: first statement must be '{meta_prefix}'")
        else:
            brace = start + len(meta_prefix) - 1
            end = _matching_brace(text, brace)
            meta = text[brace:end + 1] if end != -1 else text[brace:]
            values = {}
            for field in ("name", "description"):
                match = re.search(rf"\b{field}{string_value}", meta, re.DOTALL)
                if not match or not match.group(2).strip():
                    fail(f"{path}: meta missing '{field}'")
                else:
                    values[field] = match.group(2)
            if "name" in values and values["name"] != path.stem:
                fail(f"{path}: meta name '{values['name']}' doesn't match filename '{path.stem}'")

        for match in agent_literal.finditer(text):
            name = match.group(1)
            referenced.add(name)
            if name not in defined:
                fail(f"{path}: references undefined agent `{name}`")

        if "${CLAUDE_PLUGIN_ROOT}" in text:
            fail(
                f"{path}: uses ${{CLAUDE_PLUGIN_ROOT}}, which is a JS interpolation "
                "in a workflow — pass the plugin root via args"
            )

    return referenced


def check_no_graphql_gh():
    """Skills, agents, templates and scripts must go through scripts/gh-rest.

    gh-rest itself is exempt: it holds the only GraphQL fallbacks (used when
    the web-only /ccr/ routes don't exist, i.e. a local checkout).
    """
    for path in sorted(PLUGINS_ROOT.rglob("*")):
        if not path.is_file() or path.suffix not in {".md", ".sh", ""}:
            continue
        if path.name in {"CHANGELOG.md", "README.md", "gh-rest"}:
            continue
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if GRAPHQL_GH.search(line):
                fail(
                    f"{path.relative_to(REPO_ROOT)}:{lineno}: GraphQL-backed gh call "
                    f"({GRAPHQL_GH.search(line).group(0)!r}) — use ${{CLAUDE_PLUGIN_ROOT}}/scripts/gh-rest instead"
                )


def check_gh_rest_copies_match():
    """Each plugin ships its own copy of gh-rest (plugins install separately)."""
    copies = sorted(PLUGINS_ROOT.glob(f"*/{HELPER}"))
    if not copies:
        fail("no scripts/gh-rest found under plugins/*")
        return
    reference = copies[0].read_text()
    for path in copies[1:]:
        if path.read_text() != reference:
            fail(
                f"{path.relative_to(REPO_ROOT)} differs from {copies[0].relative_to(REPO_ROOT)} — "
                "edit one and copy it to the others"
            )


def check_required_skills(skill_paths):
    present = {p.parent.name for p in skill_paths}
    for name in sorted(REQUIRED_SKILLS - present):
        fail(f"orc is missing its required skill '{name}' ({ORC_ROOT / 'skills' / name / 'SKILL.md'})")


def _prose_files(*roots):
    """Markdown and HTML under the given plugin roots, changelogs excluded
    (they describe what used to exist)."""
    for root in roots:
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix in {".md", ".html"} and path.name != "CHANGELOG.md":
                yield path


def check_skill_references():
    """Every /orc:name and /util:name mentioned anywhere must be a skill that exists."""
    skills = {
        "orc": {p.parent.name for p in (ORC_ROOT / "skills").glob("*/SKILL.md")},
        "util": {p.parent.name for p in (UTIL_ROOT / "skills").glob("*/SKILL.md")},
    }
    pattern = re.compile(r"/(orc|util):([a-z][a-z0-9-]*)")
    extra = [REPO_ROOT / "README.md", REPO_ROOT / "CLAUDE.md", REPO_ROOT / ".claude-plugin" / "marketplace.json"]
    plugin_json = [ORC_ROOT / ".claude-plugin" / "plugin.json", UTIL_ROOT / ".claude-plugin" / "plugin.json"]
    for path in list(_prose_files(ORC_ROOT, UTIL_ROOT)) + extra + plugin_json:
        if not path.exists():
            continue
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            for plugin, name in pattern.findall(line):
                if name not in skills[plugin]:
                    fail(
                        f"{path.relative_to(REPO_ROOT)}:{lineno}: references /{plugin}:{name}, "
                        f"which is not a skill in plugins/{plugin}/skills"
                    )


def check_no_orphan_files():
    """Every orc template and script is referenced by a skill, agent or template."""
    sources = list(_prose_files(ORC_ROOT))
    for kind in ("templates", "scripts"):
        for target in sorted((ORC_ROOT / kind).glob("*")):
            if not target.is_file():
                continue
            needle = f"{kind}/{target.name}"
            if not any(needle in src.read_text() for src in sources if src != target and src.name != "README.md"):
                fail(
                    f"{target.relative_to(REPO_ROOT)}: nothing references {needle} — "
                    "delete it, or reference it from the skill or template that uses it"
                )


def check_no_label_dependency(paths):
    for path in paths:
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            match = LABEL_DEPENDENCY.search(line)
            if match:
                fail(
                    f"{path.relative_to(REPO_ROOT)}:{lineno}: depends on a label ({match.group(0)!r}) — "
                    "orc must work in a repo with no labels"
                )


def check_gh_rest_commands():
    """Every `gh-rest <command>` a skill, agent or template calls is one the script has."""
    script = ORC_ROOT / HELPER
    if not script.exists():
        return
    commands = set()
    for match in re.finditer(r"^  ([a-z][a-z0-9-]*(?:\|[a-z][a-z0-9-]*)*)\)", script.read_text(), re.MULTILINE):
        commands.update(match.group(1).split("|"))
    # Only tokens shaped like a command (pr-…, issue-…, comment-…, label-…), so
    # prose such as "gh-rest only" isn't mistaken for one.
    pattern = re.compile(r"gh-rest\}?\s+(?:-R\s+\S+\s+)?((?:pr|issue|comment|label)-[a-z0-9-]+)")
    for path in _prose_files(ORC_ROOT, UTIL_ROOT):
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            for command in pattern.findall(line):
                if command not in commands:
                    fail(
                        f"{path.relative_to(REPO_ROOT)}:{lineno}: calls `gh-rest {command}`, "
                        f"which {script.relative_to(REPO_ROOT)} doesn't have"
                    )


def check_shared_copies_match():
    """Agents with the same filename in two plugins, and the files in
    SHARED_COPIES, must be byte-identical."""
    pairs = list(SHARED_COPIES)
    for orc_agent in sorted((ORC_ROOT / "agents").glob("*.md")):
        for other in sorted(PLUGINS_ROOT.glob(f"*/agents/{orc_agent.name}")):
            if other != orc_agent:
                pairs.append((orc_agent, other))
    for a, b in pairs:
        if not a.exists() or not b.exists():
            missing = a if not a.exists() else b
            fail(f"{missing.relative_to(REPO_ROOT)}: missing — it is one of a pair of shared copies")
        elif a.read_text() != b.read_text():
            fail(
                f"{b.relative_to(REPO_ROOT)} differs from {a.relative_to(REPO_ROOT)} — "
                "edit one and copy it to the other"
            )


def check_version_changelog_sync(plugin_root):
    plugin_json = plugin_root / ".claude-plugin" / "plugin.json"
    changelog = plugin_root / "CHANGELOG.md"
    plugin_rel = str(plugin_root.relative_to(REPO_ROOT))

    version_match = re.search(r'"version"\s*:\s*"([^"]+)"', plugin_json.read_text())
    if not version_match:
        fail(f"{plugin_json}: no 'version' field found")
        return
    version = version_match.group(1)

    changelog_text = changelog.read_text()
    if f"## [{version}]" not in changelog_text:
        fail(
            f"{plugin_json}: version '{version}' has no matching "
            f"'## [{version}]' heading in {changelog}"
        )

    base_ref = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "--verify", "origin/main"],
        capture_output=True, text=True,
    )
    if base_ref.returncode != 0:
        warn("no origin/main ref available — skipping version-bump-on-change check")
        return

    diff = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "diff", "--name-only", "origin/main...HEAD", "--", plugin_rel],
        capture_output=True, text=True,
    )
    changed_files = [f for f in diff.stdout.splitlines() if f]
    if not changed_files:
        return

    plugin_json_rel = str(plugin_json.relative_to(REPO_ROOT))
    if plugin_json_rel not in changed_files:
        fail(
            f"{plugin_rel}/** changed in this branch but "
            f"{plugin_json_rel}'s version wasn't bumped — installed copies "
            "won't receive this change. Bump 'version' and add a matching "
            "CHANGELOG.md entry."
        )


def main():
    skill_paths = sorted((ORC_ROOT / "skills").glob("*/SKILL.md"))
    agent_paths = sorted((ORC_ROOT / "agents").glob("*.md"))
    workflow_paths = sorted((ORC_ROOT / "workflows").glob("*.js"))

    if not skill_paths:
        fail(f"no SKILL.md files found under {ORC_ROOT / 'skills'}")
    if not agent_paths:
        fail(f"no agent files found under {ORC_ROOT / 'agents'}")

    util_skill_paths = sorted((UTIL_ROOT / "skills").glob("*/SKILL.md"))
    util_agent_paths = sorted((UTIL_ROOT / "agents").glob("*.md"))
    orc_prose = list(_prose_files(ORC_ROOT))

    check_required_skills(skill_paths)
    check_frontmatter_files(skill_paths, "skill")
    check_frontmatter_files(agent_paths, "agent")
    check_frontmatter_files(util_skill_paths, "skill")
    check_frontmatter_files(util_agent_paths, "agent")
    check_plugin_root_paths([p for p in orc_prose if p.name != "README.md"], ORC_ROOT)
    check_plugin_root_paths(util_skill_paths + util_agent_paths, UTIL_ROOT)
    workflow_referenced = check_workflows(workflow_paths, agent_paths)
    check_agent_references(skill_paths, agent_paths, workflow_referenced)
    check_skill_references()
    check_no_orphan_files()
    check_no_label_dependency([p for p in orc_prose if p.name != "README.md"])
    check_gh_rest_commands()
    check_no_graphql_gh()
    check_gh_rest_copies_match()
    check_shared_copies_match()
    check_version_changelog_sync(ORC_ROOT)
    check_version_changelog_sync(UTIL_ROOT)

    for w in warnings:
        print(f"::warning::{w}")
    for e in errors:
        print(f"::error::{e}")

    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
