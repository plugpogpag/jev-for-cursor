import assert from "node:assert/strict";
import test from "node:test";
import { classifyFailure, isFailedTest, renderFailure } from "../src/failure-triage.mjs";

test("a failed test command is classified input", () => {
  const failed = isFailedTest("npm test", JSON.stringify({ exitCode: 1, stdout: "AssertionError: expected 1 to equal 2" }));
  assert.equal(failed.exitCode, 1);
  assert.match(failed.log, /AssertionError/);
});

test("passing tests and other commands are ignored", () => {
  assert.equal(isFailedTest("npm test", JSON.stringify({ exitCode: 0, stdout: "ok" })), null);
  assert.equal(isFailedTest("git status", JSON.stringify({ exitCode: 1, stderr: "fatal" })), null);
});

test("a close probability split stays uncertain", () => {
  const classification = classifyFailure(
    {
      choice: "product_bug",
      confidence: 0.3,
      probabilities: { product_bug: 0.4, flaky_test: 0.35, environment: 0.25 },
    },
    0.45,
  );
  assert.equal(classification.certain, false);
  assert.match(renderFailure(classification), /could not separate/);
});

test("a clear environment failure names that path", () => {
  const classification = classifyFailure(
    {
      choice: "environment",
      confidence: 0.8,
      probabilities: { environment: 0.86, product_bug: 0.1, flaky_test: 0.04 },
    },
    0.45,
  );
  assert.match(renderFailure(classification), /environment/);
  assert.match(renderFailure(classification), /Do not change the test/);
});
