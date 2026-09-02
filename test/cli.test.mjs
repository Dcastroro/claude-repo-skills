import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse, runCli } from "../src/cli.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-cli-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "cli-fixture",
    scripts: { test: "node --test" },
  }));
  await writeFile(join(root, "README.md"), "# Product\nExample.");
  await writeFile(join(root, "src/index.js"), "export {};");
  return root;
}

async function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(chunk.toString());
    return true;
  };
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await fn();
    return { output: chunks.join(""), exitCode: process.exitCode };
  } finally {
    process.stdout.write = original;
    process.exitCode = originalExitCode;
  }
}

// --- argument parser ---

test("parse defaults to help with no arguments", () => {
  assert.equal(parse([]).command, "help");
});

test("parse short-circuits on a leading --help", () => {
  assert.deepEqual(parse(["--help", "ignored"]), { command: "help" });
});

test("parse rejects unknown options", () => {
  assert.throws(() => parse(["inspect", "--nope"]), /Unknown option: --nope/);
});

test("parse keeps the last of two positional repository arguments", () => {
  const args = parse(["inspect", "/first", "/second"]);
  assert.equal(args.root, "/second");
});

test("parse recognizes --json and --dry-run regardless of order", () => {
  assert.deepEqual(parse(["generate", ".", "--json", "--dry-run"]), {
    command: "generate",
    root: process.cwd(),
    configPath: undefined,
    dryRun: true,
    json: true,
  });
  assert.deepEqual(parse(["generate", "--dry-run", "--json", "."]), {
    command: "generate",
    root: process.cwd(),
    configPath: undefined,
    dryRun: true,
    json: true,
  });
});

test("parse captures --config path", () => {
  const args = parse(["check", ".", "--config", "custom.json"]);
  assert.equal(args.configPath, "custom.json");
});

test("parse resolves --version combined with --json", () => {
  assert.deepEqual(parse(["inspect", "--version", "--json"]), {
    command: "version",
    root: process.cwd(),
    configPath: undefined,
    dryRun: false,
    json: true,
  });
});

test("parse recognizes -v as a leading command shorthand for --version", () => {
  assert.equal(parse(["-v"]).command, "version");
});

test("parse recognizes -v as an option shorthand for --version", () => {
  assert.equal(parse(["inspect", "-v"]).command, "version");
});

test("parse recognizes --help appearing after the command, not just as the first token", () => {
  assert.deepEqual(parse(["inspect", "--help"]), { command: "help" });
});

// --- commands ---

test("init creates a config file and refuses to overwrite it", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-cli-init-"));
  try {
    const { output } = await captureStdout(() => runCli(["init", root]));
    assert.match(output, /Created/);
    const configPath = join(root, ".claude-repo-skills.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.output, ".claude/skills");
    await assert.rejects(() => runCli(["init", root]), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init --json emits JSON with the created path", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-cli-init-json-"));
  try {
    const { output } = await captureStdout(() => runCli(["init", root, "--json"]));
    const parsed = JSON.parse(output);
    assert.equal(parsed.created, join(root, ".claude-repo-skills.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspect prints a human-readable summary", async () => {
  const root = await fixture();
  try {
    const { output, exitCode } = await captureStdout(() => runCli(["inspect", root]));
    assert.match(output, /Repository: cli-fixture/);
    assert.match(output, /Digest: [0-9a-f]{12}/);
    assert.equal(exitCode, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspect --json emits parseable JSON", async () => {
  const root = await fixture();
  try {
    const { output } = await captureStdout(() => runCli(["inspect", root, "--json"]));
    const parsed = JSON.parse(output);
    assert.equal(parsed.name, "cli-fixture");
    assert.equal(parsed.documentContent, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inspect prints skipped-documentation warnings in human-readable mode", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "README.md"), "x".repeat(200));
    await writeFile(join(root, ".claude-repo-skills.json"), JSON.stringify({ maxSourceBytes: 50 }));
    const { output } = await captureStdout(() => runCli(["inspect", root]));
    assert.match(output, /Warnings:/);
    assert.match(output, /README\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generate --json emits JSON with the generated file list", async () => {
  const root = await fixture();
  try {
    const { output } = await captureStdout(() => runCli(["generate", root, "--json"]));
    const parsed = JSON.parse(output);
    assert.equal(parsed.written.length, 9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --json emits JSON when generated skills are current", async () => {
  const root = await fixture();
  try {
    await captureStdout(() => runCli(["generate", root]));
    const { output, exitCode } = await captureStdout(() => runCli(["check", root, "--json"]));
    const parsed = JSON.parse(output);
    assert.deepEqual(parsed.stale, []);
    assert.equal(exitCode, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check --json emits JSON when generated skills are missing", async () => {
  const root = await fixture();
  try {
    const { output, exitCode } = await captureStdout(() => runCli(["check", root, "--json"]));
    const parsed = JSON.parse(output);
    assert.ok(parsed.stale.length > 0);
    assert.equal(exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generate writes skill files and check then reports success", async () => {
  const root = await fixture();
  try {
    const { output: generateOutput } = await captureStdout(() => runCli(["generate", root]));
    assert.match(generateOutput, /Generated 9 files; 9 written\./);

    const { output: checkOutput, exitCode } = await captureStdout(() => runCli(["check", root]));
    assert.match(checkOutput, /Generated skills are current/);
    assert.equal(exitCode, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generate --dry-run reports planned files without writing them", async () => {
  const root = await fixture();
  try {
    const { output } = await captureStdout(() => runCli(["generate", root, "--dry-run"]));
    assert.match(output, /Would generate 9 files; 0 written\./);
    const { exitCode } = await captureStdout(() => runCli(["check", root]));
    assert.equal(exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check exits with code 1 and reports missing skills before generation", async () => {
  const root = await fixture();
  try {
    const { output, exitCode } = await captureStdout(() => runCli(["check", root]));
    assert.match(output, /Missing generated skills/);
    assert.equal(exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check exits with code 1 and reports stale skills after drift", async () => {
  const root = await fixture();
  try {
    await captureStdout(() => runCli(["generate", root]));
    const skillPath = join(root, ".claude/skills/repo-development/SKILL.md");
    const original = await readFile(skillPath, "utf8");
    await writeFile(skillPath, original.replace("Repository development", "Drifted"));

    const { output, exitCode } = await captureStdout(() => runCli(["check", root]));
    assert.match(output, /Stale generated skills/);
    assert.equal(exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--version prints the package.json version", async () => {
  const { output } = await captureStdout(() => runCli(["--version"]));
  assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
});

test("--version --json emits a JSON object", async () => {
  const { output } = await captureStdout(() => runCli(["--version", "--json"]));
  const parsed = JSON.parse(output);
  assert.match(parsed.version, /^\d+\.\d+\.\d+$/);
});

test("unknown command throws", async () => {
  await assert.rejects(() => runCli(["frobnicate"]), /Unknown command: frobnicate/);
});
