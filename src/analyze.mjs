import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { readBounded, walkFiles } from "./fs-safe.mjs";

const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"];
const DOC_NAMES = new Set(["AGENTS.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md", "SECURITY.md"]);

function packageManager(root) {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  if (existsSync(join(root, "uv.lock"))) return "uv";
  if (existsSync(join(root, "poetry.lock"))) return "poetry";
  return null;
}

function languageCounts(paths) {
  const names = new Map([
    [".ts", "TypeScript"], [".tsx", "TypeScript"], [".js", "JavaScript"],
    [".jsx", "JavaScript"], [".py", "Python"], [".rs", "Rust"], [".go", "Go"],
    [".java", "Java"], [".kt", "Kotlin"], [".rb", "Ruby"], [".php", "PHP"],
  ]);
  const counts = {};
  for (const path of paths) {
    const language = names.get(extname(path));
    if (language) counts[language] = (counts[language] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function readPackage(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      name: value.name,
      version: value.version,
      scripts: value.scripts ?? {},
      dependencies: Object.keys(value.dependencies ?? {}).sort(),
      devDependencies: Object.keys(value.devDependencies ?? {}).sort(),
      engines: value.engines ?? {},
    };
  } catch {
    return null;
  }
}

function isDocumentation(path, config) {
  if (DOC_NAMES.has(path)) return true;
  return config.includeDocs.some((source) => path === source || path.startsWith(`${source}/`));
}

export function analyzeRepository(rootInput = ".", options = {}) {
  const resolvedRoot = resolve(rootInput);
  const config = options.config ?? loadConfig(resolvedRoot, options.configPath);
  const paths = walkFiles(resolvedRoot, config);
  const docs = paths.filter((path) => isDocumentation(path, config));
  const tests = paths.filter((path) => /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./.test(path));
  const source = paths.filter((path) => /^(?:src|app|lib|packages|cmd|internal)\//.test(path));
  const modules = [...new Set(source.map((path) => path.split("/").slice(0, 3).join("/")))].slice(0, 80);
  const documentContent = {};
  for (const path of docs) {
    const content = readBounded(join(resolvedRoot, path), config.maxSourceBytes);
    if (content) documentContent[path] = content.trim();
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({ paths, documentContent }))
    .digest("hex")
    .slice(0, 12);

  return {
    root: resolvedRoot,
    name: readPackage(resolvedRoot)?.name ?? basename(resolvedRoot),
    digest,
    packageManager: packageManager(resolvedRoot),
    manifests: MANIFESTS.filter((name) => paths.includes(name)),
    package: readPackage(resolvedRoot),
    languages: languageCounts(paths),
    modules,
    tests,
    docs,
    documentContent,
    config,
  };
}
