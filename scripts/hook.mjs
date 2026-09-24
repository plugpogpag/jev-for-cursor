#!/usr/bin/env node
import { createClient } from "../src/client.mjs";
import {
  decisionFromAnswers,
  readDecision,
  readProjectPolicy,
  renderContext,
  routeQuestions,
  saveDecision,
  shouldRefusePrompt,
  skippedDecision,
  promptState,
  workspaceRoot,
} from "../src/decide.mjs";
import { actionQuestions, isMutatingTool, judgeAction, toolSummary } from "../src/gate.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function client() {
  return createClient();
}

async function onSession() {
  emit({
    additional_context:
      "Jev is the decision layer for this agent. Before editing or running state-changing commands, follow the route in .cursor/jev/latest.json when that file exists. explain and review stay read-only. plan waits for confirmation. refuse stops. If the file is missing or status is skipped, proceed with the user request.",
  });
}

async function onPrompt(input) {
  const root = workspaceRoot(input);
  const policy = await readProjectPolicy(root);
  const prompt = input.prompt ?? "";
  try {
    const result = await client().systemOne({
      model: policy.model,
      state: promptState(prompt, input.attachments, policy),
      questions: routeQuestions(policy),
    });
    const decision = await saveDecision(root, input.conversation_id, decisionFromAnswers(result, prompt));
    if (shouldRefusePrompt(decision, policy.thresholds)) {
      emit({
        continue: false,
        user_message: `Jev routed this request to refuse (confidence ${decision.confidence.toFixed(2)}). It was not sent to the agent.`,
      });
      return;
    }
    emit({ continue: true });
  } catch (error) {
    await saveDecision(root, input.conversation_id, skippedDecision(prompt, error.message));
    if (policy.failClosed) {
      emit({ continue: false, user_message: `Jev decision layer failed closed: ${error.message}` });
      return;
    }
    emit({ continue: true });
  }
}

async function onTool(input) {
  const root = workspaceRoot(input);
  const policy = await readProjectPolicy(root);
  const toolName = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};
  if (!isMutatingTool(toolName, toolInput)) {
    emit({ permission: "allow" });
    return;
  }
  const decision = await readDecision(root);
  try {
    const result = await client().systemOne({
      model: policy.model,
      state: {
        user_request: decision?.prompt ?? "",
        route: decision?.route ?? "unknown",
        tool_name: toolName,
        tool_call: toolSummary(toolName, toolInput),
        project_notes: policy.notes || null,
      },
      questions: actionQuestions(),
    });
    const judgment = judgeAction({
      decision,
      toolName,
      toolInput,
      answers: result.answers,
      thresholds: policy.thresholds,
    });
    if (judgment.permission === "deny") {
      emit({
        permission: "deny",
        user_message: judgment.reason,
        agent_message: `${judgment.reason} Route: ${decision?.route ?? "unknown"}. Adjust the action or ask the user.`,
      });
      return;
    }
    emit({ permission: "allow" });
  } catch (error) {
    if (policy.failClosed) {
      emit({
        permission: "deny",
        user_message: `Jev decision layer failed closed: ${error.message}`,
        agent_message: `Jev could not judge this action (${error.message}). Do not retry the same call until the decision layer is available.`,
      });
      return;
    }
    emit({ permission: "allow" });
  }
}

const input = await readStdin();
const event = input.hook_event_name;
if (event === "sessionStart") await onSession();
else if (event === "beforeSubmitPrompt") await onPrompt(input);
else if (event === "preToolUse") await onTool(input);
else emit({});
