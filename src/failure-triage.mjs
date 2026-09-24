const TEST_COMMAND =
  /\b(?:npm\s+(?:test|run\s+\S*test\S*)|pnpm\s+(?:test|run\s+\S*test\S*)|yarn\s+(?:test|run\s+\S*test\S*)|bun\s+test|npx\s+(?:jest|vitest)|pytest|python(?:3)?\s+-m\s+pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\w*\s+test|dotnet\s+test|mix\s+test|rspec|phpunit|jest|vitest)\b/;

const GUIDANCE = {
  product_bug: "Read the assertion and fix the product code. Do not weaken the test to force a pass.",
  flaky_test: "Do not change product code to silence this. Inspect timing, order, or randomness in the test.",
  environment: "Fix the missing service, port, dependency, or variable. Do not change the test to force a pass.",
};

export function failureQuestions() {
  return {
    failure_kind: {
      type: "choice",
      instructions: "What kind of failure does `log` show for `command`?",
      criteria: {
        product_bug: "An assertion, exception, or wrong output from the code under test.",
        flaky_test: "A timeout, race, order dependency, or nondeterministic failure without a clear product defect.",
        environment: "A missing service, port, credential, dependency install, or machine setup problem.",
      },
    },
  };
}

export function parseShellResult(toolOutput) {
  const value = typeof toolOutput === "string" ? tryParse(toolOutput) : toolOutput;
  if (!value || typeof value !== "object") {
    return { exitCode: null, log: clipTail(String(toolOutput ?? "")) };
  }
  const exitCode = numberOrNull(value.exitCode ?? value.exit_code ?? value.code);
  const log = clipTail([value.stdout, value.stderr, value.output, value.error].filter((part) => typeof part === "string").join("\n"));
  return { exitCode, log };
}

export function isFailedTest(command, toolOutput) {
  if (!TEST_COMMAND.test(String(command ?? ""))) return null;
  const parsed = parseShellResult(toolOutput);
  if (parsed.exitCode === null || parsed.exitCode === 0) return null;
  return { command: String(command), ...parsed };
}

export function classifyFailure(answer, minConfidence) {
  const probabilities = answer?.probabilities ?? {};
  const kind = answer?.choice ?? "product_bug";
  const confidence = answer?.confidence ?? 0;
  const ranked = Object.values(probabilities).sort((a, b) => b - a);
  const separated = ranked.length < 2 || ranked[0] - ranked[1] >= 0.15;
  const certain = confidence >= minConfidence && separated;
  return { kind: certain ? kind : "uncertain", confidence, probabilities, certain };
}

export function renderFailure(classification) {
  if (!classification.certain) {
    const spread = Object.entries(classification.probabilities)
      .map(([name, value]) => `${name} ${Number(value).toFixed(2)}`)
      .join(", ");
    return `Jev could not separate this test failure (${spread || "no distribution"}). Inspect the log before choosing a fix.`;
  }
  return `Jev classified this test failure as ${classification.kind} (confidence ${classification.confidence.toFixed(2)}). ${GUIDANCE[classification.kind]}`;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  return typeof value === "number" ? value : null;
}

function clipTail(text, max = 4000) {
  if (text.length <= max) return text;
  return text.slice(-max);
}
