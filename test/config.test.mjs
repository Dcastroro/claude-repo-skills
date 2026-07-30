import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";

test("rejects output paths outside the target repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-config-"));
  try {
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ output: "../outside" }));
    assert.throws(() => loadConfig(root), /must stay inside/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
