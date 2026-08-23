# Claude Repo Skills

Generate concise, repository-aware Claude Code skills from the structure and
documentation that already exist in a project.

The CLI discovers manifests, languages, modules, package scripts, tests,
`AGENTS.md`, `CLAUDE.md`, repository rules and product documentation. It then
creates three progressively disclosed skills under `.claude/skills`:

- `repo-development`: architecture, modules, stack and implementation workflow.
- `repo-domain`: product vocabulary, invariants, privacy and compliance context.
- `repo-quality`: real validation commands, test inventory and release gates.

Generated files contain a marker. Existing manual skills without that marker
are never overwritten.

## Requirements

- Node.js 20 or newer.
- No runtime dependencies.

## Usage

Run directly from a checkout:

```bash
node bin/claude-repo-skills.mjs inspect /path/to/repository
node bin/claude-repo-skills.mjs generate /path/to/repository
node bin/claude-repo-skills.mjs check /path/to/repository
```

After publishing the package:

```bash
npx claude-repo-skills inspect .
npx claude-repo-skills generate .
npx claude-repo-skills check .
```

Create a configuration file:

```bash
npx claude-repo-skills init .
```

Use `--dry-run` to inspect the planned output and `--json` for CI or other
automation.

`--config <path>` is resolved against the current working directory (not the
target repository) so a relative path behaves the way it would for any other
CLI flag, e.g. `npx claude-repo-skills check /path/to/repository --config
./ci/repo-skills.json`. Omit `--config` to use `.claude-repo-skills.json`
inside the target repository itself.

## Configuration

`.claude-repo-skills.json` supports:

| Field | Purpose |
| --- | --- |
| `output` | Generated skill directory. Defaults to `.claude/skills`. |
| `includeDocs` | Files and directories used as repository knowledge. |
| `exclude` | Directory names that the scanner never traverses. |
| `maxSourceBytes` | Maximum size of an individual documentation source. |
| `skills` | Any of `development`, `domain`, and `quality`. |

See `.claude-repo-skills.example.json` for a complete example.

## CI

Commit generated skills, then detect drift:

```yaml
- run: npx claude-repo-skills check .
```

Regenerate after architecture, documentation, scripts or module layout changes.

## Security model

- Symbolic links are not traversed or read.
- Build outputs, dependencies, VCS metadata and configured paths are excluded.
- Documentation reads are size-bounded.
- Manual skill files are not overwritten.
- No source code or repository content leaves the machine.

## Development

```bash
npm install
npm run check
```
