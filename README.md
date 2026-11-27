# hexbyte

A Claude Code plugin marketplace. Three plugins: idea-to-merged-code automation, utilities around it, and long-form writing.

## Plugins

| Plugin | What it does |
|---|---|
| [**orc**](plugins/orc/README.md) | One command from idea to merged code: a short interview, issues, mockups you approve in chat, then build, checks and squash-merge on its own. It stops only when the scope grew or it can't make progress, and never deploys. |
| [**util**](plugins/util/README.md) | Utility skills around orc: Dependabot triage and optional repo scaffolding. |
| [**ink**](plugins/ink/README.md) | Editorial workflow for long-form blog posts: brainstorm, develop, write, review, and publish. |

## Install

### Claude Code CLI (local)

Add the marketplace once, then install the plugins you want:

```
/plugin marketplace add joshevensen/hexbyte-plugins
/plugin install orc@hexbyte
/plugin install util@hexbyte
/plugin install ink@hexbyte
```

### Claude Code on the web (cloud sessions)

The interactive `/plugin` command isn't available in web sessions — plugins must be installed **into the cloud environment** so they load before Claude Code launches. Add them to your environment's **Setup script** (⋯ → **Update cloud environment** → **Setup script**):

```bash
claude plugin marketplace add joshevensen/hexbyte-plugins
claude plugin install orc@hexbyte
claude plugin install util@hexbyte
claude plugin install ink@hexbyte
```

Save changes; the script runs on each new session. Requires the environment's network access to reach `github.com` (the default **Trusted** policy does).

See each plugin's README for its skills and usage: [orc](plugins/orc/README.md) · [util](plugins/util/README.md) · [ink](plugins/ink/README.md).

## Versioning

Each plugin's `plugin.json` `version` is the cache key Claude Code uses to decide whether an installed copy needs updating — pushing commits alone does not update anyone already installed. Bump it in the same PR as any change you want to ship, and record it in the plugin's `CHANGELOG.md`. See [Version management](https://code.claude.com/docs/en/plugins-reference#version-management).
