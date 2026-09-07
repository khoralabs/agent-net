# Releasing `@khoralabs/agent-net-cli`

## npm release

1. Run GitHub Actions workflow **Release CLI** with the desired semver.
2. That workflow bumps `packages/cli/package.json`, publishes to npm, and does **not** require `SKILLS_REPO_TOKEN`.

## Skills catalog (separate, non-blocking)

After a successful CLI release (or whenever skill content should sync):

1. Run workflow **Publish agent-net-cli skills** with the same `version` (and optional `ref`/`sha`).
2. Requires `SKILLS_REPO_TOKEN` with push access to [`khoralabs/skills`](https://github.com/khoralabs/skills).
3. Destination: `skills/agent-net-cli/` (catalog layout for `bunx skills add khoralabs/skills`).

Install from the catalog:

```bash
bunx skills add khoralabs/skills --skill agent-net-cli -y
```

Local / version-matched install from the package:

```bash
agent-net skills install -y
```
