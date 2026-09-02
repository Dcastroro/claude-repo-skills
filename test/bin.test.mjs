// True end-to-end coverage for this CLI: spawns the real published
// entrypoint (bin/claude-repo-skills.mjs) as its own OS process, the same
// way a user invokes it, rather than calling internal functions in-process.
// This is the closest equivalent to browser e2e for a Node CLI with no web
// surface: it exercises argv parsing, the bin file's own shebang/import
// wiring, real stdout/stderr streams, and real process exit codes.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const BIN_PATH = fileURLToPath(new URL("../bin/claude-repo-skills.mjs", import.meta.url));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-bin-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "bin-fixture",
    scripts: { test: "node --test" },
  }));
  await writeFile(join(root, "README.md"), "# Product\nExample.");
  await writeFile(join(root, "src/index.js"), "export {};");
  return root;
}

test("bin entrypoint runs `inspect` end-to-end as a real subprocess", async () => {
  const root = await fixture();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [BIN_PATH, "inspect", root]);
    assert.match(stdout, /Repository: bin-fixture/);
    assert.match(stdout, /Digest: [0-9a-f]{12}/);
    assert.equal(stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bin entrypoint writes real files for `generate` and reports success on `check`", async () => {
  const root = await fixture();
  try {
    const generated = await execFileAsync(process.execPath, [BIN_PATH, "generate", root]);
    assert.match(generated.stdout, /Generated 9 files; 9 written\./);

    const checked = await execFileAsync(process.execPath, [BIN_PATH, "check", root]);
    assert.match(checked.stdout, /Generated skills are current/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bin entrypoint reports errors on stderr and exits with code 1", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN_PATH, "frobnicate"]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /claude-repo-skills: Unknown command: frobnicate/);
      return true;
    },
  );
});

test("resolves its own package.json for --version even when invoked from another working directory", async () => {
  const otherCwd = await mkdtemp(join(tmpdir(), "claude-repo-skills-bin-cwd-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [BIN_PATH, "--version"], { cwd: otherCwd });
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  } finally {
    await rm(otherCwd, { recursive: true, force: true });
  }
});

// Sanity check that BIN_PATH actually resolves inside this repository, so a
// future move of bin/ doesn't silently turn these tests into no-ops.
test("BIN_PATH points at the checked-in bin script", () => {
  assert.match(BIN_PATH, /bin[\\/]claude-repo-skills\.mjs$/);
});
