import assert from "node:assert/strict";
import { chmodSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeRepository } from "../src/analyze.mjs";
import { defaultConfig } from "../src/config.mjs";

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

test("digest is stable when an unrelated file is added or removed", async () => {
  const root = await fixture();
  try {
    const before = analyzeRepository(root);
    await writeFile(join(root, "unrelated-notes.txt"), "this does not feed generation");
    const after = analyzeRepository(root);
    assert.equal(after.digest, before.digest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("digest changes when documentation content feeding generation changes", async () => {
  const root = await fixture();
  try {
    const before = analyzeRepository(root);
    await writeFile(join(root, "AGENTS.md"), "# Rules\nKeep boundaries explicit, updated.");
    const after = analyzeRepository(root);
    assert.notEqual(after.digest, before.digest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("detects README.md nested inside packages/ and apps/ module directories", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "packages/widgets"), { recursive: true });
    await writeFile(join(root, "packages/widgets/README.md"), "# Widgets package\nDetails.");
    const result = analyzeRepository(root);
    assert.match(result.documentContent["packages/widgets/README.md"], /Widgets package/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("warns about a documentation file skipped for exceeding maxSourceBytes", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "README.md"), "x".repeat(200));
    const { loadConfig } = await import("../src/config.mjs");
    const config = { ...loadConfig(root), maxSourceBytes: 50 };
    const result = analyzeRepository(root, { config });
    assert.equal(result.documentContent["README.md"], undefined);
    assert.ok(result.warnings.some((warning) => warning.includes("README.md") && warning.includes("maxSourceBytes")));
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

test("treats a malformed package.json as absent instead of throwing", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "package.json"), "{ not valid json");
    const result = analyzeRepository(root);
    assert.equal(result.package, null);
    // Falls back to the directory name once package.json cannot be parsed.
    assert.equal(result.name, result.root.split(/[\\/]/).pop());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skips a documentation file whose stat cannot be read instead of aborting", async (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip("cannot exercise EACCES while running as root");
    return;
  }
  const root = await fixture();
  try {
    await mkdir(join(root, "restricted"), { recursive: true });
    await writeFile(join(root, "restricted", "README.md"), "# Unreachable");
    // Read permission without execute (search) permission lets readdirSync
    // list the entry but makes lstatSync on the entry fail with EACCES,
    // exercising the defensive catch around the per-doc lstat.
    chmodSync(join(root, "restricted"), 0o444);
    try {
      const config = { ...defaultConfig, includeDocs: [...defaultConfig.includeDocs, "restricted"] };
      const result = analyzeRepository(root, { config });
      assert.equal(result.documentContent["restricted/README.md"], undefined);
    } finally {
      chmodSync(join(root, "restricted"), 0o755);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
