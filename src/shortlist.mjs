const CANDIDATE_CAP = 24;
const TRIGGER_AT = 6;
const SHORTLIST_SIZE = 5;
const PATH_LINE = /^(?:\.?\.?\/)?[\w.@+-]+(?:\/[\w.@+-]+)+\.[A-Za-z0-9]+$/;

export function searchQuery(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return "";
  return String(toolInput.pattern ?? toolInput.query ?? toolInput.glob ?? toolInput.glob_pattern ?? "").slice(0, 500);
}

export function extractCandidatePaths(toolOutput) {
  const counts = new Map();
  const add = (value) => {
    const path = cleanPath(value);
    if (!path) return;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  };
  collect(parseOutput(toolOutput), add);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, CANDIDATE_CAP)
    .map(([path]) => path);
}

function parseOutput(toolOutput) {
  if (typeof toolOutput !== "string") return toolOutput;
  const trimmed = toolOutput.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function collect(value, add) {
  if (typeof value === "string") {
    for (const line of value.split("\n")) add(line.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, add);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (["path", "file", "file_path", "uri", "filename"].includes(key) && typeof nested === "string") add(nested);
    else collect(nested, add);
  }
}

function cleanPath(value) {
  let text = String(value ?? "").trim().replace(/^[-*]\s+/, "");
  if (!text || text.startsWith("<") || /^\d+:/.test(text)) return "";
  text = text.replace(/:\d+(?::\d+)?:.*$/, "");
  if (text.includes("://") || text.length > 240) return "";
  if (!PATH_LINE.test(text)) return "";
  return text.replace(/^\.\//, "");
}

export function shouldShortlist(paths) {
  return paths.length >= TRIGGER_AT;
}

export function relevanceQuestions(paths) {
  return Object.fromEntries(
    paths.map((file, index) => [
      `f${index}`,
      {
        type: "noul",
        instructions: {
          question: "Should the agent open `file` first to handle `request`?",
          file,
        },
        criteria: {
          true: "This file is a primary place to read for that request.",
          false: "This file only matched the search incidentally.",
        },
      },
    ]),
  );
}

export function pickShortlist(paths, answers, minProbability) {
  const ranked = paths
    .map((file, index) => ({ file, probability: answers?.[`f${index}`]?.noul ?? 0 }))
    .sort((a, b) => b.probability - a.probability);
  const passed = ranked.filter((item) => item.probability >= minProbability).slice(0, SHORTLIST_SIZE);
  if (passed.length > 0) return passed;
  return ranked.slice(0, Math.min(3, ranked.length));
}

export function renderShortlist(items, query) {
  const lines = items.map((item, index) => `${index + 1}. ${item.file} (${item.probability.toFixed(2)})`);
  return [
    "Jev shortlisted these files for the search. Read these first.",
    query ? `Search: ${query}` : "",
    ...lines,
    "Open the other matches only if these files are not enough.",
  ]
    .filter(Boolean)
    .join("\n");
}
