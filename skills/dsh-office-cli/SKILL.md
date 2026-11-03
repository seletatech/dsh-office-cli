---
name: dsh-office-cli
description: Operate enterprise WeCom, DingTalk, and Feishu/Lark through their official CLIs from DeepSeek Harness. Use for office messages, contacts, documents, sheets, calendars, meetings, tasks, approvals, mail, and related workspace operations.
---

# DSH Office CLI

Use the `office_cli` tool for official 企业微信 / WeCom, 钉钉 / DingTalk, and 飞书 / Lark workspace operations. Use `office_cli_doctor` when availability is unknown or a command cannot start.

A cloud host may configure a trusted execution service with a smaller capability set. Inspect its help, follow its authorization instructions, and report unsupported operations. Native approval does not expand that service's permissions. Do not bypass a service failure by using a local CLI or another account.

## Platform mapping

| User intent | `platform` | Native executable |
|---|---|---|
| 企业微信、企微、WeCom | `wecom` | `wecom-cli` |
| 钉钉、DingTalk | `dingtalk` | `dws` |
| 飞书、Lark | `feishu` | `lark-cli` |

Pass only native arguments in `args`; never include the executable or shell quoting. For example, represent `lark-cli calendar +agenda` as `{"platform":"feishu","args":["calendar","+agenda"]}`.

## Required workflow

1. When the exact command is uncertain, inspect the smallest useful help or schema surface first.
2. For any create, update, send, approve, upload, delete, or other mutation, call the same command with `dry_run: true` first.
3. Read the dry-run output and correct parameters before making the real call with `dry_run: false` or omitted.
4. State the concrete purpose. Non-dry-run writes ask the user for one-time approval by default.
5. Check `exitCode`; on failure, use `stderr` and vendor schema/help to correct the call. Do not claim success from a non-zero exit.

## Discovery commands

- WeCom: `args: ["schema", "list"]`; inspect one method with `["schema", "get", "service.resource.method"]`; service and method `--doc` / `--schema` are also available.
- DingTalk: inspect a product with `["schema", "aitable", "--compact"]` or one leaf with `["schema", "aitable record query", "--compact"]`.
- Feishu/Lark: use `["<service>", "--help"]`, then `["<service>", "<subcommand>", "--help"]`. Prefer `+` shortcuts where the official CLI provides them.

Keep discovery narrow. Do not dump every schema unless the user explicitly needs a complete audit.

## Security rules

- Never pass secrets, tokens, passwords, app secrets, or client secrets as tool arguments; DSH persists tool calls in the session log.
- Authentication, config initialization, upgrades, skill installation, servers, MCP mode, and event listeners are intentionally unavailable through `office_cli`. Ask the user to run `dsh-office auth <platform>` in their terminal.
- Raw `api` commands are disabled by default. Prefer curated helpers and schema-generated commands.
- Use workspace-relative paths for upload/download operations. Paths outside the session workspace are rejected by default.
- Do not work around a denial by invoking the vendor CLI through `bash`.

## Setup hints

If doctor reports a missing CLI, show the exact `install` and `auth` commands from its result. Installation and browser/QR authorization belong to the user terminal, not a model tool call.
