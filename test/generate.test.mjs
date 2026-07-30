import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeRepository } from "../src/analyze.mjs";
import { checkSkills, generateSkills } from "../src/generate.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "claude-repo-skills-gen-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "generated-app",
    scripts: { lint: "eslint .", test: "node --test" },
  }));
  await writeFile(join(root, "README.md"), "# Product\nA safe example.");
  await writeFile(join(root, "src/index.js"), "export {};");
  return root;
}

test("generates deterministic skills and check detects drift", async () => {
  const root = await fixture();
  try {
    let analysis = analyzeRepository(root);
    const first = await generateSkills(analysis);
    assert.equal(first.written.length, 9);
    assert.deepEqual(checkSkills(analysis).stale, []);
    analysis = analyzeRepository(root);
    assert.deepEqual(checkSkills(analysis).stale, []);

    const skill = join(root, ".claude/skills/repo-development/SKILL.md");
    const original = await readFile(skill, "utf8");
    await writeFile(skill, original.replace("Repository development", "Drifted"));
    assert.deepEqual(checkSkills(analysis).stale, [".claude/skills/repo-development/SKILL.md"]);

    const repaired = await generateSkills(analysis);
    assert.deepEqual(repaired.written, [".claude/skills/repo-development/SKILL.md"]);

    await writeFile(join(root, "README.md"), "# Product\nUpdated context.");
    analysis = analyzeRepository(root);
    const refreshed = await generateSkills(analysis);
    assert.equal(refreshed.written.length, 3);
    assert.deepEqual(checkSkills(analysis).stale, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses to overwrite a manual skill", async () => {
  const root = await fixture();
  try {
    const path = join(root, ".claude/skills/repo-development/SKILL.md");
    await mkdir(join(root, ".claude/skills/repo-development"), { recursive: true });
    await writeFile(path, "# Manual skill\n");
    await assert.rejects(() => generateSkills(analyzeRepository(root)), /Refusing to overwrite manual/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
