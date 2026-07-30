import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeRepository } from "./analyze.mjs";
import { defaultConfig } from "./config.mjs";
import { checkSkills, generateSkills } from "./generate.mjs";

const HELP = `claude-repo-skills <command> [repository] [options]

Commands:
  init       Create .claude-repo-skills.json
  inspect    Print the detected repository model
  generate   Generate repository-aware skills
  check      Fail when generated skills are missing or stale

Options:
  --config <path>   Use a custom configuration file
  --dry-run         Show generated files without writing
  --json            Emit machine-readable JSON
  --help            Show this help
`;

function parse(argv) {
  const values = [...argv];
  const command = values.shift() ?? "help";
  if (command === "--help" || command === "-h") return { command: "help" };
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
    else if (!value.startsWith("-")) root = value;
    else throw new Error(`Unknown option: ${value}`);
  }
  return { command, root: resolve(root), configPath, dryRun, json };
}

function print(value, json) {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${value}\n`);
}

export async function runCli(argv) {
  const args = parse(argv);
  if (args.command === "help") return print(HELP, false);
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
    ].join("\n"), args.json);
  }

  if (args.command === "generate") {
    const result = await generateSkills(analysis, { dryRun: args.dryRun });
    return print(args.json ? result : `${args.dryRun ? "Would generate" : "Generated"} ${result.files.length} files; ${result.written.length} written.`, args.json);
  }

  const result = checkSkills(analysis);
  if (result.stale.length) {
    print(args.json ? result : `Stale generated skills:\n${result.stale.map((path) => `- ${path}`).join("\n")}`, args.json);
    process.exitCode = 1;
    return;
  }
  print(args.json ? result : `Generated skills are current (${result.files.length} files).`, args.json);
}
