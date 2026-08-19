# Repository guide

`dsh-office-cli` is an external DeepSeek Harness bundle. Keep the package source-only and directly installable from GitHub; do not add a build step unless a published artifact strategy is added at the same time.

## Checks

```bash
npm run typecheck
npm test
npm run pack:check
```

## Design constraints

- Never construct a shell command from model input. Use executable + argv.
- Never accept credentials in model-facing arguments or store vendor credentials.
- Unknown commands remain write-risk and approval-worthy.
- Auth, config, install, upgrade, server/MCP, and long-running listener commands remain outside the model tool.
- The built-in Skill uses progressive vendor help/schema discovery; do not vendor the complete upstream Skill trees.
- Update both English and Chinese documentation for user-visible behavior.
- Preserve the distinction between outbound office operations and future inbound IM channel plugins.
