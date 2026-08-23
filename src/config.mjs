import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";

export const defaultConfig = Object.freeze({
  output: ".claude/skills",
  includeDocs: ["AGENTS.md", "CLAUDE.md", "README.md", "docs", ".claude/rules"],
  exclude: [
    ".git", "node_modules", ".next", "dist", "build", "coverage", "vendor",
    "target", ".venv", "venv", "__pycache__", ".gradle", "out", ".turbo",
  ],
  maxSourceBytes: 128_000,
  skills: ["development", "domain", "quality"],
});

export function loadConfig(root, explicitPath) {
  // An explicit --config path is resolved against the current working
  // directory, matching how a user would type it on the command line. Only
  // the default config file name is looked up inside the target repository.
  const path = explicitPath ? resolve(process.cwd(), explicitPath) : resolve(root, ".claude-repo-skills.json");
  if (!existsSync(path)) return { ...defaultConfig };

  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Failed to read config file at ${path}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse config file at ${path}: ${error.message}`);
  }

  if (parsed.includeDocs !== undefined) {
    if (!Array.isArray(parsed.includeDocs) || parsed.includeDocs.some((value) => typeof value !== "string")) {
      throw new Error(`Config includeDocs must be an array of strings (in ${path})`);
    }
  }
  if (parsed.exclude !== undefined) {
    if (!Array.isArray(parsed.exclude) || parsed.exclude.some((value) => typeof value !== "string")) {
      throw new Error(`Config exclude must be an array of strings (in ${path})`);
    }
  }
  if (parsed.output !== undefined && typeof parsed.output !== "string") {
    throw new Error(`Config output must be a string (in ${path})`);
  }

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
