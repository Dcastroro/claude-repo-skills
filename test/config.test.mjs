import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultConfig, loadConfig } from "../src/config.mjs";

test("rejects output paths outside the target repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ output: "../outside" }));
    assert.throws(() => loadConfig(root), /must stay inside/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default excludes cover common non-JS build and cache directories", () => {
  for (const name of ["target", ".venv", "venv", "__pycache__", ".gradle", "out", ".turbo"]) {
    assert.ok(defaultConfig.exclude.includes(name), `expected exclude to contain ${name}`);
  }
});

test("wraps a malformed config JSON parse error with the config file path", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    const path = join(root, ".claude-repo-skills.json");
    await writeFile(path, "{ not valid json");
    assert.throws(() => loadConfig(root), (error) => error.message.includes(path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects includeDocs that is not an array of strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ includeDocs: "README.md" }));
    assert.throws(() => loadConfig(root), /includeDocs must be an array of strings/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects exclude entries that are not strings", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ exclude: ["node_modules", 5] }));
    assert.throws(() => loadConfig(root), /exclude must be an array of strings/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a non-string output", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ output: 5 }));
    assert.throws(() => loadConfig(root), /output must be a string/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wraps a config file read error with the config file path", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    // A directory in place of the config file makes existsSync succeed but
    // readFileSync fail with EISDIR, exercising the read-error wrapper.
    const path = join(root, ".claude-repo-skills.json");
    await mkdir(path);
    assert.throws(() => loadConfig(root), (error) => error.message.includes(`Failed to read config file at ${path}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an includeDocs array that contains a non-string entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    // A valid array whose contents fail the `.some()` type check, unlike the
    // "not an array at all" case already covered above.
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ includeDocs: ["README.md", 5] }));
    assert.throws(() => loadConfig(root), /includeDocs must be an array of strings/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects skills that are not in the supported set", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ skills: ["development", "bogus"] }));
    assert.throws(() => loadConfig(root), /skills must contain only development, domain, or quality/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a maxSourceBytes that is not a positive integer", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ maxSourceBytes: 0 }));
    assert.throws(() => loadConfig(root), /maxSourceBytes must be a positive integer/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--config style explicit path is resolved against the current working directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "claude-repo-skills-cwd-"));
  const targetRoot = await mkdtemp(join(tmpdir(), "claude-repo-skills-target-"));
  const originalCwd = process.cwd();
  try {
    await writeFile(join(cwd, "custom.json"), JSON.stringify({ maxSourceBytes: 999 }));
    process.chdir(cwd);
    const config = loadConfig(targetRoot, "custom.json");
    assert.equal(config.maxSourceBytes, 999);
  } finally {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});
