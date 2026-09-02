import assert from "node:assert/strict";
import { chmodSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultConfig } from "../src/config.mjs";
import { readBounded, walkFiles } from "../src/fs-safe.mjs";

async function tmp(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

test("walkFiles returns repository-relative paths using forward slashes", async () => {
  const root = await tmp("claude-repo-skills-fs-");
  try {
    await mkdir(join(root, "nested", "deeper"), { recursive: true });
    await writeFile(join(root, "nested", "deeper", "file.txt"), "content");
    const paths = walkFiles(root, defaultConfig);
    assert.deepEqual(paths, ["nested/deeper/file.txt"]);
    for (const path of paths) assert.equal(path.includes("\\"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("walkFiles skips directories it cannot read instead of aborting", async (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip("cannot exercise EACCES while running as root");
    return;
  }
  const root = await tmp("claude-repo-skills-fs-eacces-");
  try {
    await mkdir(join(root, "locked"), { recursive: true });
    await writeFile(join(root, "locked", "secret.txt"), "secret");
    await writeFile(join(root, "visible.txt"), "ok");
    chmodSync(join(root, "locked"), 0o000);
    try {
      const paths = walkFiles(root, defaultConfig);
      assert.deepEqual(paths, ["visible.txt"]);
    } finally {
      chmodSync(join(root, "locked"), 0o755);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("walkFiles does not descend into excluded directory names", async () => {
  const root = await tmp("claude-repo-skills-fs-exclude-");
  try {
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "node_modules", "pkg", "index.js"), "export {};");
    await writeFile(join(root, "kept.js"), "export {};");
    const paths = walkFiles(root, defaultConfig);
    assert.deepEqual(paths, ["kept.js"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readBounded returns file content within the byte limit", async () => {
  const root = await tmp("claude-repo-skills-fs-read-");
  try {
    const path = join(root, "doc.md");
    await writeFile(path, "hello world");
    assert.equal(readBounded(path, 128_000), "hello world");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readBounded returns empty string when the file exceeds maxBytes", async () => {
  const root = await tmp("claude-repo-skills-fs-toobig-");
  try {
    const path = join(root, "doc.md");
    await writeFile(path, "x".repeat(50));
    assert.equal(readBounded(path, 10), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readBounded returns empty string for a symlink to a file", async () => {
  const root = await tmp("claude-repo-skills-fs-symlink-");
  try {
    const target = join(root, "real.md");
    await writeFile(target, "real content");
    const link = join(root, "link.md");
    await symlink(target, link);
    assert.equal(readBounded(link, 128_000), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readBounded returns empty string when the file no longer exists (ENOENT)", async () => {
  const root = await tmp("claude-repo-skills-fs-missing-");
  try {
    const path = join(root, "gone.md");
    assert.equal(readBounded(path, 128_000), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readBounded rethrows non-ENOENT errors raised while reading the file", async (t) => {
  if (process.getuid && process.getuid() === 0) {
    t.skip("cannot exercise EACCES while running as root");
    return;
  }
  const root = await tmp("claude-repo-skills-fs-unreadable-");
  try {
    const path = join(root, "secret.md");
    await writeFile(path, "top secret");
    // lstatSync succeeds (it does not require read permission on the file
    // itself) but the subsequent readFileSync fails with EACCES, exercising
    // the second try/catch's non-ENOENT rethrow path.
    chmodSync(path, 0o000);
    try {
      assert.throws(() => readBounded(path, 128_000), (error) => error.code === "EACCES");
    } finally {
      chmodSync(path, 0o644);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
