# GitHub ecosystem research (2026-08-19)

Research covered official repositories, the GitHub `dsh-plugin` topic, and project READMEs. Star counts below are a 2026-08-19 maturity signal, not an endorsement.

## Official foundations

| Project | Snapshot | Finding |
|---|---:|---|
| [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) | 165k stars, `0.1.0-rc.7` | Official plugin-based harness. External bundles use `dsh.bundle` and `cordis.patch.yml`. |
| [`WecomTeam/wecom-cli`](https://github.com/WecomTeam/wecom-cli) | 2.8k stars, `@wecom/cli@1.1.0` | Official Rust CLI with dynamic discovery/schema and broad office coverage. MIT. |
| [`DingTalk-Real-AI/dingtalk-workspace-cli`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) | 2.7k stars, npm `1.0.58` | Officially open-sourced `dws`; Agent schema includes command and safety semantics. Apache-2.0. |
| [`larksuite/cli`](https://github.com/larksuite/cli) | 16.5k stars, `@larksuite/cli@1.0.88` | Official CLI with 200+ commands, 26 Agent Skills, and shortcut/API/raw layers. MIT. |

## Existing DSH integrations

Projects such as [`omdsh-dev/dsh-lark`](https://github.com/omdsh-dev/dsh-lark), [`TtTRz/dsh-wecom`](https://github.com/TtTRz/dsh-wecom), [`ttmouse/dsh-dingtalk-channel`](https://github.com/ttmouse/dsh-dingtalk-channel), [`One1turn/dsh-omnibridge`](https://github.com/One1turn/dsh-omnibridge), [`wsz987/dsh-channels`](https://github.com/wsz987/dsh-channels), and [`IvanWu2015/dsh-connect`](https://github.com/IvanWu2015/dsh-connect) focus on using office chat as a remote DSH interface. [`THEWOLFWALKER/dsh-notifier`](https://github.com/THEWOLFWALKER/dsh-notifier) focuses on notifications and selected bidirectional flows. [`ShiXiangYu2/dsh-feishu-remote`](https://github.com/ShiXiangYu2/dsh-feishu-remote) demonstrates reuse of `lark-cli`, but only for Feishu and with deployment-specific assumptions.

The search found no project that combined all three official office CLIs, broad outbound office operations, a shell-free DSH tool, secret/path controls, and approval-aware mutations in one installable bundle. This is a product-positioning conclusion from a fast-moving ecosystem, not a formal proof of absence.

## Decision

This project occupies the **DSH → office platform** layer. It keeps vendor schema/help dynamic, avoids copying dozens of fast-changing Skills, delegates credentials to vendor stores, blocks raw API by default, and treats inbound chat channels as a separate reliability problem for future plugins.
