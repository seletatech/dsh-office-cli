# dsh-office-cli

[中文](README.zh-CN.md) | English

A secure DeepSeek Harness plugin that exposes the official WeCom, DingTalk, and Feishu/Lark office CLIs through one native DSH tool.

This is an outbound office-capability plugin, not another chat-to-agent bridge. It lets a DSH agent work with messages, contacts, docs, sheets, calendars, meetings, tasks, approvals, mail, and other vendor-supported services while the official CLIs continue to own authentication, API discovery, and compatibility.

> Tested with DSH SDK `0.1.0-rc.7` and `0.2.2-alpha.2`. The latter requires a Node version supported by that DSH runtime (tested with Node `24.22.2`). No DSH core patch or version exemption is required for these tested versions. Other preview versions are not covered by this compatibility claim.

## Included

- `office_cli`: shell-free argv execution across `wecom`, `dingtalk`, and `feishu`.
- `office_cli_doctor`: version-only availability checks with no credential reads.
- `dsh-office`: terminal-side doctor and interactive auth helper.
- A bundled DSH Skill for progressive schema discovery and dry-run-first mutations.
- Default blocking for auth/config/upgrade/listener commands, credential arguments, raw API mode, and workspace-escaping paths.
- DSH one-time approval for writes, destructive operations, and unknown commands.

Use the tool's `dry_run: true` field for previews. The plugin inserts the vendor flag before value-taking options; message text that resembles a flag never counts as help or preview. Conflicting preview flags and `--` are rejected for previews. Raw CLI `--dry-run` arguments alone do not bypass write approval.

| Platform | Official CLI | Auth |
|---|---|---|
| WeCom | [`@wecom/cli`](https://github.com/WecomTeam/wecom-cli) | `wecom-cli auth init` |
| DingTalk | [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) | `dws auth login` |
| Feishu/Lark | [`lark-cli`](https://github.com/larksuite/cli) | `lark-cli config init && lark-cli auth login --recommend` |

## Install

Requires Node.js `>=22.19` and DeepSeek Harness.

```bash
dsh plugin --profile web add github:meliwanx/dsh-office-cli
dsh plugin --profile web exec dsh-office install
dsh plugin --profile web exec dsh-office doctor
dsh --profile web --dump-config
dsh --profile web
```

The plugin package has no install script. The explicit second command installs pinned official CLI versions under `$DSH_HOME/office-cli`, shared by all DSH profiles and isolated from global npm.

```bash
# Install only one platform when preferred
dsh plugin --profile web exec dsh-office install wecom
dsh plugin --profile web exec dsh-office install dingtalk
dsh plugin --profile web exec dsh-office install feishu
```

Alternatively, install the official CLIs on PATH or as adjacent profile dependencies. Resolution order is explicit plugin config, `$DSH_OFFICE_HOME`/`$DSH_HOME/office-cli`, an adjacent npm package, then PATH.

For local development:

```bash
npm install
npm run check
dsh plugin --profile web add .
dsh plugin --profile web exec dsh-office install
```

## Authenticate and diagnose

Credentials stay in each vendor CLI's own keychain or encrypted store. The model-facing tool never accepts auth commands or secret-bearing flags.

```bash
dsh plugin --profile web exec dsh-office doctor
dsh plugin --profile web exec dsh-office install
dsh plugin --profile web exec dsh-office auth wecom
dsh plugin --profile web exec dsh-office auth dingtalk
dsh plugin --profile web exec dsh-office auth feishu
```

## Configuration

Override the bundle row in the profile's `cordis.patch.yml` and restate its complete config:

```yaml
- id: dsh-office-cli
  config:
    approval: writes       # writes | all | off
    timeoutMs: 120000
    killGraceMs: 2000
    maxOutputBytes: 262144
    maxArgs: 128
    maxArgLength: 65536
    allowRawApi: false
    workspaceFilesOnly: true
    # wecomCommand: /opt/bin/wecom-cli
    # dingtalkCommand: /opt/bin/dws
    # feishuCommand: /opt/bin/lark-cli
```

`workspaceFilesOnly` is argument-level defense, not an OS sandbox. Use a dedicated container/account and least-privilege vendor apps for high-security deployments. See [SECURITY.md](SECURITY.md).

## Scope

Version 0.1 focuses on **DSH → office platform** operations. Inbound chat channels require long-lived connections, durable chat/session mapping, replay protection, remote approvals, and media streaming. They belong in separate future `channel-*` plugins sharing the adapter model rather than in the foreground CLI tool.

See the [architecture](docs/architecture.md) and [GitHub ecosystem research](docs/research.md) for the design rationale.

## Development

```bash
npm install
npm run check
npm run pack:check
```

Licensed under [MIT](LICENSE). CLIs fetched by the setup helper remain independent software under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
