# Architecture

`dsh-office-cli` is a thin, security-aware DSH layer over three official vendor CLIs. It owns the DSH tool contract, process adapters, shared policy, approvals, and Agent guidance. Vendor CLIs retain business commands, schema discovery, OAuth, token refresh, transport, and API compatibility.

```text
intent → bundled Skill → office_cli → argv policy → DSH approval
       → adapter resolution → shell-free bounded process → official CLI → vendor API
```

## Policy order

1. Validate argv count, length, type, and NUL exclusion.
2. Block auth, config, install, upgrade, skill, server/MCP, and long-running listener surfaces.
3. Block secret-bearing flags and environment-style assignments because DSH persists tool arguments.
4. Reject obvious paths escaping the session workspace by default.
5. Block raw API mode unless explicitly enabled.
6. Treat dry-run as read-only.
7. Classify destructive verbs, write verbs, then read verbs; unknown commands conservatively classify as writes.

With the default `approval: writes`, writes, destructive operations, and unknown commands use DSH's `tools/pre-execute` approval path. A missing answerer fails closed.

## Process boundary

Commands run with Node `spawn`, `shell: false`, ignored stdin, bounded stdout/stderr, a timeout, and abort propagation. Unix runs use a separate process group so terminating an npm JavaScript launcher also terminates its native CLI child.

This process boundary is not an OS sandbox. `workspaceFilesOnly` rejects obvious absolute and traversal paths, but a vendor command may introduce a new indirect file syntax. High-security deployments should run DSH in a dedicated container/account and grant vendor apps least privilege.

## Resolution

Each executable resolves in this order:

1. explicit `*Command` config;
2. the managed `$DSH_OFFICE_HOME` or `$DSH_HOME/office-cli` installation;
3. a separately installed adjacent npm package;
4. the normal PATH name.

`dsh-office install` uses versions pinned in the adapters. The explicit user-side setup keeps vendor install scripts out of `dsh plugin add`. Updating a pin should include policy and smoke validation.

## Skills

The package ships one routing Skill rather than copying every vendor Skill. It instructs the model to query each official CLI's narrow help/schema surface, dry-run mutations, and verify exit codes. New vendor commands therefore become discoverable without expanding every model request or waiting for this project to republish copied docs.

## Future inbound channels

Inbound office chat is intentionally separate. A production channel needs durable chat-to-session routing, allowlists, replay protection, reconnect/outbox logic, media handling, streaming cards, remote approval/questions, and concurrency controls. Future `channel-*` bundles can reuse adapter and setup concepts without destabilizing the foreground tool.
