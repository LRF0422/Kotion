# 宿主 SSH 能力（`desktop.ssh.*`）

插件跑在渲染进程里，拿不到 Node 的 `child_process`，所以「连远程机器执行命令 / 开终端 / 读写远端目录」只能由宿主提供。
本能力在**主进程**用 [`ssh2`](https://github.com/mscdex/ssh2) 实现：远程执行、**可交互的 pty 终端（流式）**、以及 **SFTP 目录能力**。
**宿主不接收、不保存任何凭证**：认证只用用户自己的 ssh-agent 与默认密钥文件。

- 契约：[`packages/common/src/core/desktop-bridge.ts`](../packages/common/src/core/desktop-bridge.ts)（`SshBridge` / `SshExecOptions` / `SshSftp*` / `SshShell*` / `SshShellEvent`）
- 主进程：`apps/desktop/src/main/ssh/`
  - `ssh-params.mjs` — 参数校验与钳位（纯函数）
  - `ssh-keys.mjs` — 凭证发现 + `known_hosts`（含 hash 形式）校验 + TOFU
  - `ssh-client.mjs` — `ssh2` 封装：连接 / exec / SFTP / pty 会话
  - `index.ts` — 网络策略 + 用户授权 + IPC + 事件广播
- 渲染层包装：[`packages/core/src/desktop/bridge.ts`](../packages/core/src/desktop/bridge.ts)（`desktop.ssh`，老版本宿主上为 `undefined`）
- 打包：`apps/desktop/scripts/prepare-ssh-deps.cjs`（把 `ssh2` 物化进产物，见文末）
- 测试：`pnpm test:ssh`

## 一句话契约

> 每一次调用都要过三道闸门：**网络策略** → **该主机在本次运行内的首次用户确认**（交互式终端会在弹窗里单独写明）
> → **主机密钥校验（在认证之前）**。认证来自用户自己的 agent / `~/.ssh/id_*`，这条链路上没有密码、没有私钥。

## 为什么是 ssh2（而不是调用系统 `ssh`）

第一版宿主是 `spawn('/usr/bin/ssh')`，能跑命令，但有两个做不了的硬需求：

| 需求 | spawn `ssh` | `ssh2` |
| --- | --- | --- |
| **交互式终端 + 窗口尺寸** | 管道没有 tty；`ssh -tt` 也**无法在连接中改变远端 pty 尺寸**（没有本地 tty 随窗口变化） | `client.shell({cols,rows})` + `stream.setWindow(rows,cols)`，resize 真的发到远端 |
| **SFTP 目录能力** | 只有 `scp` 单文件搬运；列目录/建目录/改名/删除都得绕 | `readdir/stat/mkdir/rename/unlink/rmdir` + `fastPut/fastGet` |

代价（**已知边界**，见下）：`ssh2` 不解析 `~/.ssh/config`，所以**主机别名、`ProxyJump`、`IdentityFile`、`Include` 都不生效**。

## 合同

| 能力 | 参数 | 结果 |
| --- | --- | --- |
| `ssh.exec` | `{ host, user?, port?, command, timeoutMs?, maxOutputBytes?, hostKeyPolicy? }` | `ok` / `code` / `signal` / `stdout` / `stderr` / `truncated` / `timedOut` / `durationMs` |
| `ssh.put` / `ssh.get` | `{ …, localPath, remotePath }` | `ok` / `localPath` / `remotePath` / `durationMs`（`localPath` 走 fs 白名单） |
| `ssh.sftpList` | `{ …, path }` | `{ path, entries: SshSftpEntry[], truncated }`（`path` 已拼好；条目含 directory/file/symlink/size/mode/mtime/uid/gid） |
| `ssh.sftpStat` | `{ …, path }` | 同上，单条 |
| `ssh.sftpMkdir` | `{ …, path, recursive? }` | `{ created: true }`（`recursive` 逐段创建） |
| `ssh.sftpRename` | `{ …, from, to, overwrite? }` | `{ from, to }`；**默认拒绝覆盖已存在的目标** |
| `ssh.sftpRemove` | `{ …, path, directory? }` | `{ removed: true }`（`directory` 走 `rmdir`，只能删空目录） |
| `ssh.shellOpen` | `{ …, term?, cols?, rows? }` | `SshShellSession { sessionId, host, user, port, cols, rows, openedAt }` |
| `ssh.shellWrite` | `{ sessionId, data }` | `boolean`（每次 ≤64 KiB） |
| `ssh.shellResize` | `{ sessionId, cols, rows }` | `boolean`（真的发 window-change） |
| `ssh.shellClose` | `{ sessionId }` | `boolean` |
| `ssh.shells` | — | 当前打开的会话列表 |
| `ssh.hosts` / `ssh.forget` | `{ key }` 或 `{ host, user?, port? }` | 本次运行已授权的主机 / 撤销 |

**终端事件**走独立通道 `desktop:event:ssh`（包装层 `desktop.ssh.onShell(listener)`）：

```ts
{ type: 'shell-data', sessionId, data }        // data 是 base64
{ type: 'shell-exit', sessionId, code, signal }
{ type: 'shell-error', sessionId, message }
```

> `data` 用 base64 而不是字符串：ssh2 的 chunk 可能在多字节字符中间切开，JSON 往返会把这种序列变成永久乱码，终端无法自行修复。

## 三道闸门

1. **网络策略**（`index.ts` 的 `assertTargetAllowed`）：复用 `http.request` 那套 SSRF 判定。私网 / 回环 / 链路本地默认拒绝（设置里可开）；云元数据地址永远拒绝。字面量直接判，域名先解析、**每条记录都判**（防 DNS rebinding），每次调用都重判。
2. **首次连接确认**：`user@host:port` + **操作类别**在本次运行内第一次出现时弹模态框，写明目标、主机密钥策略、**凭证来源**，以及要做的事——`远程执行命令` / `上传下载文件` / `读取或修改远端目录` / **`打开「交互式终端」`**。拒绝、或没有窗口可问，一律 fail closed。授权只在内存、随退出清空；按 `strict` 授权后再请求 `accept-new` 会重新询问；**换操作类别也会重新询问**——允许跑一条命令不等于允许开一个终端。`ssh.forget` 撤销该主机的**全部**类别。
3. **主机密钥在认证之前校验**（`ssh-keys.mjs` + `client.connect({ hostVerifier })`）：`hostVerifier` 返回 false 时 ssh2 **中止握手**，不会先登录再发现密钥不对。
   - `strict`（默认）：必须命中 `~/.ssh/known_hosts`，**支持 OpenSSH 默认的 hash 形式**（`|1|salt|hmac-sha1(host)`）。这条最容易漏：现代 OpenSSH 默认 `HashKnownHosts yes`，字符串比较永远匹配不上。
   - `accept-new`：首次信任，并把指纹记进 `<userData>/ssh-known-hosts.json`；此后该主机换密钥会**报错**（`HOST KEY CHANGED`），不会静默接受。
   - 非 22 端口用 `[host]:port` 形式匹配（与 ssh 一致）。

## 已知边界

- **不读 `~/.ssh/config`**：主机别名、`ProxyJump`、`IdentityFile`、`Include`、`Host *` 选项都不生效；认证只用 ssh-agent（`SSH_AUTH_SOCK`）+ `~/.ssh/{id_ed25519,id_ecdsa,id_rsa,id_dsa}` 里第一个可用者。这是从系统 `ssh` 换到 `ssh2` 换来的代价；要恢复需要在宿主里实现一份 config 解析（未做）。
- **不支持密码 / 键盘交互认证**：类型里**没有** password / privateKey 字段，宿主也不接受任何凭证入参。
- **每次 exec / SFTP / 传送各开一条连接**（用完即关，无长连接池）；只有交互式终端持有一条专属连接，直到 `shellClose` 或远端退出。代价是每次调用付一次握手。
- **输出有界**：单次 `shellWrite` ≤64 KiB；exec 输出默认 1 MiB、上限 4 MiB（`truncated` 上报）。
- **SFTP 不递归**：`sftpList` 只列一层；没有 `rm -r`、没有递归上传下载；`sftpRemove` 只能删空目录；`sftpRename` 默认拒绝覆盖。
- **超时**：exec/SFTP 单次调用默认 30s（可调到 10min）；连接握手 20s；每个 `sftp*` 协议操作另有 60s 硬超时（否则一个不回包的服务器会让 IPC 永远挂着）。
- **授权粒度是 `user@host:port` + 操作类别 + 本次运行**：同一主机上同类别操作的后续调用不再询问（例如 exec 之后继续 exec）；**第一次开终端一定会单独确认**。
- **环境变量按原样继承**（ssh 需要 `HOME` / `SSH_AUTH_SOCK`）；宿主不额外注入也不清理。

## 用法（插件侧）

```ts
const desktop = useOptionalService('desktop')
if (!desktop?.has('ssh.shellOpen')) return <p>需要较新的桌面客户端</p>

// 1) 远程执行
const r = await desktop.ssh.exec({ host, user, command: 'systemctl restart app' })
if (!r.ok) console.error(r.stderr)

// 2) 远端目录
const listing = await desktop.ssh.list({ host, user, path: '/srv/app' })
await desktop.ssh.mkdir({ host, user, path: '/srv/app/releases', recursive: true })
await desktop.ssh.rename({ host, user, from: '/srv/app/current', to: '/srv/app/previous' })

// 3) 交互式终端（xterm.js 一类）
const session = await desktop.ssh.shell({ host, user, cols: 80, rows: 24 })
const off = desktop.ssh.onShell((event) => {
    if (event.sessionId !== session.sessionId) return
    if (event.type === 'shell-data') term.write(Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0)))
    if (event.type === 'shell-exit') off()
})
term.onData((data) => void desktop.ssh.shellWrite({ sessionId: session.sessionId, data }))
term.onResize(({ cols, rows }) => void desktop.ssh.shellResize({ sessionId: session.sessionId, cols, rows }))
```

> 失败语义：连接 / 认证 / 主机密钥 / SFTP 操作失败 / 超时都会 **reject**；`ssh.exec` 仍用 `ok: false` 表示「命令跑起来了但退出码非 0」。

## 凭据：只有密码的机器怎么登录（接口由宿主提供，**界面由插件实现**）

`ssh2` 默认只用 ssh-agent 与 `~/.ssh/id_*`，而很多机器只接受密码（或只讲 keyboard-interactive）。
宿主因此开放了一组**凭据接口**：插件自己画界面，把用户输入的密码/私钥交给宿主保存。

**只进不出**：`set` 收明文，任何 `list`/返回值里都**没有**密码或私钥字段；明文只有主进程在连接时解析。
落盘用 Electron `safeStorage`（OS keychain）加密到 `<userData>/ssh-credentials.json`，文件里只有密文。

| 能力 | 参数 | 结果 |
| --- | --- | --- |
| `ssh.credentialsAvailable` | — | `boolean`：**false 表示这台机器无法真正加密**（Linux 无 keyring 时 safeStorage 退化成固定密钥），此时 `set` 会被拒绝 |
| `ssh.credentialsList` | — | `SshCredentialMetadata[]`（`id` / `host` / `user` / `port` / `kind` / `label` / `targetKey` / `hasPassphrase` / 时间戳）——**元数据** |
| `ssh.credentialsSet` | `{ host, user?, port?, kind: 'password' | 'key', secret, passphrase?, label? }` | `{ ok, credential?, error? }`；按 `user@host:port` **覆盖**同名目标（`id` 保持不变） |
| `ssh.credentialsRemove` | `{ id }` | `{ ok, error? }` |

在调用侧选凭据：`ssh.exec` / `sftp*` / `shellOpen` 都接受可选的 **`credentialId`**，不传就用该目标的凭据。

**认证优先级（宿主决定，插件不用管）**：存了凭据 → **只用它**（不再悄悄试 agent，避免报错指向错的方法）；
没存 → ssh-agent → `~/.ssh/{id_ed25519,id_ecdsa,id_rsa,id_dsa}`。密码会同时用于 `password` 与
**keyboard-interactive** 提示（PAM/2FA 服务器走后者）。认证失败时报错会明确说该去哪儿加凭据。

**插件实现界面时要照做的三件事**：

1. 先 `available()`；为 `false` 时**不要**让用户输入密码，直接说明「本机无法安全保存凭据，请用 agent 或密钥」。
2. `set` 失败时把 `error` **原样展示**（宿主写的是可操作的原因，例如「这台机器无法加密」「那不像 PEM 私钥」）。
3. 展示 `list()` 的元数据即可；不要试图把 `secret` 读回来——接口里没有。

```ts
// 插件侧：一个最小可用的凭据表单
const ssh = useOptionalService('desktop')?.ssh
if (ssh && await ssh.credentials.available()) {
    const saved = await ssh.credentials.set({ host, user, kind: 'password', secret: password })
    if (!saved.ok) toast.error(saved.error)          // 原样展示
    const all = await ssh.credentials.list()          // 只有元数据
    await ssh.exec({ host, user, credentialId: saved.credential?.id, command: 'uname -a' })
}
```

> **信任模型**：这是「可信插件」模型——插件能**写/删**凭据（它本来也能对该主机 `ssh.exec`），
> 但**读不到**任何已存的明文；跨插件也没有权限隔离（见差距分析的 B7）。要收紧就得先做「按插件身份授权」。

## 打包（`ssh2` 是运行时 require）

electron-builder 的 `files` 只发 `out/**` 并排除 `node_modules`，而主进程 `require('ssh2')`（`externalizeDepsPlugin` 保持 external）：
`afterPack` 的 [`prepare-ssh-deps.cjs`](../apps/desktop/scripts/prepare-ssh-deps.cjs) 把 `ssh2` 与它的运行时闭包
（`asn1` / `bcrypt-pbkdf` / `tweetnacl` / `safer-buffer`）物化到 **`<Resources>/node_modules/`**（与 `better-sqlite3` 同一套做法，理由见 `prepare-storage-deps.cjs`）。

- **可选原生加速器刻意不发**：`ssh2` 的 `cpu-features`（+`nan`/`buildcheck`）只是 AES-GCM 加速，缺失时它有降级路径；发一个 ABI 不匹配的 `.node` 更糟。
- 关闭方式：`KN_SKIP_SSH_DEPS=1`（打包仍成功，但产物没有 SSH 能力）。
- 回归测试断言的是**「从产物布局里真的能 `require` 到 `ssh2` 并拿到 `Client`」**，而不只是「文件存在」——后者正是宿主 API 源码踩过的坑（文件发了、路径解析不到）。

## 验证

```bash
pnpm test:ssh        # 95 项：80 协议/契约/凭据 + 15 打包
```

- **契约与信任（纯函数）**：目标 / 命令 / 路径 / 会话校验、`known_hosts` 解析与匹配（明文、逗号列表、hash 形式、非 22 端口）、严格 / accept-new / 记住后换钥的判定、指纹格式（`SHA256:base64`）、凭证发现。
- **协议（真实 ssh2 服务器）**：测试在进程内起一个 `ssh2.Server`（随机端口）跑真实协议——主机密钥校验通过 / 失败（失败时**确认没有发生认证尝试**）、exec 的输出与退出码、**pty 终端的双向数据与 window-change resize**、SFTP 分页 `READDIR`（以 `SSH_FX_EOF` 结束）、`stat`、递归 `mkdir`、`rename`（含拒绝覆盖）、上传 / 下载 / 删除。
- **凭据**：加密存储的读/写/移除、**列表不含密文或明文字段**、按目标覆盖时 `id` 不变、无 keychain 时拒绝保存、
  PEM 校验、私钥+口令往返；以及两条真实协议用例——存了密码能连上 `password` 服务器、同一份密码也能应答
  **只有 keyboard-interactive** 的服务器（PAM 风格），还有没有凭据时那句「去哪儿加凭据」的报错。
- **打包**：物化的依赖树能从产物布局里被 `require` 到，且可选原生包被跳过。
