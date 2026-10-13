# Daxium Claude Code plugins

Public Claude Code marketplace: mods, skills, agents, commands.

## Install

One step, in a Claude Code terminal session (2.1.275+):

```
/plugin install <plugin> --marketplace daxium/claude-plugins
```

Or add the marketplace once:

```
/plugin marketplace add daxium/claude-plugins
```

Then, per plugin:

```
/plugin install <plugin>@daxium-public
```

Get new plugins and versions: `/plugin marketplace update daxium-public`.

## Plugins

| Plugin | What it does |
| --- | --- |
| [git-diff](git-diff) | `/git-diff [branch\|worktree\|dir]`: git diff in a side pane |

```
/plugin install git-diff --marketplace daxium/claude-plugins
```

## Adding a plugin

1. Put it in its own folder: `<plugin>/.claude-plugin/plugin.json` and its parts.
2. List it in `.claude-plugin/marketplace.json` and in the table above.
3. `claude plugin validate .` and `claude plugin validate <plugin>`; `claude plugin test <plugin>` for a mod.
4. This repo is public: no client data, internal URLs, ticket keys or hardcoded paths.
