# GitHub 生态调研（2026-08-19）

本次调研以官方仓库、GitHub `dsh-plugin` topic 和仓库 README 为准。Star 是 2026-08-19 的快照，只用于判断成熟度，不代表质量背书。

## 官方基础

| 项目 | 快照 | 结论 |
|---|---:|---|
| [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) | 165k stars，`0.1.0-rc.7` | 官方 DSH，`dsh.bundle` + `cordis.patch.yml` 是外部插件安装路径；默认 Skill provider 扫描项目/用户 Skill。 |
| [`WecomTeam/wecom-cli`](https://github.com/WecomTeam/wecom-cli) | 2.8k stars，npm `@wecom/cli@1.1.0` | 企业微信官方 Rust CLI；消息、文档、表格、通讯录、待办、会议、日程等；动态 discovery/schema；MIT。 |
| [`DingTalk-Real-AI/dingtalk-workspace-cli`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) | 2.7k stars，npm `1.0.58` | 钉钉官方开源 Workspace CLI `dws`；命令 schema 含 safety/参数语义；Apache-2.0。 |
| [`larksuite/cli`](https://github.com/larksuite/cli) | 16.5k stars，npm `@larksuite/cli@1.0.88` | 飞书/Lark 官方 CLI；200+ 命令、26 个 Agent Skills、快捷/API/raw API 三层；MIT。 |

三家在 2026 年都已有面向人和 Agent 的正式 CLI，因此新项目最有价值的部分不是再写 REST SDK，而是提供 DSH 原生的工具、审批、安全和技能路由。

## 已有 DSH 接入

GitHub 上已存在大量 IM channel 或通知项目，例如：

| 项目 | 平台/方向 | 与本项目的差异 |
|---|---|---|
| [`omdsh-dev/dsh-lark`](https://github.com/omdsh-dev/dsh-lark) | 飞书 ↔ DSH | 飞书 IM bot channel，重点是聊天入口。 |
| [`TtTRz/dsh-wecom`](https://github.com/TtTRz/dsh-wecom) | 企业微信 ↔ DSH | 企微 AI Bot channel，每个 chat 驱动 agent。 |
| [`ttmouse/dsh-dingtalk-channel`](https://github.com/ttmouse/dsh-dingtalk-channel) | 钉钉 ↔ DSH | 钉钉 Stream channel。 |
| [`One1turn/dsh-omnibridge`](https://github.com/One1turn/dsh-omnibridge) | 19 个 IM 平台 ↔ DSH | 广覆盖 IM 网关，不是三家官方办公 CLI 的统一工具层。 |
| [`wsz987/dsh-channels`](https://github.com/wsz987/dsh-channels) | 微信/QQ/钉钉/飞书/Telegram ↔ DSH | 统一扫码与消息/文件收发，仍以远程聊天控制为中心。 |
| [`IvanWu2015/dsh-connect`](https://github.com/IvanWu2015/dsh-connect) | 飞书、钉钉 ↔ DSH | 双平台聊天、流式回复、安排工作。 |
| [`THEWOLFWALKER/dsh-notifier`](https://github.com/THEWOLFWALKER/dsh-notifier) | 多平台通知/部分双向 | 统一通知、远程审批与聊天，不暴露三家完整办公命令面。 |
| [`ShiXiangYu2/dsh-feishu-remote`](https://github.com/ShiXiangYu2/dsh-feishu-remote) | 飞书 ↔ DSH，使用 lark-cli | 证明复用官方 CLI 可行，但仅飞书且代码含部署路径/危险全权限等专用假设。 |

另有数十个飞书 bridge、若干企微和钉钉插件。它们说明“移动端给 DSH 发任务”需求很强，也说明再做一个仅支持消息转发的三合一项目很难形成清晰差异。

## 空缺判断

在搜索到的 `dsh-plugin` 仓库中，没有发现同时满足以下条件的项目：

1. 统一接入企业微信、钉钉、飞书三家**官方办公 CLI**；
2. 让 DSH Agent 操作文档、日程、待办、审批等完整办公能力，而不只收发聊天；
3. 以无 shell argv、凭据防泄漏、写操作审批、超时/输出上限为明确安全边界；
4. 通过一个 DSH bundle 安装，并保留三家官方 CLI 的动态 schema/help 发现。

GitHub 搜索不是形式化证明，生态也在快速变化；这个结论应理解为 2026-08-19 的产品定位依据。

## 取舍

- 不复制官方 Skills：版本漂移和上下文膨胀都太高；内置一个 meta Skill，运行时查 schema/help。
- 不用 shell：模型提供 argv 数组，避免拼接与 shell 注入。
- 不保存密钥：让官方 CLI 的 Keychain/加密存储负责。
- 不在 0.1 混入 IM channel：前台命令调用和常驻消息网关的可靠性模型完全不同。
- 不默认开放 raw API：优先官方 curated/helper 命令，必要时由部署者显式开启。
