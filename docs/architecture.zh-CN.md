# 架构说明

## 目标

`dsh-office-cli` 为 DeepSeek Harness 提供统一的办公 CLI 执行能力，同时避免复制三家开放平台 API、OAuth 逻辑和快速变化的 schema。

```text
用户意图
  ↓
DSH 内置 Skill（选平台、发现命令、dry-run 规则）
  ↓
office_cli（结构化 platform + argv + purpose）
  ↓
参数策略 ──拒绝──→ 凭据 / 鉴权 / 长连接 / 越界路径
  ↓
风险分类 ──写操作──→ DSH approval 一次性审批
  ↓
平台适配器（显式配置 → 受管目录 → 相邻包 → PATH）
  ↓
无 shell、限时、限输出的子进程
  ↓
官方 wecom-cli / dws / lark-cli
  ↓
厂商 Keychain、OAuth、OpenAPI、审计
```

## 所有权边界

| 层 | 本项目拥有 | 厂商 CLI 拥有 |
|---|---|---|
| DSH | 工具 schema、展示、Skill、审批接入 | — |
| 安全 | argv 校验、命令拦截、风险分类、超时与输出上限 | 应用权限、Token 生命周期、API 风险元数据 |
| 命令 | 平台选择与进程定位 | 业务命令树、参数 schema、帮助、dry-run |
| 传输 | 无 shell 启动与取消 | HTTP/WebSocket、重试、分页、错误信封 |
| 凭据 | 不接触凭据 | Keychain/加密文件、OAuth、刷新 |

## 为什么不是 MCP 聚合器

DSH 已经有原生工具与 Skill 生命周期。再把三个 CLI 各自启动成 MCP server 会增加三套常驻进程、工具 schema 注入和连接恢复问题；CLI 的渐进帮助/schema 更适合数百个稀疏使用的办公命令，也能降低每轮模型上下文。未来某个平台只有 MCP 而没有成熟 CLI 时，可以新增适配器，但当前三家无需转换协议。

## 为什么不直接使用 bash

`bash` 能调用 CLI，但无法稳定表达“这是哪家办公平台、参数是什么、风险是什么”。统一工具带来：

- 参数以数组传递，不发生 shell 拼接或命令替换；
- 工具调用和用途进入 DSH 审计轨迹；
- 写操作能接入 DSH approval；
- 认证与凭据 flag 能在执行前拒绝；
- 每次调用共享超时、取消与输出上限；
- UI 可以展示平台和操作用途，而不是一串 shell 文本。

## 风险分类

策略按以下顺序决策：

1. 结构校验：参数数量、长度、NUL。
2. 禁止面：鉴权、配置、安装、升级、技能管理、server/MCP、event/listen/watch/stream。
3. 凭据防泄漏：拒绝 secret/token/password 类 flag 与环境变量赋值。
4. 文件边界：默认拒绝绝对路径和 `..` 逃逸，URL 除外。
5. raw API：默认关闭；显式开启后仍正常做风险分类和审批。
6. `dry_run`：视为只读。
7. 动词分类：删除类为 `destructive`，写入类为 `write`，查询类为 `read`，未知命令保守归为 `write`。

默认 `approval: writes` 让 `write`、`destructive` 和未知操作进入 DSH 的 `tools/pre-execute → approval` 流程。没有可用审批应答者时，DSH 会失败关闭，不执行命令。

## 进程模型

插件使用 Node `spawn` 且 `shell: false`。Linux/macOS 上子进程以独立进程组启动，超时或取消时终止整个进程组，避免 npm 的 JavaScript launcher 留下原生 CLI 子进程。Windows 使用普通子进程终止。

stdout 与 stderr 合计最多捕获 `maxOutputBytes`；超出的内容丢弃并返回 `truncated: true`，进程仍可正常完成。调用结果总是包含退出码、信号、耗时、超时与取消状态。启动失败会附上官方安装提示。

## 安装与解析

插件包不声明带安装脚本的厂商依赖，因此 `dsh plugin add` 不会被 pnpm 的 build-script 策略卡住。用户显式运行 `dsh-office install` 后，npm 把适配器中固定的三家版本装进 `$DSH_OFFICE_HOME`，默认是 `$DSH_HOME/office-cli`。这个目录独立于 profile，使多个 profile 能共享二进制。

运行时解析顺序是：

1. `wecomCommand` / `dingtalkCommand` / `feishuCommand`；
2. 受管安装目录中的包入口；
3. 与插件相邻、由部署者另行安装的 npm 包入口；
4. PATH 中的 `wecom-cli` / `dws` / `lark-cli`。

JavaScript launcher 通过当前 Node 可执行文件运行，因此不依赖 npm 是否创建 `.bin` 符号链接。安装是用户终端动作，不通过模型工具触发。

## Skill 设计

只随包提供一个小型路由 Skill，不复制三家数十个官方 Skill。它教模型使用官方 CLI 自身的渐进 schema/help，并规定 mutation 的 dry-run 流程。这样官方命令新增时无需等本项目发布，模型上下文也不会一次塞入数百条命令定义。

## 入站 IM channel 的后续设计

聊天入站不是 `office_cli` 的一个后台 flag。后续独立 channel 层至少需要：

- 每个平台的长连接或回调 transport；
- chat/topic/user 到 DSH session 的持久映射；
- allowlist、多租户身份与 workspace 路由；
- ACK、幂等、重放防护、断线重连和 outbox；
- 流式卡片、文件/图片上传下载；
- DSH questions/approval 的远程交互；
- 停止、恢复、并发与限流语义。

这些能力可以复用平台枚举、进程解析、认证诊断和安全文档，但应作为 `dsh-office-channel-wecom`、`-dingtalk`、`-feishu` 等可选组合包独立演进。
