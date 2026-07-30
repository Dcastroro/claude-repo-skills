import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeRepository } from "../src/analyze.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-"));
  await mkdir(join(root, "src/features/orders"), { recursive: true });
  await mkdir(join(root, "tests"));
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "fixture-app",
    scripts: { test: "node --test", build: "example-build" },
    dependencies: { react: "1.0.0" },
  }));
  await writeFile(join(root, "package-lock.json"), "{}");
  await writeFile(join(root, "AGENTS.md"), "# Rules\nKeep boundaries explicit.");
  await writeFile(join(root, "src/features/orders/index.ts"), "export const order = true;");
  await writeFile(join(root, "tests/orders.test.js"), "export {};");
  return root;
}

test("detects stack, modules, tests, and repository instructions", async () => {
  const root = await fixture();
  try {
    const result = analyzeRepository(root);
    assert.equal(result.name, "fixture-app");
    assert.equal(result.packageManager, "npm");
    assert.equal(result.languages.TypeScript, 1);
    assert.deepEqual(result.tests, ["tests/orders.test.js"]);
    assert.match(result.documentContent["AGENTS.md"], /boundaries/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not traverse symlinked directories", async () => {
  const root = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "claude-repo-skills-outside-"));
  try {
    await writeFile(join(outside, "secret.ts"), "secret");
    await symlink(outside, join(root, "linked"));
    const result = analyzeRepository(root);
    assert.equal(result.languages.TypeScript, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
