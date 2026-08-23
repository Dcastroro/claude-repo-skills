import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export function walkFiles(root, config) {
  const output = [];
  const excluded = new Set(config.exclude);
  const generatedRoot = config.output.replaceAll("\\", "/").replace(/\/+$/, "");

  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      // Directories we cannot read (permission-restricted subtrees, races
      // with something deleting the directory, etc.) are skipped instead of
      // aborting the whole analysis.
      if (error && (error.code === "EACCES" || error.code === "EPERM" || error.code === "ENOENT")) return;
      throw error;
    }
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const repositoryPath = relative(root, absolute).replaceAll("\\", "/");
      if (repositoryPath === generatedRoot || repositoryPath.startsWith(`${generatedRoot}/`)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(relative(root, absolute).replaceAll("\\", "/"));
    }
  }

  visit(root);
  return output.sort();
}

export function readBounded(path, maxBytes) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return "";
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw error;
  }
}
