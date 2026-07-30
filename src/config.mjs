import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";

export const defaultConfig = Object.freeze({
  output: ".claude/skills",
  includeDocs: ["AGENTS.md", "CLAUDE.md", "README.md", "docs", ".claude/rules"],
  exclude: [".git", "node_modules", ".next", "dist", "build", "coverage", "vendor"],
  maxSourceBytes: 128_000,
  skills: ["development", "domain", "quality"],
});

export function loadConfig(root, explicitPath) {
  const path = resolve(root, explicitPath ?? ".claude-repo-skills.json");
  if (!existsSync(path)) return { ...defaultConfig };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const config = {
    ...defaultConfig,
    ...parsed,
    includeDocs: parsed.includeDocs ?? defaultConfig.includeDocs,
    exclude: parsed.exclude ?? defaultConfig.exclude,
    skills: parsed.skills ?? defaultConfig.skills,
  };
  const output = normalize(config.output);
  if (isAbsolute(output) || output === ".." || output.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("Config output must stay inside the target repository");
  }
  const supported = new Set(["development", "domain", "quality"]);
  if (!Array.isArray(config.skills) || config.skills.some((name) => !supported.has(name))) {
    throw new Error("Config skills must contain only development, domain, or quality");
  }
  if (!Number.isInteger(config.maxSourceBytes) || config.maxSourceBytes < 1) {
    throw new Error("Config maxSourceBytes must be a positive integer");
  }
  return { ...config, output };
}
