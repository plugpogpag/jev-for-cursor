---
name: jev-decision
description: >
  Use Jev (TypeSafe System One) as the decision layer for a Cursor agent turn.
  Use when routing a request, judging a tool call, tuning .cursor/jev.json,
  or explaining why a prompt or edit was blocked.
---

# Jev decision layer

Jev does not write code. It returns a typed route and probabilities. This plugin asks those questions and the agent follows the result.

## Routes

| Route | Agent behavior |
| --- | --- |
| implement | Edit and run commands that serve the request |
| explain | Answer without edits or state-changing commands |
| review | Report findings without applying fixes |
| plan | Propose an approach and wait |
| refuse | Stop |

The hook writes the latest decision to `.cursor/jev/latest.json` before the model sees the turn. A second Jev call checks mutating tools (`Write`, `StrReplace`, `Delete`, `EditNotebook`, `Task`, and non-readonly `Shell`).

## Project policy

Copy `examples/jev.json` to `.cursor/jev.json` in the project to change routes, notes, or thresholds. Question text belongs in that file's `routes` and `notes`, not scattered through the plugin.

Set `TYPESAFE_API_KEY` in the environment, or in the plugin variable of the same name. Without a key the layer skips and the agent proceeds, unless `failClosed` is true.

## Mid-turn judgments

The `jev` MCP server exposes `jev_route` and `jev_judge_action` for a decision that is not the automatic hook. Use them when a later step needs a new judgment over new state. Do not re-ask a question whose evidence has not changed.

## When a call is blocked

Read `.cursor/jev/latest.json` and the hook message. Adjust the action so it matches the route, or ask the user. Do not lower thresholds to force one blocked call through.
