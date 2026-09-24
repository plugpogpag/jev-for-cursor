import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runHook(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["./scripts/hook.mjs"], {
      cwd: root,
      env: { ...process.env, TYPESAFE_API_KEY: "", TYPESAFE_ENV_FILE: path.join(root, "missing-typesafe-env") },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

test("missing API key fails open on prompt submit", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "jev-hook-"));
  try {
    const result = await runHook({
      hook_event_name: "beforeSubmitPrompt",
      prompt: "add a logout button",
      workspace_roots: [workspace],
      conversation_id: "conv-test",
    });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { continue: true });
    const saved = JSON.parse(await readFile(path.join(workspace, ".cursor", "jev", "latest.json"), "utf8"));
    assert.equal(saved.status, "skipped");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("readonly shell is allowed without an API key", async () => {
  const result = await runHook({
    hook_event_name: "preToolUse",
    tool_name: "Shell",
    tool_input: { command: "git status" },
    workspace_roots: ["/tmp"],
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { permission: "allow" });
});

test("session start injects the decision protocol", async () => {
  const result = await runHook({ hook_event_name: "sessionStart" });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.additional_context, /decision layer/);
});
