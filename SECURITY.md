# Security policy

## Reporting

Please report vulnerabilities through the repository's GitHub Security Advisory flow. Do not include credentials, access tokens, private chat content, or enterprise data in a public issue.

## Security model

`dsh-office-cli` assumes the DSH host, installed plugin package, vendor CLI binaries, and local credential stores are trusted. Model-generated tool arguments are untrusted.

The plugin:

- passes argv directly to `spawn` with `shell: false`;
- never asks the model for credentials and blocks common secret-bearing flags;
- blocks vendor authentication, config, installer, updater, server/MCP, and listener commands from the model tool;
- blocks raw API mode by default;
- classifies unknown commands as writes and asks for DSH approval by default;
- limits execution time and captured output;
- rejects obvious absolute and traversal paths outside the session workspace;
- ignores subprocess stdin so a model call cannot answer interactive auth prompts.

Vendor credentials remain under each official CLI's keychain or encrypted storage. They are not copied into this package's config or environment template.

## Important limitation

The child process is a host process, not a DSH filesystem or network sandbox. `workspaceFilesOnly` performs argument-level checks; it cannot prove that every future vendor command or indirect reference stays inside the workspace. A compromised vendor binary also has the privileges of the DSH host user.

For sensitive deployments:

- run DSH and the vendor CLIs in a dedicated container or OS account;
- grant the enterprise app only the minimum OpenAPI scopes;
- use a dedicated test tenant before production;
- keep `approval: writes`, `allowRawApi: false`, and `workspaceFilesOnly: true`;
- pin this plugin and vendor CLI versions;
- review dry-run output before approving mutations;
- do not instruct the Agent to bypass a denial with `bash`.

## Persisted data

DSH persists tool names and arguments in its session log. Never place tokens, app secrets, passwords, private keys, or reusable authorization codes in `office_cli.args` or `purpose`. The policy catches common forms but cannot recognize every secret format.
