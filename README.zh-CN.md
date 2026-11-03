# dsh-office-cli

> SeletaTech 兼容修复 fork：安装已验证版本：`dsh plugin --profile web add github:seletatech/dsh-office-cli#v0.1.1`。[发布、验证和上游补丁](https://github.com/seletatech/dsh-office-cli/releases/tag/v0.1.1)。原仓库已归档，保留其历史和 MIT 许可。

[English](README.md) | 中文

把企业微信、钉钉、飞书三家的**官方办公 CLI** 作为一个安全、原生的 DeepSeek Harness（DSH）插件提供给 Agent。

这不是另一个聊天机器人桥。现有 DSH 社区已经有不少“从飞书/钉钉/企微聊天远程控制 DSH”的项目；本项目解决另一层问题：让 DSH 在一次安装后，以统一工具操作三家的消息、通讯录、文档、表格、日程、会议、待办、审批、邮件等办公能力，同时继续使用厂商 CLI 自己的鉴权、命令发现和 API 兼容层。

> 已测试 DSH SDK `0.1.0-rc.7` 和 `0.2.2-alpha.2`；后者须使用对应 DSH 支持的 Node 版本（本次为 `24.22.2`）。这两个已测版本无需修改 DSH 核心或授予版本豁免。其他 Preview 版本不在此次兼容声明范围内。

## 能力

| 平台 | 官方 CLI | 插件平台名 | 能力发现 | 本地鉴权 |
|---|---|---|---|---|
| 企业微信 / WeCom | [`@wecom/cli`](https://github.com/WecomTeam/wecom-cli) | `wecom` | `schema list/get`、`--doc`、`--schema` | `wecom-cli auth init` |
| 钉钉 / DingTalk | [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) | `dingtalk` | `dws schema ... --compact` | `dws auth login` |
| 飞书 / Lark | [`lark-cli`](https://github.com/larksuite/cli) | `feishu` | 分层 `--help`、快捷命令与 API 命令 | `lark-cli config init` + `auth login` |

插件提供：

- `office_cli`：统一的模型工具，输入平台、argv 数组、用途和可选 `dry_run`。
- `office_cli_doctor`：只检查三家 CLI 是否能运行及其版本，不读取账号身份或凭据。
- `dsh-office`：用户在终端执行的诊断和交互式鉴权助手。
- `dsh-office-cli` 内置 Skill：教 Agent 渐进发现命令、先 dry-run、检查退出码，并正确处理三家差异。
- 安全策略：无 shell 执行、输出/超时上限、凭据参数拦截、工作区路径限制、危险与未知写操作审批。

预演请使用工具参数 `dry_run: true`。插件在带值选项之前插入厂商预演标记，消息正文中的类似标记不代表帮助或预演。预演时拒绝冲突的预演参数及 `--` 终止符；仅在原始 CLI 参数中出现 `--dry-run` 不会跳过写入审批。

## 安装

要求 Node.js `>=22.19` 和可运行的 DeepSeek Harness。

### 从 GitHub 安装

```bash
dsh plugin --profile web add github:meliwanx/dsh-office-cli
dsh plugin --profile web exec dsh-office install
dsh plugin --profile web exec dsh-office doctor
dsh --profile web --dump-config
dsh --profile web
```

插件安装本身没有 `postinstall`，不会触发 pnpm 的依赖脚本拦截。第二条命令是用户明确授权的准备步骤：它通过 npm 把三个精确版本的官方 CLI 安装到 `$DSH_HOME/office-cli`，供所有 DSH profile 共用，不污染全局 npm。

```bash
# 也可以只装需要的平台
dsh plugin --profile web exec dsh-office install wecom
dsh plugin --profile web exec dsh-office install dingtalk
dsh plugin --profile web exec dsh-office install feishu
```

如果不想使用受管目录，也可以手工把官方 CLI 安装到 PATH，或把它们作为 profile 的相邻依赖安装。插件按“显式配置 → `$DSH_OFFICE_HOME`/`$DSH_HOME/office-cli` → 相邻 npm 包 → PATH”的顺序查找。

### 本地开发安装

```bash
npm install
npm run check
dsh plugin --profile web add .
dsh plugin --profile web exec dsh-office install
```

首次发布到 npm 后，安装命令可简化为：

```bash
dsh plugin --profile web add dsh-office-cli
```

## 诊断与鉴权

凭据由三家官方 CLI 写入自己的系统 Keychain/加密存储，本插件不接收、不保存、不代理 App Secret 或 Token。

```bash
dsh plugin --profile web exec dsh-office doctor
dsh plugin --profile web exec dsh-office install
dsh plugin --profile web exec dsh-office auth wecom
dsh plugin --profile web exec dsh-office auth dingtalk
dsh plugin --profile web exec dsh-office auth feishu
```

也可直接使用厂商命令：

```bash
wecom-cli auth init
dws auth login
lark-cli config init
lark-cli auth login --recommend
```

## 使用

安装并完成对应平台鉴权后，直接对 DSH 说：

```text
查看我今天的飞书日程。
```

```text
先 dry-run，然后在企业微信里给张三创建一个明天下午 5 点到期的待办。
```

```text
查钉钉里本周待我审批的流程，只读，不要做任何审批操作。
```

Agent 会先加载随包提供的 Skill；命令不确定时，先用厂商 schema/help 发现最小命令面，再调用 `office_cli`。写操作默认进入 DSH 的一次性审批流程。

## 可信执行服务（0.1.2）

默认仍执行本地官方 CLI。云端部署可在本插件的原生配置中设置 `executorService: officeCliExecutor`；它是可信 Cordis 服务名，不是模型参数或 URL。服务由部署方实现并管理每账号凭据；本插件不存储平台凭据，也不增加 Agent 循环。

服务提供 `run(request, exec)` 与 `inspect(platform, exec)`。request 包含 platform、准确的 args、purpose、已分类的 risk、dryRun 及配置的 maxOutputBytes；exec 是原生工具执行上下文，含 Agent/会话及取消信号。run 返回 `src/runner.js` 的结果结构，inspect 返回既有 doctor 行结构。服务必须自行验证账号和会话权限、支持的能力、取消、输出上限及凭据脱敏。插件策略和原生审批仍先执行，但同意审批不会扩大服务权限。

配置后插件等待该服务，服务卸载时工具和技能一起移除；服务调用失败绝不回退本地 CLI，此模式也不执行本地 executable 覆盖。云端可以只开放部分命令，请遵循其帮助及授权指引。只设置此选项不会自动生成云端连接器。

## 配置

覆盖 profile 的 `cordis.patch.yml` 中同一个 `id`，并重述完整配置：

```yaml
- id: dsh-office-cli
  config:
    approval: writes
    timeoutMs: 120000
    killGraceMs: 2000
    maxOutputBytes: 262144
    maxArgs: 128
    maxArgLength: 65536
    allowRawApi: false
    workspaceFilesOnly: true
    # 仅在自动发现失败时设置；值是单个可执行文件路径，不是 shell 命令。
    # wecomCommand: /opt/bin/wecom-cli
    # dingtalkCommand: /opt/bin/dws
    # feishuCommand: /opt/bin/lark-cli
```

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `approval` | `writes` | `writes` 仅审批写/删除/未知操作；`all` 审批全部调用；`off` 关闭本插件审批。 |
| `timeoutMs` | `120000` | 每个前台 CLI 调用的超时。 |
| `killGraceMs` | `2000` | 超时/取消后从 SIGTERM 升级到强制终止的宽限时间。 |
| `maxOutputBytes` | `262144` | stdout + stderr 的总捕获上限，超出后截断。 |
| `maxArgs` | `128` | 单次 argv 数量上限。 |
| `maxArgLength` | `65536` | 单个 argv 的字符上限，兼容文档正文。 |
| `allowRawApi` | `false` | 是否允许三家 CLI 的低层 `api` 模式。 |
| `workspaceFilesOnly` | `true` | 拒绝明显指向会话工作区之外的文件参数。 |
| `*Command` | 未设置 | 指定对应 CLI 的可执行文件路径或 PATH 名。不会进行 shell 拆词。 |

`workspaceFilesOnly` 是参数级防护，不是操作系统沙箱。高安全部署应把 DSH 和厂商 CLI 放进专用容器/账号，并限制企业应用本身的 API 权限。详见 [SECURITY.md](SECURITY.md)。

## 为什么做成一层统一插件

三家官方 CLI 都已经针对 Agent 提供 JSON 输出、帮助/schema 发现、dry-run 或风险元数据，并负责不断跟进各自开放平台。重新手写数百个 API 包装会迅速漂移；单纯让模型走 `bash` 又缺少统一审批、参数审计、超时和凭据防泄漏。

本项目因此只拥有四件事：DSH 工具契约、三家进程适配、跨平台安全策略、Agent 使用方法。业务 API 与 OAuth 生命周期仍由官方 CLI 拥有。完整设计见 [架构说明](docs/architecture.zh-CN.md)，生态调研见 [GitHub 调研](docs/research.zh-CN.md)。

## 范围与路线

0.1 版本专注 **DSH → 办公平台** 的出站办公能力。**办公平台消息 → DSH** 的入站 IM channel 涉及长期连接、会话映射、多租户身份、幂等/重放、远程审批与媒体流，不能和一次性 CLI 调用混成一个不可靠进程。后续会在同一适配器契约上增加独立的 `channel-*` 插件，不改变现有工具接口。

## 开发

```bash
npm install
npm run check
npm run pack:check
```

本项目不采用 TDD 强制流程；实现完成后使用单元、类型和打包检查验证。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)。由安装助手获取的三个厂商 CLI 是独立软件，分别遵循其自身许可证；见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
