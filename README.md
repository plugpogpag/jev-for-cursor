# Jev for Cursor

This plugin puts [Jev](https://docs.typesafe.ai/introduction/coding-agents.md) in front of the Cursor agent. Jev chooses the route for each turn and blocks the agent from editing files or running dangerous commands. It does not write code and does not replace the chat model.

Jev (TypeSafe System One) answers typed questions. The plugin uses those answers as the decision layer.

## What happens on each turn

1. `beforeSubmitPrompt` sends the user request to Jev, which chooses a route: `implement`, `explain`, `review`, `plan`, or `refuse`.
2. The result is written to the project's `.cursor/jev/latest.json`, and the plugin rule tells the agent to follow that route.
3. If the route is `refuse` and the probability is high enough, the request is not sent to the agent.
4. `preToolUse` asks Jev again before `Write`, `StrReplace`, `Delete`, `EditNotebook`, `Task`, and any shell command that is not read-only.

Read-only commands such as `git status` and `git diff` pass through without an API call.

## Install in Cursor

1. Open Customize → Plugins and load this folder as a local plugin.
2. Set `TYPESAFE_API_KEY` in the app environment, in a plugin variable with the same name, or in `~/.config/typesafe/env` (hooks and the MCP server read this file when the environment is empty).
3. Open the project you want to use and start a new agent.

If there is no API key, this layer skips the decision and lets the agent continue. Set `"failClosed": true` in `.cursor/jev.json` if you want it to stop when Jev cannot be reached.

## Use with a project

Copy the starter policy into the project:

```bash
mkdir -p .cursor
cp /path/to/jev-decision-layer/examples/jev.json .cursor/jev.json
```

You can edit `notes`, `routes`, and `thresholds` in that file. Do not put an API key in the repo.

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
