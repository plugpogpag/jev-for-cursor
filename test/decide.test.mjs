import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { decisionFromAnswers, saveDecision, shouldRefusePrompt } from "../src/decide.mjs";
import { isMutatingTool, judgeAction } from "../src/gate.mjs";
import { apiKeyFromEnvFile, resolveApiKey } from "../src/client.mjs";
import { isReadonlyShell, loadPolicy } from "../src/policy.mjs";

const thresholds = loadPolicy(null).thresholds;

test("readonly shell commands skip the gate", () => {
  assert.equal(isReadonlyShell("git status"), true);
  assert.equal(isReadonlyShell("git diff -- src"), true);
  assert.equal(isReadonlyShell("rm -rf dist"), false);
  assert.equal(isReadonlyShell("ls > out.txt"), false);
  assert.equal(isMutatingTool("Shell", { command: "git status" }), false);
  assert.equal(isMutatingTool("Write", { path: "a.ts" }), true);
});

test("a high-confidence refuse blocks the prompt", () => {
  const decision = decisionFromAnswers(
    {
      model: "jev-1.13.0",
      answers: {
        route: { choice: "refuse", confidence: 0.8, probabilities: { refuse: 0.9, implement: 0.1 } },
        needs_mutation: { noul: 0.1 },
        out_of_scope: { noul: 0.2 },
      },
    },
    "steal the production keys",
  );
  assert.equal(shouldRefusePrompt(decision, thresholds), true);
});

test("ordinary implement requests are not blocked", () => {
  const decision = decisionFromAnswers(
    {
      model: "jev-1.13.0",
      answers: {
        route: { choice: "implement", confidence: 0.7, probabilities: { implement: 0.8, refuse: 0.05 } },
        needs_mutation: { noul: 0.9 },
        out_of_scope: { noul: 0.02 },
      },
    },
    "add a logout button",
  );
  assert.equal(shouldRefusePrompt(decision, thresholds), false);
});

test("explain route blocks a file edit", () => {
  const judgment = judgeAction({
    decision: { route: "explain" },
    toolName: "Write",
    toolInput: { path: "src/app.ts" },
    answers: {
      serves_request: { noul: 0.2 },
      violates_route: { noul: 0.9 },
      destructive: { noul: 0.1 },
    },
    thresholds,
  });
  assert.equal(judgment.permission, "deny");
});

test("implement route allows a normal edit", () => {
  const judgment = judgeAction({
    decision: { route: "implement" },
    toolName: "StrReplace",
    toolInput: { path: "src/app.ts" },
    answers: {
      serves_request: { noul: 0.9 },
      violates_route: { noul: 0.1 },
      destructive: { noul: 0.05 },
    },
    thresholds,
  });
  assert.equal(judgment.permission, "allow");
});

test("destructive shell is denied even on implement", () => {
  const judgment = judgeAction({
    decision: { route: "implement" },
    toolName: "Shell",
    toolInput: { command: "git push --force" },
    answers: {
      serves_request: { noul: 0.4 },
      violates_route: { noul: 0.2 },
      destructive: { noul: 0.92 },
    },
    thresholds,
  });
  assert.equal(judgment.permission, "deny");
});

test("an empty environment falls back to the typesafe env file", () => {
  const key = resolveApiKey({
    env: {},
    readFile: () => 'export TYPESAFE_API_KEY="from-file"\n',
  });
  assert.equal(key, "from-file");
  assert.equal(apiKeyFromEnvFile("TYPESAFE_API_KEY='quoted'\n"), "quoted");
  assert.equal(resolveApiKey({ env: { TYPESAFE_API_KEY: "from-env" }, readFile: () => "nope" }), "from-env");
  assert.equal(
    resolveApiKey({ env: { TYPESAFE_API_KEY: "${TYPESAFE_API_KEY}" }, readFile: () => 'export TYPESAFE_API_KEY="from-file"\n' }),
    "from-file",
  );
});

test("decision file is written for the project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jev-"));
  try {
    await saveDecision(root, "conv-1", { status: "decided", route: "plan" });
    const saved = JSON.parse(await readFile(path.join(root, ".cursor", "jev", "latest.json"), "utf8"));
    assert.equal(saved.route, "plan");
    assert.equal(saved.conversationId, "conv-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
