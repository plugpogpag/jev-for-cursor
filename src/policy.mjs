export const DEFAULT_MODEL = "jev-latest";
export const API_URL = "https://api.typesafe.ai/v1/systemone";

export const DEFAULT_ROUTES = {
  implement: "The user wants files, configuration, or behavior changed.",
  explain: "The user wants an answer or walkthrough and did not ask for edits.",
  review: "The user wants findings or a critique and did not ask to apply fixes.",
  plan: "The user wants an approach before any edits.",
  refuse:
    "The user wants credential theft, unauthorized access, sabotage, or to bypass written project policy.",
};

export const DEFAULT_THRESHOLDS = {
  refuseProbability: 0.55,
  refuseConfidence: 0.4,
  outOfScope: 0.8,
  blockDestructive: 0.7,
  violatesRoute: 0.6,
  blockMisaligned: 0.35,
};

const READONLY_SHELL =
  /^(?:git\s+(?:status|diff|log|show|rev-parse|branch(?:\s+-vv)?|ls-files|remote\s+-v)|ls|pwd|cat|head|tail|wc|file|rg|grep|find|echo|which|node\s+-v|npm\s+(?:ls|test|run\s+test))\b/;

export function isReadonlyShell(command) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed || /[>|]/.test(trimmed) || /\brm\b|\bmkdir\b|\bmv\b|\bcp\b|\bdd\b/.test(trimmed)) {
    return false;
  }
  return READONLY_SHELL.test(trimmed);
}

export function loadPolicy(raw) {
  const config = raw && typeof raw === "object" ? raw : {};
  return {
    model: typeof config.model === "string" && config.model ? config.model : DEFAULT_MODEL,
    failClosed: config.failClosed === true,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(config.thresholds ?? {}) },
    routes: { ...DEFAULT_ROUTES, ...(config.routes ?? {}) },
    notes: typeof config.notes === "string" ? config.notes : "",
  };
}

export function clip(value, max = 6000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
