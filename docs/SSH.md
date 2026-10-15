# 宿主 SSH 能力（`desktop.ssh.*`）

插件跑在渲染进程里，拿不到 Node 的 `child_process`，所以「连远程机器执行命令 / 传文件」只能由宿主提供。
本能力用**用户自己的 OpenSSH**（`ssh` / `scp`）实现，并且**宿主不接收、不保存任何凭证**。

- 契约：[`packages/common/src/core/desktop-bridge.ts`](../packages/common/src/core/desktop-bridge.ts)（`SshBridge` / `SshExecOptions` / `SshTransferOptions` / `SshGrant`）
- 主进程：`apps/desktop/src/main/ssh/`
  - `ssh-args.mjs` — 参数校验与 argv 构造（纯函数，可离线测）
  - `ssh-runner.mjs` — spawn / 超时 / 输出预算（纯 Node）
  - `index.ts` — 网络策略 + 用户确认 + IPC
- 渲染层包装：[`packages/core/src/desktop/bridge.ts`](../packages/core/src/desktop/bridge.ts)（`desktop.ssh`，老版本宿主上为 `undefined`）
- 测试：`pnpm test:ssh`

## 一句话契约

> 远程执行要过三道闸门：**网络策略** → **该主机在本次运行内的首次用户确认** → **argv-only 执行**。
> 认证永远来自用户自己的 `~/.ssh/config`、密钥与 ssh-agent；宿主这条链路上没有密码、没有私钥。

## 为什么是「系统 OpenSSH」而不是内置 ssh2

| 取舍 | 说明 |
| --- | --- |
| 零新依赖 | 不用把 `ssh2`（含可选原生模块）打进桌面包，离线可用 |
| 自动沿用用户环境 | `~/.ssh/config`、`ProxyJump`、`known_hosts`、agent、跳板机别名全都直接生效 |
| 代价：不支持密码/键盘交互认证 | `BatchMode=yes` 让「需要密码」变成**快速失败**，而不是在看不见的地方挂起主进程；需要密码的机器请先配 agent 或手动连一次 |
| 需要系统有 ssh 客户端 | macOS / Linux / Windows 10+ 均自带；缺失时报错会明确说「install an OpenSSH client」 |

## 为什么宿主不接收凭证

对照 `credentials.*` 的注释：把密钥交给宿主保管会把泄露面从「用户自己的 SSH 配置」放大到「应用的数据目录 + safeStorage + 解密路径」。
用 agent 既更安全也更好用，因此 `SshExecOptions` / `SshTransferOptions` **没有** password / privateKey 字段，也不透传 `-i` 或任意 `-o`。

## 合同

| 能力 | 参数 | 结果 |
| --- | --- | --- |
| `ssh.exec` | `{ host, user?, port?, command, timeoutMs?, maxOutputBytes?, hostKeyPolicy? }` | `SshExecResult`（`ok` / `code` / `signal` / `stdout` / `stderr` / `truncated` / `timedOut` / `durationMs` / `argv`） |
| `ssh.put` | `{ host, user?, port?, localPath, remotePath, … }` | `SshTransferResult`（同上 + `direction: 'put'`） |
| `ssh.get` | 同上 | `SshTransferResult`（`direction: 'get'`） |
| `ssh.hosts` | 无 | `SshGrant[]`（本次运行已授权的主机） |
| `ssh.forget` | `{ key }` 或 `{ host, user?, port? }` | `boolean`（是否删掉了一条授权） |

`localPath` 走与 `fs.*` **同一个** fs 白名单；`remotePath` 与 `command` 只做字符校验（不做远程路径白名单——远端是用户自己的机器）。
`hostKeyPolicy` 默认 `strict`（必须在 `known_hosts` 里）；`accept-new` 是首次信任（TOFU），对话框会明确写出调用方要的是哪一种。

## 三道闸门（实现位置）

1. **网络策略**（`ssh/index.ts` 的 `assertTargetAllowed`）：复用 `http.request` 那套 SSRF 判定。
   私网 / 回环 / 链路本地默认拒绝（要在设置里打开「允许访问私有网络」）；云元数据地址**永远**拒绝。
   字面量地址直接判；域名先解析、**每一条** A/AAAA 记录都判，避免 DNS rebinding 绕过。
   每次调用都重新判（策略和 DNS 都可能变），不是只在首次。
2. **首次连接确认**（`requireGrant`）：`user@host:port` 在本次运行内第一次出现时弹模态框，写明目标、
   主机密钥策略、以及（exec 时）命令预览。**拒绝、或没有窗口可问，一律 fail closed**。
   授权只在内存里，随应用退出清空（与 `fs.*` 的对话框授权同一生命周期）。
   已按 `strict` 授权的主机再请求 `accept-new` 会**重新询问**，不允许悄悄降级。
3. **argv-only 执行**（`ssh-args.mjs`）：host/user 做字符集校验且**拒绝 `-` 开头**（否则会被 ssh 当成选项），
   远端命令是最后一个位置参数、永不经过 shell；scp 的路径也是 argv 元素，因此**空格/引号都不需要转义**。

## 已知边界

- **只支持单文件传输**：没有递归目录、没有端口转发、没有交互式 shell（v1 取舍）。
- **授权粒度是 `user@host:port` + 本次运行**：这意味着同一主机上的**后续命令不再询问**——这是「首次确认」模型的固有代价（想要逐条确认的话，`hostKeyPolicy` 每次变都能触发重问，但那不是它的用途）。
- **授权在应用重启后清空**：需要「长期授权」时应由设置页显式落盘，目前没有。
- **严格模式要求主机已在 `known_hosts`**：没连过的机器要么先手动 `ssh` 一次，要么调用方显式请求 `accept-new` 并在对话框里让用户知情。
- **环境变量按原样继承**：ssh 需要 `HOME`、`SSH_AUTH_SOCK`、`PATH`；不额外注入、也不清理（与 `dev.installDependencies` 同样的信任级别）。
- **输出与时限有界**：输出默认 1 MiB、上限 4 MiB（`truncated` 上报）；超时默认 30s、上限 10min，超时先 `SIGTERM`、3s 后 `SIGKILL`（`timedOut` 上报）。
- **并发上限 4**：同时最多 4 个 ssh/scp 子进程，超出按到达顺序排队（避免一个调用点变成 ssh fork bomb）。
- **退出时回收**：`will-quit` 会杀掉在飞的子进程，避免卡住的 ssh 变成孤儿进程。
- **不透传任意 ssh 选项**：`-i`、`-o`、`-F` 等都不开放；需要特殊配置请写进用户自己的 `~/.ssh/config`。
- **凭证不落盘**：这条链路上宿主不持有任何密码/私钥；出问题时也**不会**打印它们（argv 里没有）。

## 用法（插件侧）

```ts
import { useOptionalService } from '@kn/common'

const desktop = useOptionalService('desktop')
if (!desktop?.ssh) throw new Error('This desktop build has no SSH capability; update the app.')

const result = await desktop.ssh.exec({
    host: 'deploy.example.com',
    user: 'deploy',
    command: 'set -e\ncd /srv/app && git pull && systemctl restart app',
})
if (!result.ok) console.error(result.stderr)   // 失败是结果，不是异常

await desktop.ssh.put({ host: 'deploy.example.com', user: 'deploy', localPath: '/tmp/app.zip', remotePath: '/srv/app.zip' })

const grants = await desktop.ssh.hosts()
if (grants[0]) await desktop.ssh.forget({ key: grants[0].key })   // 撤销某个主机的授权
```

> 失败语义：进程**跑起来了但退出码非 0**（含认证失败、命令失败）会正常 resolve，`ok: false` + `code` + `stderr`；
> 只有「进程根本起不来」（缺 ssh 客户端）才 reject。调用方据此区分「远程命令失败」和「本机环境有问题」。

## 验证

```bash
pnpm test:ssh        # 58 项
```

覆盖：目标/命令/路径校验与**选项注入防护**（`-oProxyCommand=…` 被拒）、超时与输出钳位、
策略措辞、ssh 与 scp 的 argv（含 `-P` 与 `-p` 的区别、命令保持单个参数）、授权键、
输出预算截断、**超时 → SIGTERM 上报**、缺二进制时的明确报错，
以及一条**真实 `ssh` 二进制**用例：连不存在的域名必须快速返回结构化失败（证明 `BatchMode=yes` 不会挂在密码提示上）；
外加并发上限（第 5 个调用排队、释放后启动）、退出时回收在飞子进程、槽位不泄漏。

## 后续（未做）

- 递归目录传输（`scp -r`）、端口转发、交互式 shell。
- 设置页里的「已授权主机」管理 UI（`ssh.hosts` / `ssh.forget` 已经就位，缺界面）。
- 长期授权（跨重启）与其显式撤销入口。
- 核心 agent 工具（`sshExec` 之类）：能力已可用，工具面尚未接入。
