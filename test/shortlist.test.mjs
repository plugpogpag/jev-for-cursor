import assert from "node:assert/strict";
import test from "node:test";
import { extractCandidatePaths, pickShortlist, shouldShortlist } from "../src/shortlist.mjs";

const grepText = `
src/auth/login.ts
  10:export function login() {}
src/auth/session.ts
  4:session
src/billing/invoice.ts
  2:invoice
src/ui/button.ts
  8:button
src/ui/theme.ts
  3:theme
`;

test("grep text yields unique file paths", () => {
  const paths = extractCandidatePaths(grepText);
  assert.deepEqual(paths, [
    "src/auth/login.ts",
    "src/auth/session.ts",
    "src/billing/invoice.ts",
    "src/ui/button.ts",
    "src/ui/theme.ts",
  ]);
  assert.equal(shouldShortlist(paths), false);
});

test("json search results and a long list trigger a shortlist", () => {
  const payload = JSON.stringify({
    results: Array.from({ length: 8 }, (_, index) => ({ path: `src/mod/file-${index}.ts` })),
  });
  const paths = extractCandidatePaths(payload);
  assert.equal(paths.length, 8);
  assert.equal(shouldShortlist(paths), true);
  const answers = Object.fromEntries(paths.map((_, index) => [`f${index}`, { noul: index === 3 ? 0.9 : 0.1 }]));
  const picked = pickShortlist(paths, answers, 0.35);
  assert.deepEqual(picked.map((item) => item.file), ["src/mod/file-3.ts"]);
});

test("a flat ranking still returns a few files", () => {
  const paths = ["a/b.ts", "c/d.ts", "e/f.ts", "g/h.ts", "i/j.ts", "k/l.ts"];
  const picked = pickShortlist(paths, {}, 0.35);
  assert.equal(picked.length, 3);
});
