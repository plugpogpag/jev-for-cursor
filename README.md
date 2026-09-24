# Jev for Cursor

This plugin puts [Jev](https://docs.typesafe.ai/introduction/coding-agents.md) in front of the Cursor agent. Jev chooses the route for each turn and blocks the agent from editing files or running dangerous commands. It does not write code and does not replace the chat model.

Jev (TypeSafe System One) answers typed questions. The plugin uses those answers as the decision layer.

## What happens on each turn

1. `beforeSubmitPrompt` sends the user request to Jev, which chooses a route: `implement`, `explain`, `review`, `plan`, or `refuse`.
2. The result is written to the project's `.cursor/jev/latest.json`, and the plugin rule tells the agent to follow that route.
3. If the route is `refuse` and the probability is high enough, the request is not sent to the agent.
4. `preToolUse` asks Jev again before `Write`, `StrReplace`, `Delete`, `EditNotebook`, `Task`, and any shell command that is not read-only. Commands such as `git status` and `git diff` pass through without an API call.
5. After `Grep`, `Glob`, or `SemanticSearch` returns at least six files, Jev scores each path and adds a shortlist of up to five files to the tool result. Other matches stay in the original output. Open those first.
6. After a test command exits non-zero, Jev classifies the tail of the log as `product_bug`, `flaky_test`, or `environment`. When confidence is below `testFailureConfidence`, or the top two probabilities are within 0.15, the note says the log is not separable and the agent should inspect it before choosing a fix.

Covered test commands include `npm test`, `pnpm`, `yarn`, `bun test`, `jest`, `vitest`, `pytest`, `go test`, and `cargo test`. A passing test does not call Jev.

## Install in Cursor

Cursor loads this plugin from `~/.cursor/plugins/local`. Copy the folder. A symlink that points outside that directory is ignored.

```bash
mkdir -p ~/.cursor/plugins/local
cp -R /path/to/jev-decision-layer ~/.cursor/plugins/local/jev-decision-layer
```

Then run **Developer: Reload Window** from the command palette.

The API key is read from `TYPESAFE_API_KEY` in the environment, from the plugin variable of the same name, or from `~/.config/typesafe/env` when the environment value is empty:

```bash
export TYPESAFE_API_KEY="your-key-here"
```

Hooks do not source `~/.zshrc`. A key that exists only in the shell profile is invisible to them. After changing hooks, reload the window so Cursor respawns the MCP server from `${CURSOR_PLUGIN_ROOT}`.

If there is no API key, this layer skips the decision and lets the agent continue. Set `"failClosed": true` in `.cursor/jev.json` if you want it to stop when Jev cannot be reached.

## Use with a project

Copy the starter policy into the project:

```bash
mkdir -p .cursor
cp /path/to/jev-decision-layer/examples/jev.json .cursor/jev.json
```

You can edit `notes`, `routes`, and `thresholds` in that file. Do not put an API key in the repo.

| Threshold | Default | Effect |
| --- | --- | --- |
| `shortlistMin` | 0.35 | Lowest relevance probability kept in a search shortlist |
| `testFailureConfidence` | 0.45 | Below this, a failed test is reported as not separable |

Add this line to the `.gitignore` of any project that uses the plugin:

```
.cursor/jev/latest.json
```

During a turn, the agent can call two tools on the `jev` MCP server: `jev_route` and `jev_judge_action`. The scripts are launched from `${CURSOR_PLUGIN_ROOT}`, not from the project folder that is currently open.

## Development

Requires Node.js 20 or later.

```bash
npm test
```
