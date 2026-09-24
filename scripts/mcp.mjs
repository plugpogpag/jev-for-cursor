#!/usr/bin/env node
import { createClient } from "../src/client.mjs";
import { decisionFromAnswers, promptState, routeQuestions, shouldRefusePrompt } from "../src/decide.mjs";
import { actionQuestions, judgeAction } from "../src/gate.mjs";
import { loadPolicy } from "../src/policy.mjs";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

const tools = [
  {
    name: "jev_route",
    description: "Ask Jev which route a user request should take: implement, explain, review, plan, or refuse.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string" },
        notes: { type: "string" },
      },
      required: ["request"],
    },
  },
  {
    name: "jev_judge_action",
    description: "Ask Jev whether a tool call matches the current route and whether it is destructive.",
    inputSchema: {
      type: "object",
      properties: {
        user_request: { type: "string" },
        route: { type: "string" },
        tool_name: { type: "string" },
        tool_call: { type: "string" },
      },
      required: ["user_request", "route", "tool_name", "tool_call"],
    },
  },
];

async function callTool(name, args) {
  const policy = loadPolicy({ notes: args.notes });
  const api = createClient();
  if (name === "jev_route") {
    const result = await api.systemOne({
      model: policy.model,
      state: promptState(args.request, [], policy),
      questions: routeQuestions(policy),
    });
    const decision = decisionFromAnswers(result, args.request);
    return { ...decision, blocked: shouldRefusePrompt(decision, policy.thresholds) };
  }
  if (name === "jev_judge_action") {
    const result = await api.systemOne({
      model: policy.model,
      state: {
        user_request: args.user_request,
        route: args.route,
        tool_name: args.tool_name,
        tool_call: args.tool_call,
      },
      questions: actionQuestions(),
    });
    return judgeAction({
      decision: { route: args.route, prompt: args.user_request },
      toolName: args.tool_name,
      toolInput: { command: args.tool_call },
      answers: result.answers,
      thresholds: policy.thresholds,
    });
  }
  throw new Error(`Unknown tool ${name}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\n");
  while (newline !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handle(JSON.parse(line)).catch((error) => {
      process.stderr.write(`${error.message}\n`);
    });
    newline = buffer.indexOf("\n");
  }
});

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "jev-decision-layer", version: "0.1.0" },
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    ok(id, { tools });
    return;
  }
  if (method === "tools/call") {
    try {
      const data = await callTool(params.name, params.arguments ?? {});
      ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
    } catch (error) {
      ok(id, { isError: true, content: [{ type: "text", text: error.message }] });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}
