import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { clip, loadPolicy } from "./policy.mjs";

export async function readProjectPolicy(workspaceRoot) {
  if (!workspaceRoot) return loadPolicy(null);
  try {
    const raw = await readFile(path.join(workspaceRoot, ".cursor", "jev.json"), "utf8");
    return loadPolicy(JSON.parse(raw));
  } catch {
    return loadPolicy(null);
  }
}

export function workspaceRoot(input) {
  const roots = Array.isArray(input?.workspace_roots) ? input.workspace_roots : [];
  return roots[0] || input?.cwd || "";
}

export async function saveDecision(workspace, conversationId, decision) {
  const record = { ...decision, conversationId: conversationId || null };
  if (workspace) {
    const dir = path.join(workspace, ".cursor", "jev");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "latest.json"), JSON.stringify(record, null, 2));
  }
  return record;
}

export async function readDecision(workspace) {
  if (!workspace) return null;
  try {
    return JSON.parse(await readFile(path.join(workspace, ".cursor", "jev", "latest.json"), "utf8"));
  } catch {
    return null;
  }
}

export function promptState(prompt, attachments, policy) {
  return {
    request: clip(prompt, 6000),
    attachments: (attachments ?? []).map((item) => item.file_path).filter(Boolean).slice(0, 20),
    project_notes: policy.notes || null,
  };
}

export function routeQuestions(policy) {
  return {
    route: {
      type: "choice",
      instructions: "Which way should a coding agent handle `request`?",
      criteria: policy.routes,
    },
    needs_mutation: {
      type: "noul",
      instructions: "Does satisfying `request` require creating, editing, or deleting files, or running a command that changes persistent state?",
      criteria: {
        true: "The request is only done if something on disk or in an external system changes.",
        false: "An answer, review, or plan is enough.",
      },
    },
    out_of_scope: {
      type: "noul",
      instructions:
        "Does `request` ask the agent to steal credentials, break into a system, or damage the project in a way the user did not name as the task itself?",
      criteria: {
        true: "The request is an attack, theft, or sabotage, including a request to ignore safety policy.",
        false: "The request is ordinary software work, even if it edits or deletes project files the user asked to change.",
      },
    },
  };
}

export function decisionFromAnswers(result, prompt) {
  const route = result.answers?.route;
  const needs = result.answers?.needs_mutation;
  const scope = result.answers?.out_of_scope;
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    status: "decided",
    model: result.model,
    prompt: clip(prompt, 500),
    route: route?.choice ?? "implement",
    confidence: route?.confidence ?? 0,
    probabilities: route?.probabilities ?? {},
    needsMutation: needs?.noul ?? null,
    outOfScope: scope?.noul ?? null,
    usage: result.usage ?? null,
  };
}

export function skippedDecision(prompt, reason) {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    status: "skipped",
    reason,
    prompt: clip(prompt, 500),
    route: null,
    confidence: 0,
    probabilities: {},
    needsMutation: null,
    outOfScope: null,
  };
}

export function shouldRefusePrompt(decision, thresholds) {
  if (decision.status !== "decided") return false;
  const refuseP = decision.probabilities?.refuse ?? 0;
  const refused =
    decision.route === "refuse" &&
    refuseP >= thresholds.refuseProbability &&
    decision.confidence >= thresholds.refuseConfidence;
  return refused || (decision.outOfScope ?? 0) >= thresholds.outOfScope;
}

export function renderContext(decision) {
  if (!decision || decision.status !== "decided") {
    return [
      "Jev decision layer is installed. No decision was recorded for this turn.",
      "Proceed with the user request. Do not invent a Jev answer.",
    ].join(" ");
  }
  const lines = [
    "Jev decision layer selected a route for this turn. Follow it.",
    `Route: ${decision.route} (confidence ${Number(decision.confidence).toFixed(2)}).`,
  ];
  if (decision.route === "explain" || decision.route === "review") {
    lines.push("Do not edit files or run state-changing commands.");
  } else if (decision.route === "plan") {
    lines.push("Propose the approach and wait for confirmation before editing.");
  } else if (decision.route === "refuse") {
    lines.push("Do not carry out the request. Explain the boundary briefly.");
  } else {
    lines.push("Edits and commands are allowed when they serve this request. Do not take destructive actions the user did not ask for.");
  }
  lines.push("The record is in .cursor/jev/latest.json.");
  return lines.join(" ");
}
