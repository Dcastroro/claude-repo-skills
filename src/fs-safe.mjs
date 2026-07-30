import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export function walkFiles(root, config) {
  const output = [];
  const excluded = new Set(config.exclude);
  const generatedRoot = config.output.replaceAll("\\", "/").replace(/\/+$/, "");

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const repositoryPath = relative(root, absolute).replaceAll("\\", "/");
      if (repositoryPath === generatedRoot || repositoryPath.startsWith(`${generatedRoot}/`)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(relative(root, absolute));
    }
  }

  visit(root);
  return output.sort();
}

export function readBounded(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return "";
  return readFileSync(path, "utf8");
}
