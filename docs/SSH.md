# 宿主 SSH 能力（`desktop.ssh.*`）

插件跑在渲染进程里，拿不到 Node 的 `child_process`，也开不了本地监听端口，所以「连远程机器执行命令 / 开终端 / 读写远端目录 / 建隧道」只能由宿主提供。
本能力在**主进程**用 [`ssh2`](https://github.com/mscdex/ssh2) 实现：远程执行、**可交互的 pty 终端（流式）**、**SFTP 目录能力**，以及 **本地端口转发（`ssh -L`）与 SOCKS5 动态代理（`ssh -D`）**。
**宿主不接收、不保存任何凭证**：认证只用用户自己的 ssh-agent 与默认密钥文件（或用户存进宿主的凭据，见「凭据」一节）。

- 契约：[`packages/common/src/core/desktop/ssh.ts`](../packages/common/src/core/desktop/ssh.ts)（`SshBridge` / `SshExecOptions` / `SshSftp*` / `SshShell*` / `SshShellEvent` / `SshTunnel*`；能力元数据在 `desktop/catalog.ts`）
- 主进程：`apps/desktop/src/main/ssh/`
  - `ssh-params.mjs` — 参数校验与钳位（纯函数；含隧道的 kind/端口/目标/label/id 校验与上限）
  - `ssh-keys.mjs` — 凭证发现 + `known_hosts`（含 hash 形式）校验 + TOFU
  - `ssh-client.mjs` — `ssh2` 封装：连接 / exec / SFTP / pty 会话（`user` 省略时回退到本机账号）
  - `ssh-pool.mjs` — 连接池：按 `user@host:port` + 主机密钥策略复用 Client 与 SFTP 通道，空闲 60s 回收
  - `ssh-tunnel.mjs` — 隧道引擎：回环监听 + 每条隧道独占的 SSH 连接 + `forwardOut` 转发（`-L` / `-D`）
  - `ssh-socks5.mjs` — 动态隧道的 SOCKS5 服务器半边（RFC 1928，仅 CONNECT、无认证）
  - `index.ts` — 网络策略 + 用户授权 + IPC + 事件广播
- 渲染层包装：[`packages/core/src/desktop/bridge.ts`](../packages/core/src/desktop/bridge.ts)（`desktop.ssh`，老版本宿主上为 `undefined`）
- 打包：`apps/desktop/scripts/prepare-ssh-deps.cjs`（把 `ssh2` 物化进产物，见文末）
- 测试：`pnpm test:ssh`

## 一句话契约

> 每一次调用都要过三道闸门：**网络策略** → **该主机在本次运行内的首次用户确认**（交互式终端、端口转发会在弹窗里单独写明；
> `-L` 按「主机 + 目标地址」授权、`-D` 按「主机」授权）→ **主机密钥校验（在认证之前）**。认证来自用户自己的 agent / `~/.ssh/id_*`，这条链路上没有密码、没有私钥。

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
| `ssh.tunnelOpen` | `{ host, user?, port?, hostKeyPolicy?, credentialId?, kind?, remoteHost?, remotePort?, localPort?, label? }`（**没有** `timeoutMs`/`maxOutputBytes`：连接与转发超时由宿主固定） | `SshTunnelSession { tunnelId, kind, host, user, port, localHost, localPort, remoteHost, remotePort, label, openedAt }`；`localHost` 恒为 `127.0.0.1`，`localPort` 是真实监听端口（不是 0） |
| `ssh.tunnelClose` | `{ tunnelId }` | `boolean`（已经不在的隧道返回 `false`） |
| `ssh.tunnels` | — | 当前打开的隧道（`SshTunnelSession[]`，按打开时间排序） |
| `ssh.hosts` / `ssh.forget` | `{ key }` 或 `{ host, user?, port? }` | 本次运行已授权的主机 / 撤销 |

**终端事件**走独立通道 `desktop:event:ssh`（包装层 `desktop.ssh.onShell(listener)`）：

```ts
{ type: 'shell-data', sessionId, data }        // data 是 base64
{ type: 'shell-exit', sessionId, code, signal }
{ type: 'shell-error', sessionId, message }
```

> `data` 用 base64 而不是字符串：ssh2 的 chunk 可能在多字节字符中间切开，JSON 往返会把这种序列变成永久乱码，终端无法自行修复。

**隧道事件**走同一个 `desktop:event:ssh` 通道（包装层 `desktop.ssh.onTunnel(listener)`）：

```ts
{ type: 'tunnel-close', tunnelId, reason }   // reason: 'closed' | 'ssh-closed' | 'ssh-error' | 'revoked' | 'app-quit'
```

> 每条隧道**恰好**广播一次关闭事件：`closed` 是插件自己 `tunnelClose`；`ssh-closed` / `ssh-error` 是 SSH 传输断开；
> `revoked` 是 `ssh.forget` 撤销主机；`app-quit` 是应用退出。`onShell` 只转发 `shell-*`、`onTunnel` 只转发 `tunnel-close`
> （两者共用通道）；`desktop.on('ssh', …)` 仍能看到全部事件。

## 三道闸门

1. **网络策略**（`index.ts` 的 `assertTargetAllowed`）：复用 `http.request` 那套 SSRF 判定。私网 / 回环 / 链路本地默认拒绝（设置里可开）；云元数据地址永远拒绝。字面量直接判，域名先解析、**每条记录都判**（防 DNS rebinding），每次调用都重判。
   > 端口转发只对 **SSH 主机**过这把闸；`-L` 的远端目标与 `-D` 的 SOCKS 目标由**远端**解析/连接，本地 SSRF 判定不适用（那正是堡垒机隧道的用途），但字面量云元数据目标仍会被拒（见「端口转发」一节）。
2. **首次连接确认**：`user@host:port` + **操作类别**在本次运行内第一次出现时弹模态框，写明目标、主机密钥策略、**凭证来源**，以及要做的事——`远程执行命令` / `上传下载文件` / `读取或修改远端目录` / **`打开「交互式终端」`** / **`建立「SSH 隧道」`（固定目标）** / **`建立「SOCKS5 代理隧道」`**。拒绝、或没有窗口可问，一律 fail closed。授权只在内存、随退出清空；按 `strict` 授权后再请求 `accept-new` 会重新询问。
   - **换操作类别一定重新询问**——允许跑一条命令，不等于允许开一个终端或建一条隧道。
   - **`-L` 隧道按目标地址单独授权**：授权身份是「主机 + 类别 `tunnel` + `remoteHost:remotePort`」（主机名不区分大小写，本地监听端口不参与），所以批准 `db:5432` 不会顺带批准同一主机上 `127.0.0.1:22` 的转发。
   - **`-D` 隧道按主机授权**（类别 `proxy`）：SOCKS5 代理本身就是「任意目标」，只能整台主机一起允许/拒绝；弹窗会写明这一点并标为高风险。
   - `ssh.hosts` 按「主机 + 类别 + 主机密钥策略」去重列出一行（**不暴露** `-L` 的具体目标）；`ssh.forget` 撤销该 `user@host:port` 的**全部**类别、**全部** `-L` 目标，并关闭该主机上已打开的隧道（`reason: 'revoked'`）；仍在连接/绑定过程中的隧道也会被取消，不会在撤销之后被发布出来。
3. **主机密钥在认证之前校验**（`ssh-keys.mjs` + `client.connect({ hostVerifier })`）：`hostVerifier` 返回 false 时 ssh2 **中止握手**，不会先登录再发现密钥不对。
   - `strict`（默认）：必须命中 `~/.ssh/known_hosts`，**支持 OpenSSH 默认的 hash 形式**（`|1|salt|hmac-sha1(host)`）。这条最容易漏：现代 OpenSSH 默认 `HashKnownHosts yes`，字符串比较永远匹配不上。
   - `accept-new`：首次信任，并把指纹记进 `<userData>/ssh-known-hosts.json`；此后该主机换密钥会**报错**（`HOST KEY CHANGED`），不会静默接受。
   - 非 22 端口用 `[host]:port` 形式匹配（与 ssh 一致）。

## 连接复用（连接池）

`exec` / 每次 `sftp*` / `put` / `get` 不再各开一条连接：`ssh-pool.mjs` 按 **`user@host:port` + `hostKeyPolicy`**
复用一个 `ssh2` Client，并在其上**懒加载一条 SFTP 通道**（第一次用到 `sftp*` 时打开，之后复用）。

- **空闲 60s 回收**：每次调用归还后开始计时；到期且没有在途调用（lease 计数为 0）就关掉连接与通道。计时器 `unref`，不会拖住应用退出。
- **并发去重**：同一 key 的连接还在握手时，并发调用等同一个握手，不会连出一串。
- **不跨信任策略**：`strict` 与 `accept-new` 是两个 key——按弱策略建立的连接不会被强策略的调用复用（反之亦然）。
- **连接坏了就丢**：Client 的 `close` / `end` / `error` 会把条目移出池；SFTP 通道被服务器关闭时只丢通道，下次在同一连接上重开；SFTP 协议操作或打开子系统超时（60s）会丢弃整条连接，避免半死连接被下一次调用继承。服务器**明确拒绝** SFTP 子系统时只让本次调用失败，连接仍留给 `exec` 用。
- **信任决定变了就失效**：`ssh.credentialsSet` / `credentialsRemove` 会让该目标的池内连接失效（旧凭据建立的会话不能继续用）；`ssh.forget` 也会丢掉该主机的池内连接。失效按**代际**处理：正在握手、尚未落地的连接也会被作废并关闭，之后的调用重新建连（重新解析凭据），不会加入变更前的握手。网络策略仍然**每次调用重判**，池不绕过它；用户确认（闸门 2）也仍然每次调用检查。
- **`credentialId` 只在建连时生效**：池按目标复用，已有连接不会因为某次调用换了 `credentialId` 而重建；换凭据请用 `ssh.credentialsSet`（它会让该目标的池内连接失效，下一次调用重新认证）。
- **交互式终端不进池**：pty 是长连接流，由 `shellOpen` 独占一条连接，直到 `shellClose` 或远端退出。
- **隧道也不进池**：`ssh -L` / `ssh -D` 同样是长连接流，由隧道独占一条连接，直到 `tunnelClose`、撤销主机或退出应用。池的空闲回收因此不会把承载转发连接的传输关掉；池的其余规则（复用、60s 回收、LRU、失效代际）不变。
- **有界（软上限）**：池的目标规模是 8 条连接；超过时按最近最少使用淘汰**空闲**条目，正在使用或刚握手完还没被领取的不会被淘汰，所以并发高峰会短暂超出（之后随空闲回收降到上限）。这让插件遍历大量主机时不至于攒住连接。

> 复用不改变失败语义：连接在空闲期间被服务器关掉时，那一次调用会失败；下一次调用自动重连（不会重试有副作用的 `exec`）。

## 端口转发（ssh 隧道，`ssh -L` / `ssh -D`）

`ssh.tunnelOpen` 在主进程开一个**只绑 `127.0.0.1`** 的监听端口：`TUNNEL_BIND_HOST` 是写死的常量，调用方只能给端口、不能给地址，所以隧道永远不会暴露到局域网。`localPort` 省略或传 `0` 由系统分配，真实端口在返回的 `SshTunnelSession.localPort` 里。两种模式：

| | `-L`（`kind: 'local'`，默认） | `-D`（`kind: 'dynamic'`） |
| --- | --- | --- |
| 每个本机连接 | → **固定**的 `remoteHost:remotePort` | → 先讲 SOCKS5，由客户端**逐连接**选目标 |
| 目标谁解析 | **SSH 服务器**（可以是只有远端能访问的内网/私网地址，这正是堡垒机隧道的用途） | **SSH 服务器**（域名不在本地解析） |
| 授权范围 | 主机 + 类别 `tunnel` + `remoteHost:remotePort` | 主机 + 类别 `proxy`（整个代理，目标无关） |
| 典型用法 | 把 `127.0.0.1:<localPort>` 当作远端数据库/HTTP 服务的地址 | 浏览器/CLI 的 SOCKS5 代理，访问远端能访问的任意地址 |

- 转发用 ssh2 的 `direct-tcpip` 通道（`forwardOut`）；目标主机/端口在 open 时校验（IPv6 方括号会剥掉，拒绝 `-` 开头与非法字符）。
- 隧道和 exec/SFTP/shell 一样接受 `credentialId`（不传 = 该目标已存凭据 → agent/默认密钥），也同样过三道闸门。

### 生命周期、上限与事件

- **一条隧道 = 一个回环监听器 + 一条独占的 SSH 连接**（不经过连接池，见上一节）；SSH 传输断开时隧道和监听器一起消失。
- 上限：应用全局 **8 条隧道**（`MAX_SSH_TUNNELS`），每条隧道 **64 个并发转发连接**（`MAX_TUNNEL_CHANNELS`）；超出的本机连接被立即断开（不排队）。
- 单条转发通道的打开超时 **10s**（`DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS`）：服务器不回 `forwardOut` 时只断这一条连接，不会挂死。
- **不重试转发**：通道被拒/超时只影响当前本机连接，隧道继续监听，插件可以重试自己的连接。
- 关闭方式：`desktop.ssh.closeTunnel({ tunnelId })`（幂等，已关返回 `false`）、`ssh.forget` 撤销主机（`reason: 'revoked'`，包括取消仍在连接/绑定中的隧道）、应用退出（`will-quit`，`reason: 'app-quit'`）。
- 每条隧道**恰好一次** `tunnel-close` 事件，`reason` 见「合同」里的隧道事件。
- 隧道是**应用级**的（不是每窗口/每插件一份）：`ssh.tunnels()` 能看到全部，任何插件也能关闭别人的隧道（可信插件模型）；插件页面关闭/卸载**不会**自动关隧道，必须自己清理。

### `-D` 的 SOCKS5 细节

最小 RFC 1928 实现：仅 `0x05`、**只提供无认证**（`0x00`，不实现用户名/密码）、**只支持 CONNECT**（BIND / UDP ASSOCIATE 回 `0x07`），支持 IPv4 / 域名 / IPv6 三种 ATYP。

- 握手：缓冲上限 **512 B**、超时 **10s**；CONNECT 之后、SSH 通道打开之前客户端最多可先发 **1 MiB**（多出的回 `GENERAL_FAILURE` 并断开），防止本地客户端在等 SSH 回包时把主进程内存撑大。
- 失败映射成 RFC 回复码：`ECONNREFUSED`→5、`ENETUNREACH`→3、`EHOSTUNREACH`→4、`ETIMEDOUT`（含 10s 转发超时）→6，其余失败→1；被目的地策略拒绝→2。
- **无认证是刻意的**：监听只在回环，且代理里的字节本来就在已认证的 SSH 会话边界内。**残留风险**：隧道打开期间，同一台机器上的其他本地进程/用户也能用这个回环代理（这正是「本机回环代理」的含义）；不需要时请尽快 `closeTunnel`。

### 目标策略

- **SSH 主机**照常过网络策略 + 用户授权 + 主机密钥校验。
- `-L` 的 `remoteHost` 与 `-D` 的 SOCKS 目标**由远端解析/连接**，本地 SSRF 判定不适用。
- 唯一的本地目的地检查是**字面量云元数据地址**：`assertDestination` 用 `classifyAddress` 判定为 `metadata` 时拒绝——`-L` 在每次转发前检查（该连接被断开，隧道仍在），`-D` 在 CONNECT 时检查并回 `0x02`。域名/主机名不本地解析，所以「域名解析到元数据地址」拦不住（见「已知边界」）。

## 已知边界

- **不读 `~/.ssh/config`**：主机别名、`ProxyJump`、`IdentityFile`、`Include`、`Host *` 选项都不生效；认证只用 ssh-agent（`SSH_AUTH_SOCK`）+ `~/.ssh/{id_ed25519,id_ecdsa,id_rsa,id_dsa}` 里第一个可用者。这是从系统 `ssh` 换到 `ssh2` 换来的代价；要恢复需要在宿主里实现一份 config 解析（未做）。
- **不支持密码 / 键盘交互认证**：类型里**没有** password / privateKey 字段，宿主也不接受任何凭证入参。
- **池内连接可能已被对端关掉**：复用前无法探测半开连接（ssh2 没有可靠的 `isAlive`），空闲连接失效时**那一次调用会失败**；keepalive（15s × 3）会在约 45s 内发现并把它移出池，下一次调用重连。交互式终端仍独占一条连接，直到 `shellClose` 或远端退出。
- **输出有界**：单次 `shellWrite` ≤64 KiB；exec 输出默认 1 MiB、上限 4 MiB（`truncated` 上报）。
- **SFTP 不递归**：`sftpList` 只列一层；没有 `rm -r`、没有递归上传下载；`sftpRemove` 只能删空目录；`sftpRename` 默认拒绝覆盖。
- **超时**：exec/SFTP 单次调用默认 30s（可调到 10min）；连接握手 20s；每个 `sftp*` 协议操作另有 60s 硬超时（否则一个不回包的服务器会让 IPC 永远挂着）。
- **授权粒度是 `user@host:port` + 操作类别 +（对 `-L`）目标地址 + 本次运行**：同一主机上同类别操作的后续调用不再询问（例如 exec 之后继续 exec，或对同一目标再开一条 `-L`）；**第一次开终端、第一次建隧道、以及同一主机上每一个新的 `-L` 目标都一定会单独确认**。
- **不支持反向转发（`-R`）**：故意不做——它会把本机服务发布给远端服务器；宿主只提供 `-L` / `-D`。
- **`-D` 只有无认证 CONNECT**：没有 BIND / UDP ASSOCIATE / SOCKS 用户名密码认证；打开期间本机其他进程/用户也能用这个回环代理。
- **元数据防护只对字面量生效**：隧道目标由远端解析，本地只能拒绝 IP 字面量；「域名解析到元数据地址」不在本地拦截范围。
- **隧道不自动重开**：SSH 传输断开 → `tunnel-close`，插件要自己决定是否重开；转发通道失败不重试。
- **隧道是应用级、且必须由插件关闭**：插件崩溃/页面关闭不会自动关隧道；只有 `closeTunnel`、`forget`、退出应用会。
- **凭据轮换不关已打开的隧道 / pty 终端**：`ssh.credentialsSet` / `credentialsRemove` 只让**池内连接**失效（下一次调用重新认证）；已建立的隧道和终端沿用原传输，直到自己关闭。
- **`ssh.forget` 关隧道但不关交互式终端**：终端是交互会话；撤销主机只影响池连接和隧道（既有行为）。
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

// 4) 本地端口转发（ssh -L）：把 127.0.0.1:<localPort> 当作远端内网地址用
//    目标由远端解析，所以 db.internal 可以是只有服务器能访问的内网名
if (!desktop.has('ssh.tunnelOpen')) return <p>需要较新的桌面客户端</p>
const tunnel = await desktop.ssh.tunnel({
    host, user, kind: 'local', remoteHost: 'db.internal', remotePort: 5432, label: 'orders-db',
})
const offTunnel = desktop.ssh.onTunnel((event) => {
    if (event.tunnelId !== tunnel.tunnelId) return
    offTunnel()
    // 'closed' 是自己关的；其余情况说明隧道没了（SSH 断开 / 被撤销 / 应用退出），提示用户或重开
})
const db = await pg.connect({ host: tunnel.localHost, port: tunnel.localPort })
// ...用完务必关闭：不关就会一直监听，直到撤销主机或退出应用
await db.end()
await desktop.ssh.closeTunnel({ tunnelId: tunnel.tunnelId })

// 5) 动态 SOCKS5 代理（ssh -D）：把支持 SOCKS5 的客户端指向 127.0.0.1:<localPort>
const proxy = await desktop.ssh.tunnel({ host, user, kind: 'dynamic', label: 'bastion-proxy' })
// 例：curl --socks5-hostname 127.0.0.1:<proxy.localPort> https://internal.example/
// 用完同样 closeTunnel；桌面端其他插件/本机进程在打开期间也能用这个代理
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

在调用侧选凭据：`ssh.exec` / `sftp*` / `shellOpen` / `tunnelOpen` 都接受可选的 **`credentialId`**，不传就用该目标的凭据。

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
pnpm test:ssh        # 391 项：67 连接池 + 81 协议/契约/凭据 + 123 SOCKS5 + 105 隧道引擎 + 15 打包
```

- **契约与信任（纯函数）**：目标 / 命令 / 路径 / 会话校验、`known_hosts` 解析与匹配（明文、逗号列表、hash 形式、非 22 端口）、严格 / accept-new / 记住后换钥的判定、指纹格式（`SHA256:base64`）、凭证发现；省略 `user` 时回退到本机账号。
- **连接池（纯函数 + 真实服务器）**：key 归一（`user@host:port` + 策略）、复用与并发去重、lease 未归还不回收、空闲到期回收、坏连接 / SFTP 通道被关后的重建、**握手途中失效（凭据轮换 / `forget` 走的就是这个 `invalidate`）**、超上限并发突发、LRU 上限、`dispose`；以及真实 `ssh2.Server` 上「两次 exec 只建一条连接」「两次 `sftpList` 只开一次 SFTP 子系统」「空闲后服务端观察到连接关闭」。
- **协议（真实 ssh2 服务器）**：测试在进程内起一个 `ssh2.Server`（随机端口）跑真实协议——主机密钥校验通过 / 失败（失败时**确认没有发生认证尝试**）、exec 的输出与退出码、**pty 终端的双向数据与 window-change resize**、SFTP 分页 `READDIR`（以 `SSH_FX_EOF` 结束）、`stat`、递归 `mkdir`、`rename`（含拒绝覆盖）、上传 / 下载 / 删除。
- **隧道引擎（真实 ssh2 服务器）**：`ssh2.Server` 的 `tcpip`（`direct-tcpip`）处理器接到真实回环 echo 服务，验证 `-L` 双向转发、`-D` 通道接入、回环绑定与真实端口回填、`localPort` 指定/占用失败、只建一条独占连接、并发连接数上限 64 / 隧道总数上限 8（含 in-flight 计数）、转发超时不挂死、`assertDestination` 拒绝时不建通道、SSH 断开 / 错误 / 关闭 / `dispose` 各广播**恰好一次** `tunnel-close`、`closeForTarget` 只匹配目标且在打开途中撤销会取消、参数（kind / 端口 / 目标 / label / id）校验，以及**真实 `negotiateSocks5` → 真实引擎 → 真实 SSH 连接**的组合用例（SOCKS5 握手/CONNECT/回显、拒绝转发的回复码、关闭事件）。
- **SOCKS5（真实回环 TCP wire-level）**：原始字节客户端驱动真实 `net.Server`——无认证方法协商、IPv4 / 域名 / IPv6 CONNECT、`BIND`/`UDP`/非法 ATYP/RSV 的 RFC 回复码、ECONNREFUSED/ENETUNREACH/EHOSTUNREACH/ETIMEDOUT → 5/3/4/6、目的地策略拒绝 → 2、握手逐字节拆分、512 B 握手上限、10s 超时、CONNECT 后先发字节的回放与 1 MiB 上限、半关闭/关闭 socket 时 promise 一定结算。
- **凭据**：加密存储的读/写/移除、**列表不含密文或明文字段**、按目标覆盖时 `id` 不变、无 keychain 时拒绝保存、
  PEM 校验、私钥+口令往返；以及两条真实协议用例——存了密码能连上 `password` 服务器、同一份密码也能应答
  **只有 keyboard-interactive** 的服务器（PAM 风格），还有没有凭据时那句「去哪儿加凭据」的报错。
- **打包**：物化的依赖树能从产物布局里被 `require` 到，且可选原生包被跳过。
