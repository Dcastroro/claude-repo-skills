---
name: generate-repo-skills
description: "Analyze a repository and generate or validate repository-aware Claude Code skills. Use when setting up Claude skills for a project, refreshing generated repository context, or diagnosing stale generated skills."
---

# Generate repository skills

1. Run `claude-repo-skills inspect <repo>` and review the detected model.
2. Add `.claude-repo-skills.json` when defaults need adjustment.
3. Run `claude-repo-skills generate <repo>`.
4. Inspect generated skill descriptions and references.
5. Run `claude-repo-skills check <repo>` in CI.

Do not replace manual skills. Keep generated skill bodies concise and place
detailed repository context in their `references` directories.
