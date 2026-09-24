import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_URL } from "./policy.mjs";

export class TypeSafeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TypeSafeError";
    this.status = status;
  }
}

export function apiKeyFromEnvFile(text) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?TYPESAFE_API_KEY=(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

export function resolveApiKey({
  env = process.env,
  home = os.homedir(),
  readFile = (file) => readFileSync(file, "utf8"),
} = {}) {
  const fromEnv = env.TYPESAFE_API_KEY?.trim();
  if (fromEnv && !fromEnv.includes("${")) return fromEnv;
  const file = env.TYPESAFE_ENV_FILE || path.join(home, ".config", "typesafe", "env");
  try {
    return apiKeyFromEnvFile(readFile(file)).trim();
  } catch {
    return "";
  }
}

export function createClient({ apiKey = resolveApiKey(), fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  return {
    async systemOne({ model, state, questions }) {
      if (!apiKey) {
        throw new TypeSafeError("TYPESAFE_API_KEY is not set", 401);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, state, questions }),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new TypeSafeError(body.message || response.statusText || "TypeSafe request failed", response.status);
        }
        return body;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
