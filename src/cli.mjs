import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepository } from "./analyze.mjs";
import { defaultConfig } from "./config.mjs";
import { checkSkills, generateSkills } from "./generate.mjs";

const PACKAGE_JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");

const HELP = `claude-repo-skills <command> [repository] [options]

Commands:
  init       Create .claude-repo-skills.json
  inspect    Print the detected repository model
  generate   Generate repository-aware skills
  check      Fail when generated skills are missing or stale

Options:
  --config <path>   Use a custom configuration file (resolved against the
                     current working directory, not the target repository)
  --dry-run         Show generated files without writing
  --json            Emit machine-readable JSON
  --version         Show the CLI version
  --help            Show this help
`;

export function parse(argv) {
  const values = [...argv];
  const command = values.shift() ?? "help";
  if (command === "--help" || command === "-h") return { command: "help" };
  let resolvedCommand = command === "--version" || command === "-v" ? "version" : command;
  let root = ".";
  let configPath;
  let dryRun = false;
  let json = false;
  while (values.length) {
    const value = values.shift();
    if (value === "--config") configPath = values.shift();
    else if (value === "--dry-run") dryRun = true;
    else if (value === "--json") json = true;
    else if (value === "--help") return { command: "help" };
    else if (value === "--version" || value === "-v") resolvedCommand = "version";
    else if (!value.startsWith("-")) root = value;
    else throw new Error(`Unknown option: ${value}`);
  }
  return { command: resolvedCommand, root: resolve(root), configPath, dryRun, json };
}

function print(value, json) {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${value}\n`);
}

export async function runCli(argv) {
  const args = parse(argv);
  if (args.command === "help") return print(HELP, false);
  if (args.command === "version") {
    const { version } = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
    return print(args.json ? { version } : version, args.json);
  }
  if (!["init", "inspect", "generate", "check"].includes(args.command)) throw new Error(`Unknown command: ${args.command}`);

  if (args.command === "init") {
    const path = resolve(args.root, ".claude-repo-skills.json");
    if (existsSync(path)) throw new Error(".claude-repo-skills.json already exists");
    writeFileSync(path, `${JSON.stringify(defaultConfig, null, 2)}\n`, { flag: "wx" });
    return print(args.json ? { created: path } : `Created ${path}`, args.json);
  }

  const analysis = analyzeRepository(args.root, { configPath: args.configPath });
  if (args.command === "inspect") {
    const view = { ...analysis, documentContent: undefined, config: undefined };
    return print(args.json ? view : [
      `Repository: ${view.name}`,
      `Digest: ${view.digest}`,
      `Languages: ${Object.keys(view.languages).join(", ") || "unknown"}`,
      `Modules: ${view.modules.length}`,
      `Tests: ${view.tests.length}`,
      `Docs: ${view.docs.length}`,
      ...(view.warnings.length ? [`Warnings:\n${view.warnings.map((warning) => `- ${warning}`).join("\n")}`] : []),
    ].join("\n"), args.json);
  }

  if (args.command === "generate") {
    const result = await generateSkills(analysis, { dryRun: args.dryRun });
    return print(args.json ? result : `${args.dryRun ? "Would generate" : "Generated"} ${result.files.length} files; ${result.written.length} written.`, args.json);
  }

  const result = checkSkills(analysis);
  if (result.stale.length) {
    const label = result.missing.length === result.stale.length ? "Missing generated skills" : "Stale generated skills";
    print(args.json ? result : `${label}:\n${result.stale.map((path) => `- ${path}`).join("\n")}`, args.json);
    process.exitCode = 1;
    return;
  }
  print(args.json ? result : `Generated skills are current (${result.files.length} files).`, args.json);
}
