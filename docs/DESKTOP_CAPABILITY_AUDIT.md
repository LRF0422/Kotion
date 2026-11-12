# Desktop 内核能力面审计（只读）

> 审计对象：`desktop` 能力桥的**全部能力**（契约 → preload → 主进程 → 渲染端桥 → 文档）。
> 语言：中文。**本文件是审计报告，不改任何代码**；所有结论均可按文中给出的 `file:line` 复现。

## 0. 快照、方法与复现

| 项 | 值 |
| --- | --- |
| 快照时间 | 2026-11-10 16:24–16:32 CST |
| 工作区 HEAD | `656dc92c`（`feat(plugin-studio): AI 图标先草稿预览…`） |
| 能力总数 | **103**（`DesktopCapability` union 103 条 = `DesktopCapabilityContract` 103 条 = 主进程注册 103 条） |
| preload 通道数 | **106** = 103 + 宿主内部 3 条（`dialog.confirm.*`） |
| 未实测项 | 所有「运行时行为」结论都来自源码阅读；标注「未实测」的条目没有启动应用验证 |

**并发写入声明（重要，影响行号）**：审计期间工作区正被其它协作者修改，以下两个事实在快照内发生了：

1. `packages/common/src/core/desktop-bridge.ts` 在 16:26:08 从 **2018 行的单文件契约**变成 **5 行转发壳**（`export * from './desktop'`），契约拆到 `packages/common/src/core/desktop/*.ts`（19 个文件）。`git show HEAD:` 里的版本是 1902 行 / 73,244 B，说明被拆前的 2018 行版本本身也是未提交改动。
2. `docs/PLUGIN_STUDIO.md` 与 `packages/plugin-plugin-studio/src/skills/plugin-authoring.ts` 在 16:26:58 / 16:27:53 被改（新增 `getDesktopCapability` 相关描述，但 `studio-tools.ts` 尚未实现该工具，见 §5.2）。

因此本报告的行号以**快照时刻的工作区**为准；契约侧同时给出「拆分后文件:行（↑）」与「HEAD 单文件行（↓）」的换算关系：
`HEAD 行号 = 当前 contract.ts 行号 + 1743`（首条 `system.info`：`contract.ts:36` ↔ `desktop-bridge.ts:1779`；末条 `storage.namespaces`：`contract.ts:199` ↔ `1942`，偏移恒定）。

**复现用命令**（全部只读，未跑 build / install / 测试）：

```bash
# 1) 三份清单是否一致（union / contract / preload / 主进程注册）
node -e '...'                     # 见下文各节的等价 grep；本次用 grep + node 逐行比对

# 2) union vs contract vs preload
grep -c "^    | '" packages/common/src/core/desktop/capabilities.ts      # 103
grep -cE "^    '[a-z]+\.[A-Za-z.]+':" packages/common/src/core/desktop/contract.ts  # 103
grep -cE "^  '[a-z]+\.[A-Za-z.]+',$" apps/desktop/src/preload/index.ts   # 106

# 3) 主进程注册点（6 个文件，含动态 handle 的调用点）
grep -rnE "ipcMain\.handle\('desktop:|^\s*handle\('" \
  apps/desktop/src/main/{ipc.ts,capabilities/handlers.ts,ssh/index.ts,storage/index.ts,plugin-dev/index.ts,confirm/index.ts}
```

审计口径（三层对齐）：**契约声明（`capabilities.ts` + `contract.ts`）→ 传输白名单（preload）→ 执行（主进程 handler + 门禁）→ 消费（renderer bridge / `desktop.invoke`）→ 说明（docs）**。

### 0.1 本次跟进（Lead 追加，2026-11-10）

本报告提出的「模块划分」与「agent 发现面」在本轮已落地，审计里的行号按上方换算规则仍可复现：

- ✅ **契约按域拆分**：`packages/common/src/core/desktop/*`（`capabilities.ts` / `contract.ts` / 每域一个模块），
  `desktop-bridge.ts` 只剩 `export * from './desktop'`（旧 import 不变）。
- ✅ **能力目录 `desktop/catalog.ts`**：103 条全量，含 group / summary / guards / access / example / notes；
  `@kn/common` 根导出，插件开发台直接读活宿主的那一份。
- ✅ **漂移检查**：`pnpm --filter @kn/common check:desktop-capabilities`（数百项断言）把
  union ⇄ contract ⇄ preload（含 3 条宿主内部 `dialog.confirm.*` 白名单）⇄ 主进程 handler ⇄ catalog 钉在一起。
- ✅ **agent 发现面**：`listDesktopCapabilities` 支持中文意图搜索 / group / `detail: summary`，
  返回 `uncatalogued` / `unavailable`；新增 `getDesktopCapability({ names })`（摘要 + 门禁 + 调用式 +
  params/result + 源码内联声明 + `readMore`）；`readHostApiFile({ symbol })` 只读一个声明；
  `dev.hostApi` 增加 `symbol` / `symbols` / `members` 三种精确模式。`typedGroups` 也不再硬编码，
  覆盖 net/browser/secrets/notifications/background/storage/ssh/dev 八个组。
- ⏳ **未处理（建议单独立项）**：§1 的三条 P0——`credentials.*` 对插件全开（需要一条宿主内部通道
  才能不给插件）、`ssh.shell*` 缺窗口归属（对照 `net.socket*` 补 owner 校验 + 事件定向）、
  fs 白名单缺 `realpath`（25 条能力受牵连，且要同时处理 macOS `/var` → `/private/var` 的合法软链，
  避免把正常路径判成越界）。


---

## 1. 结论摘要（10 条，按严重度排序）

| # | 结论（一句话） | 严重度 | 证据 |
| --- | --- | --- | --- |
| 1 | `credentials.*` 4 条能力对插件**完全敞开且无任何门禁**，`credentials.load` 直接返回用户记住的**明文密码**；而契约注释与 agent 侧能力说明都写着「属于应用外壳，插件不应读取」——承诺与实现相反。 | **P0** | 契约：`packages/common/src/core/desktop/credentials.ts:9-13`；白名单：`apps/desktop/src/preload/index.ts:100-103`；实现（无门禁）：`apps/desktop/src/main/ipc.ts:546-559`；agent 侧说明：`packages/plugin-plugin-studio/src/studio-tools.ts:715` |
| 2 | SSH 交互终端**没有窗口归属**：`ssh.shells` 列出全部窗口的终端、`ssh.shellWrite/shellResize/shellClose` 只按 `sessionId` 查找、`shell-data` 广播给**所有**窗口，所以任何窗口里的插件都能读到并写入别人的终端。同一代码库的 `net.socket*` 有严格 owner 校验，两者安全模型不一致。 | **P0** | `apps/desktop/src/main/ssh/index.ts:223-227`（broadcast 全窗口）、`:580-585`（无 owner 校验的 write）、`:587-595`、`:611-622`；对照 `apps/desktop/src/main/capabilities/handlers.ts:244-250,282` |
| 3 | fs 白名单只做 `path.resolve` 后的**字面前缀比较**，没有 realpath，白名单目录内的符号链接可把读写删带出白名单；同一个 `assertAllowedPath` 被 `fs.*`(9)、`ssh.put/get`、`dev.*`(13)、`notification.show` 复用，所以影响面是 **25 条能力**（`fs.*` 9 + `ssh.put/get` 2 + `dev.*` 13 + `notification.show` 1）。 | **P0** | `apps/desktop/src/main/ipc.ts:61-76`（`isWithin` 纯字符串）；注入点 `:190,:203,:221`；`ssh/index.ts:473`；`apps/desktop/src/main/plugin-dev/index.ts:96-218` |
| 4 | preload 把 3 条**宿主内部**通道（`dialog.confirm.context/confirmResult/confirmResize`）和 103 条插件能力放在同一个数组，renderer 只做 `as DesktopCapability[]` 断言，于是 `desktop.capabilities` / `desktop.has()` 会把它们当真：清单不可信、agent 会看到 3 个「能力」。 | **P1** | `apps/desktop/src/preload/index.ts:75-81`；`packages/core/src/desktop/bridge.ts:468`；union 里没有它们：`packages/common/src/core/desktop/capabilities.ts:15-134`；消费点 `studio-tools.ts:1980-1997` |
| 5 | 契约侧已按域拆好（19 文件 / 2,098 行），但 **main / preload / renderer-bridge 三侧没拆**：`main/ipc.ts` 750 行仍混 12 个域，`capabilities/handlers.ts` 807 行混 5 个族，`packages/core/src/desktop/bridge.ts` 499 行混 8 个组 + 能力探测。 | **P1** | `packages/common/src/core/desktop/index.ts:1-33`；`apps/desktop/src/main/ipc.ts`（域区间见 §3.1）；`apps/desktop/src/main/capabilities/handlers.ts`（§3.2）；`packages/core/src/desktop/bridge.ts` |
| 6 | **7 个域在现行文档里零覆盖**（system / dialog / fs / window / app / capture / credentials），唯一写到它们的是 2026-09-16 的**过期设计稿**，而稿里的形状与实现相反（稿有 `clipboard.*`、`shell.openExternal`、`fs.readFile → string`，实现是 `shell.browserOpen`、`fs.readFile → DesktopFileResult<string>`）。 | **P1** | 零覆盖：全 docs 树 grep 无命中（§2 矩阵「文档覆盖」列）；过期稿：`docs/superpowers/specs/2026-09-16-desktop-capabilities-sdk-design.md:1-3`（自称「设计稿（待评审）」）、`:120-155` |
| 7 | 失败约定**5 套并存**：`DesktopFileResult`（inline `{data|success|error}`）、`DesktopStorageEnvelope`（`{ok,value}|{ok,code,message}`）、`DesktopSecretMutationResult`（`{ok,metadata,error,code}`）、`notification.show` 的 `{shown,error}`、以及其余一律 reject。 | **P1** | `desktop/fs.ts:19-24`；`desktop/storage-envelope.ts`；`desktop/secrets.ts:71-80`；`capabilities/handlers.ts:610-693`；`ipc.ts:611-707` |
| 8 | agent 的能力发现面只有「名字 + 12 条族级说明 + 3 个类型化组」：`net.`/`shell.`/`notification.`/`background.` 四族**没有任何说明**，`typedGroups` 硬编码只列 `dev/ssh/storage`，所以 `desktop.net/browser/secrets/notifications/background` 的方法对 agent 不可见。 | **P1** | `studio-tools.ts:706-719`（12 个 key，缺 4 族）、`:2007`（`['dev','ssh','storage']`）；实际存在的组：`packages/core/src/desktop/bridge.ts:469-476` |
| 9 | 网络策略有**两份实现**，而 `ipc.ts` 的注释自己说「再写一份就是门禁悄悄漂移的方式」：`ipc.ts` 导出 `assertTargetAllowed` / `assertBareHostAllowed`，`ssh/index.ts` 另有一份私有复制。 | **P1** | 注释与实现：`apps/desktop/src/main/ipc.ts:86-144`；私货：`apps/desktop/src/main/ssh/index.ts:241-264`；判定层：`apps/desktop/src/main/net-policy.ts:127-175` |
| 10 | 同一概念**两套规则**：`storage.secret*` 的 namespace ≤96 字符、必须 `plugin.`/`app.` 前缀、允许下划线；`storage.*` 的 namespace ≤120 字符、**不允许**下划线。 | **P2** | `apps/desktop/src/main/capabilities/secret-params.mjs:28,33`；`packages/common/src/storage/types.ts:69,87` |

> 另有一条只影响可维护性、但会误导后来者：代码里两处引用 `docs/PLUGIN_SECRETS.md`，该文件**不存在**（`docs/` 只有 `PLUGIN_CONFIG_SECRETS.md`）。见 §4.5-DOC1。

---

## 2. 能力清单矩阵（103 条，全部）

**读法**

- **preload**：103 条全部在 `apps/desktop/src/preload/index.ts` 白名单内（106 − 3 条宿主内部通道），本列逐行标 ✓ 以便核对；无 ✗ 行 —— 这是本次审计的结论之一，不是省略。
- **契约列**：`contract.ts:行` 是拆分后位置；HEAD 单文件行号 = 该行 + 1743。
- **门禁缩写**：`网`=网络策略(SSRF) `确`=宿主确认弹窗 `白`=fs 白名单 `钥`=安全存储/safeStorage `窗`=窗口归属校验 `交`=能力本身即用户交互 `感`=明文敏感值出宿主 `逆`=不可逆或全局副作用 `—`=无门禁。
- **文档覆盖**：`DCP:` = `docs/DESKTOP_CAPABILITIES.md`；`SSH:` = `docs/SSH.md`；`STG:` = `docs/STORAGE.md`；`PST:` = `docs/PLUGIN_STUDIO.md`；`❌` = 现行文档无覆盖；`spec:` = 仅出现在**过期设计稿**（不算覆盖）。

### 2.1 system / http / net.policy（5）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `system.info` | system | `void → DesktopAppInfo`（`contract.ts:36`） | `ipc.ts:229-236` | ✓ | `invoke` | — | ❌（spec:126,137） |
| `system.paths` | system | `void → DesktopPaths`（`:37`） | `ipc.ts:238-244` | ✓ | `invoke` | — | ❌（spec:126,138） |
| `http.request` | http | `DesktopHttpRequest → DesktopHttpResponse`（`:38`） | `ipc.ts:415-531`（解码助记在 `capabilities/http-body.mjs`） | ✓ | `invoke` | 网（每跳重判，最多 5 跳）+ 上限：timeout 1s–120s、resp 1KiB–20MiB | DCP:233（§6 二进制响应）；DCP:20 架构图 |
| `net.policy.get` | net | `void → DesktopNetPolicy`（`:44`） | `ipc.ts:538` | ✓ | `invoke` | — | DCP:20,87 只出现族名 `net.policy.*`，**无专节、无能力名** |
| `net.policy.set` | net | `Partial<DesktopNetPolicy> → DesktopNetPolicy`（`:46`） | `ipc.ts:540` | ✓ | `invoke` | 无确认即可放宽 SSRF（`net-policy-store` 落盘） | 同上 |

### 2.2 net.socket（4）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `net.socketOpen` | net | `DesktopNetSocketOpenOptions → DesktopNetSocketSession`（`:48`） | `capabilities/handlers.ts:280-368` | ✓ | `desktop.net.open`（`bridge.ts:307`） | 网 → 确（每 `label` 每 run 一次，`handlers.ts:264-278`）→ 窗（每窗口 16 条，`:282-284`） | DCP:47-92 |
| `net.socketWrite` | net | `…WriteOptions → boolean`（`:49`） | `handlers.ts:370-377` | ✓ | `desktop.net.write`（`:308`） | 窗（`ownedSocket`，`:244-248`）+ 单次 ≤1MiB（`socket-params.mjs:25`） | DCP:47-92 |
| `net.socketClose` | net | `…CloseOptions → boolean`（`:50`） | `handlers.ts:379-396` | ✓ | `desktop.net.close`（`:309`） | 窗（`ownedSocket`） | DCP:47-92 |
| `net.socketSessions` | net | `void → DesktopNetSocketSession[]`（`:51`） | `handlers.ts:406` | ✓ | `desktop.net.sessions`（`:310`） | 窗（只列本窗口） | DCP:47-92 |

### 2.3 shell（5）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shell.browserOpen` | shell | `DesktopBrowserOpenOptions → DesktopBrowserOpenResult`（`:53`） | `handlers.ts:457-485` | ✓ | `desktop.browser.open`（`bridge.ts:336`） | 确（每 origin 每 run）+ 仅 http/https（`:472-474`） | DCP:94-135 |
| `shell.oauthStart` | shell | `DesktopOAuthStartOptions? → DesktopOAuthCallbackSession`（`:54`） | `handlers.ts:487-538` | ✓ | `desktop.browser.startOAuth`（`bridge.ts:358`） | 窗（owner）+ 只绑 127.0.0.1 + 并发 4（`oauth-callback.mjs:36`） | DCP:94-135 |
| `shell.oauthWait` | shell | `{sessionId} → DesktopOAuthCallbackResult`（`:56`） | `handlers.ts:540-546` | ✓ | `desktop.browser.waitForOAuth`（`:359`）/ `oauth()` 一步式（`:343-357`） | 窗（`ownedOAuth`，`:442-445`） | DCP:94-135 |
| `shell.oauthSessions` | shell | `void → DesktopOAuthCallbackSession[]`（`:57`） | `handlers.ts:548-554` | ✓ | `desktop.browser.oauthSessions`（`:361`） | 窗（只列本窗口未完成） | DCP:94-135 |
| `shell.oauthCancel` | shell | `{sessionId} → boolean`（`:58`） | `handlers.ts:556-562` | ✓ | `desktop.browser.cancelOAuth`（`:362`） | 窗（`ownedOAuth`） | DCP:94-135 |

### 2.4 storage.secret（8）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `storage.secretAvailable` | secrets | `void → boolean`（`:60`） | `handlers.ts:586` | ✓ | `desktop.secrets.available`（`bridge.ts:390`） | 钥（探测 backend≠`basic_text`，`:568-580`） | DCP:137-166 |
| `storage.secretSet` | secrets | `DesktopSecretSetOptions → DesktopSecretMutationResult`（`:61-64`） | `handlers.ts:587` → `capabilities/secrets.mjs` | ✓ | `desktop.secrets.set`（`:391`） | 钥（无 keychain 拒写）+ namespace/key/大小校验（`secret-params.mjs:22-33`） | DCP:139（名字）、DCP:155-166（语义） |
| `storage.secretGet` | secrets | `DesktopSecretKeyOptions → DesktopSecretEntry \| null`（`:65`） | `handlers.ts:588` | ✓ | `desktop.secrets.get`（`:392`） | 感（唯一返回明文的接口） | DCP:139、DCP:162 |
| `storage.secretHas` | secrets | `…KeyOptions → boolean`（`:66`） | `handlers.ts:589` | ✓ | `desktop.secrets.has`（`:393`） | — | DCP:139（仅能力名罗列） |
| `storage.secretList` | secrets | `{namespace} → DesktopSecretMetadata[]`（`:67`） | `handlers.ts:590` | ✓ | `desktop.secrets.list`（`:394`） | 元数据 only | DCP:139、DCP:150,162 |
| `storage.secretRemove` | secrets | `…KeyOptions → DesktopSecretMutationResult`（`:68`） | `handlers.ts:591` | ✓ | `desktop.secrets.remove`（`:395`） | 逆（删除） | DCP:139（仅能力名罗列） |
| `storage.secretClear` | secrets | `{namespace} → number`（`:69`） | `handlers.ts:592` | ✓ | `desktop.secrets.clear`（`:396`） | 逆（整 namespace 清空）+ 无确认 | DCP:139、DCP:304 边界 |
| `storage.secretNamespaces` | secrets | `void → DesktopSecretNamespaceInfo[]`（`:70`） | `handlers.ts:593` | ✓ | `desktop.secrets.namespaces`（`:397`） | — | DCP:139、DCP:162 |

### 2.5 notification（4）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `notification.available` | notification | `void → boolean`（`:72`） | `handlers.ts:600-608` | ✓ | `desktop.notifications.available`（`bridge.ts:421`） | — | DCP:168-196 |
| `notification.show` | notification | `DesktopNotificationOptions → DesktopNotificationResult`（`:73-76`） | `handlers.ts:610-693` | ✓ | `desktop.notifications.show`（`:422`） | 白（`iconPath` 走同一白名单，`:616-625`）+ 无窗隔离（全局 32 条上限，`:635-641`）+ 点击会 focus 窗口（`:670-675`） | DCP:168-196 |
| `notification.setBadge` | notification | `{count?,text?} → boolean`（`:77`） | `handlers.ts:695-718` | ✓ | `desktop.notifications.setBadge`（`:423`） | 全局（跟窗口无关；win32 取 `getAllWindows()[0]`） | DCP:168-196 |
| `notification.clear` | notification | `void → boolean`（`:78`） | `handlers.ts:720-724` | ✓ | `desktop.notifications.clear`（`:424`） | 逆/全局（清掉**全应用**通知，可清别的插件的） | DCP:168-196 |

### 2.6 background（4）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `background.schedule` | background | `DesktopBackgroundScheduleOptions → DesktopBackgroundTask`（`:80-83`） | `handlers.ts:781` → `capabilities/scheduler.mjs` | ✓ | `desktop.background.schedule`（`bridge.ts:448`） | 窗（每窗口一个 scheduler，`:754-779`）+ 每窗口 32 任务（`scheduler.mjs:32`） | DCP:198-231 |
| `background.list` | background | `void → DesktopBackgroundTask[]`（`:84`） | `handlers.ts:782` | ✓ | `desktop.background.list`（`:449`） | 窗 | DCP:198-231 |
| `background.cancel` | background | `{taskId} → boolean`（`:85`） | `handlers.ts:783-785` | ✓ | `desktop.background.cancel`（`:450`） | 窗 | DCP:198-231 |
| `background.cancelAll` | background | `{scope?:'all'} → number`（`:86`） | `handlers.ts:786-792` | ✓ | `desktop.background.cancelAll`（`:451`） | 窗（`scope` 参数被显式忽略，`:788-790`） | DCP:198-231 |

### 2.7 capture（4）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `capture.sources` | capture | `{types?,thumbnailWidth?} → DesktopCaptureSource[]`（`:87-90`） | `ipc.ts:249-279` | ✓ | `invoke` | 交（macOS TCC）+ 缩略图 64–640 夹取 | ❌ |
| `capture.selectRegion` | capture | `{displayId?,locale?} → DesktopRegionResult \| null`（`:91-95`） | `ipc.ts:299-373` | ✓ | `invoke` | 交（全屏覆盖层）+ 窗（regionSessions 按 sender） | ❌ |
| `capture.region.context` | capture | `void → DesktopRegionContext`（`:96`） | `ipc.ts:375-379` | ✓ | `invoke` | 窗（**仅覆盖层 webContents** 能读到，`:376-377`） | ❌ |
| `capture.region.submit` | capture | `DesktopCaptureRect \| null → void`（`:97`） | `ipc.ts:381-410` | ✓ | `invoke` | 窗（同上）+ 裁剪在主进程完成，整帧不过 IPC | ❌ |

### 2.8 dialog（4）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dialog.openFile` | dialog | `DesktopOpenFileOptions? → DesktopDialogFileResult`（`:98`） | `ipc.ts:562-572` | ✓ | `invoke` | 交 + 选中路径进 fs 白名单（`grantPath`，`:570`，**进程级、不过期、跨窗口**） | ❌（spec:128,140） |
| `dialog.openFolder` | dialog | `…FolderOptions? → DesktopDialogFolderResult`（`:99`） | `ipc.ts:574-584` | ✓ | `invoke` | 交 + `grantPath`（`:582`） | ❌（spec:128） |
| `dialog.saveFile` | dialog | `…SaveFileOptions? → DesktopDialogSaveResult`（`:100`） | `ipc.ts:586-596` | ✓ | `invoke` | 交 + `grantPath`（`:594`）+ 默认目录 downloads | ❌（spec:128,141） |
| `dialog.message` | dialog | `DesktopMessageOptions → {response:number}`（`:101`） | `ipc.ts:598-608` | ✓ | `invoke` | 交（模态）+ 无窗归属（弹在默认父窗口） | ❌（spec:128,142） |

### 2.9 fs（9）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fs.readFile` | fs | `{path,encoding?} → DesktopFileResult<string>`（`:102`） | `ipc.ts:611-620` | ✓ | `invoke` | 白（`assertAllowedPath`，无 realpath → 见 P0-3）；失败 inline | ❌（spec:129,143） |
| `fs.writeFile` | fs | `{path,data,encoding?} → DesktopFileResult`（`:103`） | `ipc.ts:622-632` | ✓ | `invoke` | 白 + 逆（覆盖写，无确认） | ❌（spec:129,144） |
| `fs.exists` | fs | `{path} → boolean`（`:104`） | `ipc.ts:634-636` | ✓ | `invoke` | 白（**越界时 reject，不返回 inline 错误**——与同族其它 8 条不一致） | ❌ |
| `fs.mkdir` | fs | `{path} → DesktopFileResult`（`:105`） | `ipc.ts:638-645` | ✓ | `invoke` | 白（`ensureDir` 递归） | ❌（spec:130） |
| `fs.remove` | fs | `{path} → DesktopFileResult`（`:106`） | `ipc.ts:647-654` | ✓ | `invoke` | 白 + **逆**（递归删除，无确认、无回收站） | ❌（GAP:429 提及） |
| `fs.readdir` | fs | `{path} → DesktopFileResult<DesktopDirEntry[]>`（`:107`） | `ipc.ts:656-670` | ✓ | `invoke` | 白 | ❌（spec:129） |
| `fs.stat` | fs | `{path} → DesktopFileResult<DesktopFileStat>`（`:108`） | `ipc.ts:672-687` | ✓ | `invoke` | 白 | ❌（spec:129） |
| `fs.copy` | fs | `{src,dest} → DesktopFileResult`（`:109`） | `ipc.ts:689-697` | ✓ | `invoke` | 白（**src 与 dest 各自校验**，但仍无 realpath）+ 逆（覆盖） | ❌（spec:130） |
| `fs.move` | fs | `{src,dest} → DesktopFileResult`（`:110`） | `ipc.ts:699-707` | ✓ | `invoke` | 白 + 逆（跨设备时 fs-extra 退化为复制+删除） | ❌（spec:130） |

### 2.10 window / app（5）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `window.setFullScreen` | window | `{value} → void`（`:111`） | `ipc.ts:710-712` | ✓ | `invoke`（事件用 `onFullScreenChange`，`bridge.ts:487-488`） | 窗（sender 窗口） | ❌（spec:134,150） |
| `window.isFullScreen` | window | `void → boolean`（`:112`） | `ipc.ts:714-716` | ✓ | `invoke` | 窗 | ❌（spec:134,151） |
| `window.setTrafficLights` | window | `DesktopTrafficLightPosition → void`（`:113`） | `ipc.ts:733-747` | ✓ | `invoke` | 窗 + 仅 darwin（其它平台静默 no-op） | ❌ |
| `window.toggleDevTools` | window | `void → void`（`:115`） | `ipc.ts:719-724` | ✓ | `invoke` | 窗 + **无确认**（任何插件可开关 DevTools） | ❌（GAP:145 作为宿主内部入口提到） |
| `app.quit` | app | `void → void`（`:117`） | `ipc.ts:729-731` | ✓ | `invoke` | **无任何门禁**：任何插件可退出应用（逆） | ❌ |

### 2.11 credentials（4）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `credentials.available` | credentials | `void → boolean`（`:123`） | `ipc.ts:546` | ✓ | `invoke` | — | ❌ |
| `credentials.load` | credentials | `void → DesktopSavedCredentials \| null`（`:125`） | `ipc.ts:548` | ✓ | `invoke` | **感（明文密码出宿主）+ 无窗归属 + 无调用方校验** → 见 P0-1 | ❌（仅 `studio-tools.ts:715` 一句话） |
| `credentials.save` | credentials | `DesktopSaveCredentialsInput → DesktopSavedCredentials`（`:126`） | `ipc.ts:550-557` | ✓ | `invoke` | 钥 + 逆（可覆盖用户已存密码，无确认） | ❌ |
| `credentials.clear` | credentials | `void → void`（`:128`） | `ipc.ts:559` | ✓ | `invoke` | 钥 + 逆（清空，无确认） | ❌ |

### 2.12 dev（14）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dev.start` | dev | `DevStartOptions → DevSessionStatus`（`:129`） | `plugin-dev/index.ts:93-101` | ✓ | `desktop.dev.start`（`core/desktop/bridge.ts:125-128`） | 白（root）+ 可拉起子进程（唯一允许的是 dev-server） | PST:659 |
| `dev.stop` | dev | `DevStopOptions → boolean`（`:130`） | `plugin-dev/index.ts:103-106` | ✓ | `desktop.dev.stop`（`:129-132`） | 白 | PST:661 |
| `dev.build` | dev | `DevBuildOptions → DevSessionStatus`（`:131`） | `plugin-dev/index.ts:108-116` | ✓ | `desktop.dev.build`（`:133-136`） | 白 | PST:660 |
| `dev.status` | dev | `DevStatusOptions? → DevSessionStatus[]`（`:132`） | `plugin-dev/index.ts:118-122` | ✓ | `desktop.dev.status`（`:137-140`） | 白（可选 root） | PST:662 |
| `dev.logs` | dev | `DevLogsOptions → DevLogEntry[]`（`:133`） | `plugin-dev/index.ts:124-128` | ✓ | `desktop.dev.logs`（`:141-144`） | 白 + limit ≤1000 | PST:663 |
| `dev.scaffold` | dev | `DevScaffoldOptions → DevScaffoldResult`（`:134`） | `plugin-dev/index.ts:130-149` | ✓ | `desktop.dev.scaffold`（`:145-148`） | 白（`parentDir` 可选）+ 名字正则 | PST:664 |
| `dev.list` | dev | `DevListOptions? → DevProjectEntry[]`（`:135`） | `plugin-dev/index.ts:168-172` | ✓ | `desktop.dev.list`（`:149-152`） | 白（`dir` 可选，缺省 userData/plugin-projects） | PST:665 |
| `dev.readFile` | dev | `DevFileOptions → string`（`:136`） | `plugin-dev/index.ts:174-178` | ✓ | `desktop.dev.readFile`（`:153-156`） | 白（**不限于工程目录**，无大小上限） | PST:666 |
| `dev.writeFile` | dev | `DevFileOptions → void`（`:137`） | `plugin-dev/index.ts:180-188` | ✓ | `desktop.dev.writeFile`（`:157-160`） | 白 + 逆（覆盖；参数字段叫 `contents`，与 `fs.writeFile.data` 不一致） | PST:666 |
| `dev.hostApi` | dev | `DevHostApiOptions → DevHostApiResult`（`:138`） | `plugin-dev/index.ts:190-195` | ✓ | `desktop.dev.hostApi`（`:161-164`） | **绕过 fs 白名单**（注释自认，`:190-192`），只读 `<root>/packages` | PST:667 |
| `dev.files` | dev | `DevFilesOptions → DevFilesResult`（`:139`） | `plugin-dev/index.ts:200-204` | ✓ | `desktop.dev.files`（`:165-168`） | 白 | PST:668 |
| `dev.installDependencies` | dev | `DevInstallOptions → DevInstallResult`（`:140`） | `plugin-dev/index.ts:208-218` | ✓ | `desktop.dev.installDependencies`（`:169-172`） | 白 + **可执行包管理器脚本**（无 `--ignore-scripts`，见 GAP §5.3-5） | PST:669 |
| `dev.remove` | dev | `DevRemoveOptions → DevRemoveResult`（`:141`） | `plugin-dev/index.ts:153-156` | ✓ | `desktop.dev.removeProject`（`:173-176`） | 白 + 逆（删目录；判据只是「有没有 package.json」，见 GAP §5.3-3） | PST:670 |
| `dev.deleteFile` | dev | `DevDeleteFileOptions → DevDeleteFileResult`（`:142`） | `plugin-dev/index.ts:160-166` | ✓ | `desktop.dev.deleteFile`（`:177-180`） | 白 + realpath 限定工程内（本族唯一做 realpath 的）+ 逆 | PST:671 |

### 2.13 ssh（22）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ssh.exec` | ssh | `SshExecOptions → SshExecResult`（`:143`） | `ssh/index.ts:462-468` | ✓ | `desktop.ssh.exec`（`core bridge:235`） | 网 + 确(`command`) + 钥（凭据可选）+ 无窗归属 | SSH:36-56 |
| `ssh.put` | ssh | `SshTransferOptions → SshTransferResult`（`:144`） | `ssh/index.ts:471-485` | ✓ | `desktop.ssh.put`（`:236`） | 网 + 确(`transfer`) + **白（localPath，`:473`）** | SSH:41 |
| `ssh.get` | ssh | 同上（`:145`） | `ssh/index.ts:485` | ✓ | `desktop.ssh.get`（`:237`） | 同上 | SSH:41 |
| `ssh.hosts` | ssh | `void → SshGrant[]`（`:146`） | `ssh/index.ts:716-726` | ✓ | `desktop.ssh.hosts`（`:272`） | 只读（**全局**，列所有窗口的授权） | SSH:55,85 |
| `ssh.forget` | ssh | `SshForgetOptions → boolean`（`:147`） | `ssh/index.ts:727-748` | ✓ | `desktop.ssh.forget`（`:273`） | 逆（撤销全部类别 + 关隧道；**任何人可撤销别人的授权**） | SSH:55,74-85 |
| `ssh.sftpList` | ssh | `SshSftpListOptions → SshSftpListResult`（`:148`） | `ssh/index.ts:488-493` | ✓ | `desktop.ssh.list`（`:238`） | 网 + 确(`sftp`) | SSH:42 |
| `ssh.sftpStat` | ssh | `…PathOptions → SshSftpStatResult`（`:149`） | `ssh/index.ts:494-499` | ✓ | `desktop.ssh.stat`（`:239`） | 同上 | SSH:43 |
| `ssh.sftpMkdir` | ssh | `…MkdirOptions → SshSftpMutationResult`（`:150`） | `ssh/index.ts:500-508` | ✓ | `desktop.ssh.mkdir`（`:240`） | 同上 + 逆 | SSH:44 |
| `ssh.sftpRename` | ssh | `…RenameOptions → …`（`:151`） | `ssh/index.ts:509-518` | ✓ | `desktop.ssh.rename`（`:241`） | 同上 + 逆（默认拒覆盖） | SSH:45 |
| `ssh.sftpRemove` | ssh | `…RemoveOptions → …`（`:152`） | `ssh/index.ts:519-527` | ✓ | `desktop.ssh.remove`（`:242`） | 同上 + 逆 | SSH:46 |
| `ssh.shellOpen` | ssh | `SshShellOpenOptions → SshShellSession`（`:153`） | `ssh/index.ts:530-578` | ✓ | `desktop.ssh.shell`（`:243`） | 网 + 确(`shell`) + 独占连接（不进池） | SSH:47,168 |
| `ssh.shellWrite` | ssh | `SshShellWriteOptions → boolean`（`:154`） | `ssh/index.ts:580-585` | ✓ | `desktop.ssh.shellWrite`（`:244`） | **无窗归属**（只按 sessionId）→ P0-2 | SSH:48,186 |
| `ssh.shellResize` | ssh | `SshShellResizeOptions → boolean`（`:155`） | `ssh/index.ts:587-595` | ✓ | `desktop.ssh.shellResize`（`:245`） | 无窗归属 | SSH:49,187 |
| `ssh.shellClose` | ssh | `SshShellTarget → boolean`（`:156`） | `ssh/index.ts:597-609` | ✓ | `desktop.ssh.shellClose`（`:246`） | 无窗归属（可关别人的终端） | SSH:50 |
| `ssh.shells` | ssh | `void → SshShellSession[]`（`:157`） | `ssh/index.ts:611-622` | ✓ | `desktop.ssh.shellSessions`（`:247`） | 无窗归属（列全部窗口） | SSH:51 |
| `ssh.tunnelOpen` | ssh | `SshTunnelOptions → SshTunnelSession`（`:158`） | `ssh/index.ts:626-682` | ✓ | `desktop.ssh.tunnel`（`:260-261`） | 网 + 确(`tunnel` 按目标 / `proxy` 按主机) + 全局上限 8 | SSH:52,108-130 |
| `ssh.tunnelClose` | ssh | `SshTunnelCloseOptions → boolean`（`:159`） | `ssh/index.ts:684-686` | ✓ | `desktop.ssh.closeTunnel`（`:262-263`） | 无窗归属（可关别人的隧道，已在 SSH:130 明示） | SSH:53 |
| `ssh.tunnels` | ssh | `void → SshTunnelSession[]`（`:160`） | `ssh/index.ts:688` | ✓ | `desktop.ssh.tunnels`（`:264`） | 应用级列表 | SSH:54 |
| `ssh.credentialsAvailable` | ssh | `void → boolean`（`:161`） | `ssh/index.ts:691` | ✓ | `desktop.ssh.credentials.available`（`:275`） | 钥 | SSH:221-226 |
| `ssh.credentialsList` | ssh | `void → SshCredentialMetadata[]`（`:162`） | `ssh/index.ts:693` | ✓ | `…credentials.list`（`:276`） | 元数据 only（不含明文） | SSH:221-226 |
| `ssh.credentialsSet` | ssh | `SshCredentialInput → SshCredentialMutationResult`（`:163`） | `ssh/index.ts:694-700` | ✓ | `…credentials.set`（`:277-278`） | 钥 + 感（明文**入**）+ 逆（覆盖同名目标） | SSH:221-226 |
| `ssh.credentialsRemove` | ssh | `{id} → SshCredentialMutationResult`（`:164`） | `ssh/index.ts:701-711` | ✓ | `…credentials.remove`（`:279-280`） | 逆 | SSH:221-226 |

### 2.14 storage（11）

| 能力 | 域 | 契约 params → result | 主进程实现 | preload | 桥 | 门禁 | 文档覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `storage.info` | storage | `void → Envelope<StorageInfo>`（`:165`） | `storage/index.ts:134` | ✓ | `desktop.storage.info()`（`storage-bridge.ts:84`） | 命名空间约定（无强制）；信封错误码 | STG:101 |
| `storage.get` | storage | `{namespace,key} → Envelope<StorageEntry\|null>`（`:166-169`） | `storage/index.ts:136-140` | ✓ | `desktop.storage.get()`（`:90`） | 同上 | STG:101 |
| `storage.getMany` | storage | `{namespace,keys} → Envelope<StorageEntry[]>`（`:170-173`） | `storage/index.ts:142-146` | ✓ | `desktop.storage.getMany()`（`:94`） | 同上 | STG:101 |
| `storage.set` | storage | `{namespace,key,value}&StorageSetOptions → Envelope<StorageEntry>`（`:174-177`） | `storage/index.ts:148-157` | ✓ | `desktop.storage.set()`（`:101`） | 同上 + CAS(`ifRev`)/TTL | STG:101 |
| `storage.delete` | storage | `{namespace,key} → Envelope<boolean>`（`:178-181`） | `storage/index.ts:159-163` | ✓ | `desktop.storage.delete()`（`:107`） | 同上 + 逆 | STG:101 |
| `storage.keys` | storage | `{namespace,prefix?} → Envelope<string[]>`（`:182-185`） | `storage/index.ts:165-169` | ✓ | `desktop.storage.keys()`（`:111`） | 同上 | STG:101 |
| `storage.list` | storage | `StorageListOptions → Envelope<StorageListResult>`（`:186`） | `storage/index.ts:171-180` | ✓ | `desktop.storage.list()`（`:115`） | 同上 + cursor/limit ≤1000 | STG:101 |
| `storage.count` | storage | `{namespace,prefix?} → Envelope<number>`（`:187-190`） | `storage/index.ts:182-186` | ✓ | `desktop.storage.count()`（`:120`） | 同上 | STG:101 |
| `storage.clear` | storage | `{namespace,prefix?} → Envelope<number>`（`:191-194`） | `storage/index.ts:188-192` | ✓ | `desktop.storage.clear()`（`:127`） | 同上 + 逆（整 namespace） | STG:101 |
| `storage.batch` | storage | `{operations} → Envelope<StorageBatchResult>`（`:195-198`） | `storage/index.ts:194-198` | ✓ | `desktop.storage.batch()`（`:133`） | 同上（原子） | STG:101 |
| `storage.namespaces` | storage | `void → Envelope<string[]>`（`:199`） | `storage/index.ts:200` | ✓ | `desktop.storage.namespaces()`（`:137`） | 同上（**列出全应用所有 namespace**） | STG:101 |

**矩阵小计**：103 行 = union 103（`capabilities.ts:16-133`）= contract 103（`contract.ts:36-199`）= 主进程注册 103。preload ✓ 103/103。

文档覆盖精确统计（以「能力名是否出现在 `docs/*.md` 现行文档」为准，设计稿不算）：

- **有能力名 + 有语义说明：73 条** —— net.socket 4（DCP:49）、shell 5（DCP:96）、storage.secret 8（DCP:139 罗列 + §3 语义）、notification 4（DCP:170）、background 4（DCP:200）、ssh 18（SSH:39-56）+ ssh.credentials 4（SSH:221-226）、dev 14（PST:659-671）、storage 11（STG:101，一句清单 + §3 语义）。
- **❌ 无覆盖：28 条** —— `system.*` 2、`capture.*` 4、`dialog.*` 4、`fs.*` 9、`window.*` 4、`app.quit` 1、`credentials.*` 4（其中 `fs.*` 的「白名单」概念在 DCP:192 被顺带提过一句、`credentials.*` 在 `studio-tools.ts:715` 有一句话，但都没有能力名与签名）。
- **族名有、能力名无：2 条** —— `net.policy.get/set`（DCP:20,87 只写 `net.policy.*`）。

---

## 3. 模块划分现状与建议

### 3.1 `apps/desktop/src/main/ipc.ts`（750 行）混了 12 个域

| 行区间 | 内容 | 归属域 |
| --- | --- | --- |
| 36–76 | `resolveAllowedRoots` / `allowedRoots` / `grantedPaths` / `grantPath` / `isWithin` / **`assertAllowedPath`** | 共享门禁（被 dev/ssh/capabilities 注入） |
| 78–144 | **`assertTargetAllowed`**（URL+DNS）/ **`assertBareHostAllowed`**（裸 host） | 共享门禁（SSRF） |
| 146–157 | `toHeaderRecord` / `asRecord` | 工具 |
| 159–177 | `capabilities/http-body.mjs` 三函数再导出（给 smoke test）+ `const handle = (cap, fn) => ipcMain.handle('desktop:'+cap, …)` | http + 注册器 |
| 179–184 | `setupConfirmIpcHandlers()` | 接线（宿主确认） |
| 186–193 | `setupDevIpcHandlers({assertAllowedPath})` + `will-quit` | 接线（dev） |
| 195–203 | `setupSshIpcHandlers({assertAllowedPath})` | 接线（ssh） |
| 205–212 | `setupStorageHandlers()` + dispose | 接线（storage） |
| 214–226 | `setupCapabilityHandlers({assertAllowedPath, assertHostAllowed, confirm})` | 接线（net/shell/secret/notif/background） |
| 228–244 | `system.info` / `system.paths` | **system** |
| 246–279 | `capture.sources`（含 TCC 错误映射） | **capture** |
| 281–410 | `capture.selectRegion` + region 会话表 + `capture.region.context/submit` | **capture** |
| 412–531 | `http.request`（重定向循环、字节/文本判定、上限） | **http** |
| 533–540 | `net.policy.get/set` | **net** |
| 542–559 | `credentials.available/load/save/clear` | **credentials** |
| 561–608 | `dialog.openFile/openFolder/saveFile/message` | **dialog** |
| 610–707 | 9 条 `fs.*` | **fs** |
| 709–716 | `window.setFullScreen/isFullScreen` | **window** |
| 718–724 | `window.toggleDevTools` | **window** |
| 726–731 | `app.quit` | **app** |
| 733–747 | `window.setTrafficLights` | **window** |
| 749–750 | 启动日志 | — |

> 观察：`ipc.ts` 同时是**门禁的家**（fs 白名单、SSRF 判定）和**5 个域的 handler**。任何拆文件的人只要把 `assertAllowedPath` 一起搬走，`dev/ssh/capabilities` 三个子系统的注入就会失效——这是本次拆分里唯一不能靠搬代码完成的部分。

### 3.2 `apps/desktop/src/main/capabilities/handlers.ts`（807 行）混了 5 个族 + 1 个宿主弹窗实现

| 行区间 | 内容 | 归属 |
| --- | --- | --- |
| 96–203 | 双语文案 `copy()` + **`createElectronConfirm()`**（socket / browser 两种弹窗） | 宿主确认（与 `confirm/index.ts` 分居两处） |
| 205–262 | `SocketSession` 模型 / `sendTo` / `ownedSocket` / `socketsOf` / `publicSocket` | net.socket |
| 264–278 | `requireSocketGrant`（每 label 每次运行一次） | net.socket |
| 280–406 | 4 条 `net.socket*` handler | net.socket |
| 408–455 | `OAuthSession` 模型 / `scheduleOAuthReap` / `ownedOAuth` / `publicOAuth` | shell |
| 457–483 | `openExternal`（仅 http/https + origin 授权） | shell |
| 485–562 | 5 条 `shell.*` handler | shell |
| 564–593 | `createSecretStore` 装配 + 8 条 `storage.secret*` | storage.secret |
| 595–724 | 4 条 `notification.*`（含 32 条上限、focus 逻辑、badge 三平台分支） | notification |
| 726–792 | `setKeepAwake` / `schedulerFor` + 4 条 `background.*` | background |
| 794–806 | `dispose()`（停表、关 socket、取消 OAuth、关通知） | 生命周期 |

### 3.3 其它层

- **preload**：`apps/desktop/src/preload/index.ts` 206 行 = 106 条字符串数组（14–174）+ 4 个函数（176–195）+ 暴露方式（197–206）。**零域划分**，插件能力与宿主内部通道（75–81）混排。
- **renderer bridge**：`packages/core/src/desktop/bridge.ts` 499 行 = 8 个 `create*Bridge`（86–458）+ 组装（464–499）。每组的探测常量（`DEV_CAPABILITIES` 86–101、`SSH_CAPABILITIES` 196–219、`NET_CAPABILITIES` 286–291、`BROWSER_CAPABILITIES` 316–322、`SECRET_CAPABILITIES` 367–376、`NOTIFICATION_CAPABILITIES` 402–407、`BACKGROUND_CAPABILITIES` 429–434）+ `storage-bridge.ts` 自带一份（`storage-bridge.ts:38–50`）。
- **contract**：**已拆**。`packages/common/src/core/desktop-bridge.ts`（5 行转发壳）→ `packages/common/src/core/desktop/{platform,capabilities,storage-envelope,system,dialog,fs,window,credentials,capture,http,net,browser,secrets,notifications,background,dev,ssh,contract,bridge}.ts`（2,098 行）。**但 `index.ts:7-9` 提到的 `storage.ts` 与 `catalog.ts` 两个文件并不存在**（见 §4.1-D5）。

### 3.4 目标模块划分

#### (a) contract 侧（已完成，收尾 2 处）

| 目标 | 状态 |
| --- | --- |
| 每域一个 `desktop/<domain>.ts` | ✅ 已有 19 个 |
| `capabilities.ts`（名字 union）+ `contract.ts`（名→params/result） | ✅ |
| `desktop/storage.ts`（`storage.*` 的信封与形状，目前挤在 `storage-envelope.ts` + 外部 `storage/types.ts`） | ⚠️ `index.ts:7` 承诺了但没建 |
| `desktop/catalog.ts`（agent 面向元数据：summary/guards/call/example） | ❌ 不存在，但 `index.ts:9`、`contract.ts:28`、`capabilities.ts:9` 三处都引用了它 |

#### (b) preload 侧

| 目标文件 | 内容 | 风险 |
| --- | --- | --- |
| `preload/capabilities.ts` | **插件**能力白名单（103 条） | 低 |
| `preload/host-internal.ts` | `dialog.confirm.context/confirmResult/confirmResize`（仅宿主窗口用） | 低，但**必须先分开**才不会继续污染 `desktop.capabilities`（P1-4） |
| `preload/index.ts` | 只留 `invoke`/`on` + `contextBridge` 暴露 | 低 |

#### (c) renderer bridge 侧

| 目标文件 | 内容 | 风险 |
| --- | --- | --- |
| `core/src/desktop/{net,browser,secrets,notifications,background,ssh,dev}.ts` | 每个 `create*Bridge` + 自己的能力常量 | 低（纯搬迁） |
| `core/src/desktop/gate.ts` | 统一「组是否可用」判定：现在 8 处 `.some` 与 storage 的 `.every` 不一致（§4.3-G6） | 中（语义要定一次：**部分可用**还是**全有才可用**） |

#### (d) main 侧（主要工作量）

| 目标文件 | 从哪搬 | 风险 |
| --- | --- | --- |
| `main/capabilities/fs-allowlist.ts` | `ipc.ts:36-76` | **高**：`allowedRoots`/`grantedPaths` 是模块级状态，被 `dev`/`ssh`/`capabilities` 三处注入（`ipc.ts:190,203,221`）；搬动时必须保留「单实例」并顺手补 realpath（P0-3） |
| `main/net/guard.ts` | `ipc.ts:78-144` + `net-policy.ts` + `net-policy-store.ts` | **高**：同时被 `http.request`、`net.socket*`、`ssh.*` 使用；搬动时**顺便删掉 `ssh/index.ts:241-264` 的私有复制**（P1-9） |
| `main/capabilities/confirm-dialog.ts` | `capabilities/handlers.ts:96-203` | 中：与 `main/confirm/index.ts` 合并成一处「宿主问用户」的门面 |
| `main/handlers/system.ts` / `dialog.ts` / `window.ts` / `app.ts` | `ipc.ts:228-244,709-747` | 低（无共享状态） |
| `main/handlers/capture.ts` | `ipc.ts:246-410`（含 region 会话表） | 低（会话表本就自洽） |
| `main/handlers/http.ts` | `ipc.ts:412-531` + `capabilities/http-body.mjs` | 中（依赖 guard） |
| `main/handlers/fs.ts` | `ipc.ts:610-707` | 中（依赖 allowlist） |
| `main/handlers/credentials.ts` | `ipc.ts:542-559` + `main/credentials.ts` | 中（**顺便决定 P0-1 怎么堵**） |
| `main/capabilities/{socket,shell,secrets,notifications,background}.ts` | `handlers.ts` 对应区间 | 低–中：`socket`/`shell`/`background` 各带会话表与定时器，搬动要保持 `dispose()` 汇总 |
| `main/bootstrap.ts` | `ipc.ts:179-226`（六段接线） | 中：这里是唯一的依赖注入点，拆完后每个 handler 模块都应导出 `setupXxx(deps)` 而不是自己去 import 门禁 |

**判断标准**：`ipc.ts` 里能被「纯函数 + 注入依赖」搬走的（system/dialog/window/app/capture）是低风险；凡是 import 了 `assertAllowedPath` / `assertTargetAllowed` 的（fs/http/credentials/dev/ssh/capabilities）都是中高风险，必须一次搬完并让 `dev/ssh/capabilities` 从新的模块拿同一个函数实例。

---

## 4. 漂移与缺陷清单

### 4.1 D — 清单一致性（union / preload / 注册 / 文档）

**D1（P2）28 条能力在现行文档里没有能力名（另有 2 条只有族名）**
证据：`grep -rn --include=*.md -F "<能力名>" docs/`（去掉 `docs/superpowers/**` 设计稿）在这 28 条上无命中：`system.info/paths`、`capture.*`(4)、`dialog.*`(4)、`fs.*`(9)、`window.*`(4)、`app.quit`、`credentials.*`(4)。`net.policy.get/set` 只以族名 `net.policy.*` 出现在 `DCP:20,87`。
影响：插件作者/agent 只能读契约源码；`docs/DESKTOP_CAPABILITIES.md` 的名字（「宿主能力：net / shell / storage.secret / notification / background」）**准确描述了它的覆盖范围**，但整个 fs/dialog/window/system/capture/credentials 面没有对应文档（`fs.*` 的白名单概念仅在 DCP:192 作为 `iconPath` 的类比出现一次）。
建议：在 `DESKTOP_CAPABILITIES.md` 增 3 节（fs 白名单、dialog 与路径授权、window/app/system），或新建 `docs/DESKTOP_SURFACE.md` 作为「全部 103 条」的索引页。

**D2（P1）union 有、preload 无：0 条**
证据：`capabilities.ts` 103 条全部出现在 `preload/index.ts:14-174`（本次逐条比对）。这条是**通过**，写进报告是为了让「清单一致性」可复核。

**D3（P1）preload 有、union 无：3 条**
证据：`preload/index.ts:79-81`（`dialog.confirm.context` / `dialog.confirmResult` / `dialog.confirmResize`）不在 `capabilities.ts:15-134`，也不在 `contract.ts`。
影响扩散到 2 处：
- `packages/core/src/desktop/bridge.ts:468` 把 preload 的原始数组 `as DesktopCapability[]`，于是 `desktop.has('dialog.confirmResult') === true`、`desktop.capabilities` 含 3 个类型系统不认识的名字；
- `studio-tools.ts:1980-1997` 用 `desktop.capabilities` 生成能力清单，于是 **agent 看到的 106 条里有 3 条是「扁平化后的假能力」**，还被归到 `dialog.` 族、拿到「原生对话框」的说明。
建议：preload 拆 `HOST_INTERNAL_CAPABILITIES`（§3.4b），`createDesktopBridge` 里过滤掉它们再赋给 `capabilities`。

**D4（P2）注册了但两个清单都没有：0 条（除 D3 的 3 条 confirm）**
证据：6 个注册文件里 `handle('…')` / `ipcMain.handle('desktop:…')` 的调用点合计 106 个（ipc 31、capabilities 25、ssh 22、storage 11、plugin-dev 14、confirm 3），与 union 103 + confirm 3 完全对应；反向也成立（union 每条都有 handler）。

**D5（P2）契约拆分留下了「承诺但不存在」的文件**
证据：`packages/common/src/core/desktop/index.ts:7-9` 写「`storage.ts`（contract shapes）… `catalog.ts`（agent-facing metadata）」并 `export *` 了 `./storage-envelope`，但目录里没有 `storage.ts`、没有 `catalog.ts`；`contract.ts:28` 与 `capabilities.ts:9` 也把 `./catalog.ts` 当既有事实来引用。
影响：任何按注释去找「有哪些门禁/summary」的人会落空（而这正是 agent 发现面最缺的东西，见 §5）。
建议：把 `catalog.ts` 真的建出来（见 §5.3-A），否则删掉这三处引用。

### 4.2 N — 命名 / 语义漂移

**N1（P1）同一件事 5 套失败约定**（见摘要 #7）
证据：`desktop/fs.ts:19-24`（`{data?,success?,error?}`）、`desktop/storage-envelope.ts:1-20`（`{ok:true,value}|{ok:false,code,message}`）、`desktop/secrets.ts:71-80`（`{ok,metadata?,error?,code?}`）、`capabilities/handlers.ts:610-693`（`notification.show` 返回 `{shown,id,clicked,dismissed,error?}`）、其余 reject。
更糟的一条：**同一个 `fs.` 族内**，`fs.readFile/writeFile` 失败返回 inline `{error}`（`ipc.ts:617-619`），`fs.exists` 失败直接 **reject**（`ipc.ts:634-636` 没有 try/catch）。
建议：新增能力时只允许两种形态——「有错误码的用信封」「其余 reject」，并把现有 5 套在 catalog 里显式标注，避免调用方统一 try/catch 时漏掉 inline 错误。

**N2（P2）base64 字段两种命名**
`net.*` 用 `dataBase64`（`capabilities/handlers.ts:311,373`；契约 `desktop/net.ts`），`ssh.shell-data` 用 `data` 但内容是 base64（`ssh/index.ts:544` 的 `toBase64`，`SSH.md:60` 明确「data 是 base64」）。
建议：两者都别改（会破坏兼容），但 catalog/文档里显式写「`ssh` 的 `data` 是 base64」。

**N3（P2）写文件字段名不同**：`fs.writeFile` 收 `data`（`contract.ts:103`），`dev.writeFile` 收 `contents`（`plugin-dev/index.ts:183`）。
影响：agent 在同一个会话里切换两个工具时最容易错；两处错误信息都只说「必须是字符串」，不提醒字段名。

**N4（P2）namespace 两套语法与上限**（摘要 #10）
`storage.secret*`：≤96 字符、`^(?:plugin|app)\.[A-Za-z0-9][A-Za-z0-9._-]*$`、值 ≤64 KiB、每 namespace ≤256 条（`capabilities/secret-params.mjs:22-33`）。
`storage.*`：≤120 字符、`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[…])*$`（**不允许下划线**）、值 ≤2 MiB（`storage/types.ts:69,81,87`）。
影响：一个叫 `plugin.my_plugin` 的 namespace 在 `storage.secretSet` 合法、在 `storage.set` 非法。

**N5（P2）窗口隔离模型不一致**：`net.socket*`（`handlers.ts:244-250`）、`shell.oauth*`（`:442-445`）、`background.*`（`:754-779`）按窗口隔离；`notification.*`、`ssh.*`、`dev.*`、`storage.*`、`credentials.*` 是应用级。
其中 `ssh.shell*` 与 `notification.clear` 的「应用级」**改变了他人的状态**（P0-2 与 §4.4）；文档只在 SSH:130 说过「隧道是应用级的」，终端与通知的跨窗口语义没写。

**N6（P2）事件通道字面量与文档一致，但没有统一出口**：`desktop:event:{net,ssh,background,dev,fullscreen}`（`capabilities/handlers.ts:240,764`、`ssh/index.ts:225`、`plugin-dev/index.ts:84`、`main/index.ts:87`）。`bridge.on(event)` 允许任意事件名（`core bridge:489`），preload 的 `on` **不做白名单**（`preload/index.ts:187-194`）——与「preload 只放行固定通道」的说法有出入（已有 GAP §5.3-4 从 studio 角度提过）。

### 4.3 G — 门禁不一致

**G1（P0）fs 白名单没有 realpath**（摘要 #3）
`assertAllowedPath` 用 `path.resolve` 后 `startsWith(root + sep)`（`ipc.ts:61-76`），不做 `realpath`；`grantedPaths` 只增不减、进程级、跨窗口（`ipc.ts:50-59,570`）。
受影响能力：`fs.readFile/writeFile/mkdir/remove/readdir/stat/copy/move`、`ssh.put/get`（`ssh/index.ts:473`）、`notification.show` 的 `iconPath`（`handlers.ts:620`）、`dev.*` 13 条（`plugin-dev/index.ts:96-218`）。
（GAP 分析 §5.3-1/2 已从 studio 角度报过同一根因，本条是**能力面口径**：它不止影响 `dev.*`，而是 24 条能力共用一个缺陷。）

**G2（P1）网络策略三份实现**
- `ipc.ts:90-113`（URL+DNS，http.request 用）
- `ipc.ts:120-144`（裸 host，net.socket 用，注入到 capabilities）
- `ssh/index.ts:241-264`（私有复制，注释未解释为什么不复用）
差异：ssh 版把 `metadata`/`private` 的措辞交给 `sshDenyReason`（`ssh-params.mjs:226`），逻辑等价但**没有覆盖 `localhost` 这类主机名特判**（`net-policy.ts:140-143` 对 `http.request` 有 `localhost`/`*.localhost` 的分支，ssh 版靠 DNS 解析后判定 —— 结果相同但路径不同）。

**G3（P2）同一个「能出网」的能力，确认粒度不同**：`http.request` 不弹窗（只有策略）；`net.socketOpen` 每 `label` 弹一次；`shell.browserOpen` 每 origin 弹一次；`ssh.*` 每「host+类别(+目标)」弹一次。四套粒度都在文档里有解释（`DCP:87`、`DCP:133`、`SSH:81`），但缺少一张总表。

**G4（P2）`dev.hostApi` 显式绕过 fs 白名单**（`plugin-dev/index.ts:190-195` 注释自认），且 `dev.*` 14 条在打包版**无开关**（`ipc.ts:190` 无条件 `setupDevIpcHandlers`，preload `:122-140` 无条件放行）。GAP §5.3-4 报过「任意已装插件可用 dev.*」，本条补充：**`dev.hostApi` 是唯一能读 `apps/desktop/src/main/**` 之外整个 monorepo 源码的能力，且不受任何白名单约束**。

**G5（P1）`credentials.*` 没有门禁**（摘要 #1）。同一类「钥匙串 + 明文出宿主」的能力里，`ssh.credentials*` 至少做到了「只进不出」（`SSH.md:218`），而 `credentials.load` 是「只出不进」且无调用方校验。

**G6（P2）组可用性判定两套**：`storage-bridge.ts:65` 用 `.every`（少一条就整体不可用），其余 7 组用 `.some`（`core bridge:107,225,297,328,382,413,440`）。
影响：一个只补了一半 `storage.*` 的宿主，`desktop.storage` 直接 `undefined`，`@kn/core` 静默退回 localStorage（数据「看起来丢了」）。

### 4.4 S — 存在但不对插件开放 / 危险默认值 / 未声明边界

| # | 结论 | 严重度 | 证据 |
| --- | --- | --- | --- |
| S1 | `credentials.*` 语义上是宿主登录态专用，实现上对插件全开且返回明文 | **P0** | 见 G5 |
| S2 | `app.quit` 无确认：任何插件可退出应用（含未保存状态） | P1 | `ipc.ts:729-731` |
| S3 | `window.toggleDevTools` 无确认：任何插件可开关用户窗口的 DevTools | P2 | `ipc.ts:719-724` |
| S4 | `fs.remove` 无确认且不可逆（删到白名单内任意路径，含 `~/Documents`） | P1 | `ipc.ts:647-654` |
| S5 | `notification.clear` 会关掉**所有**插件的通知；`notification.show` 的 `id` 撞车会替换别人的通知（`liveNotifications` 是全局 Map） | P2 | `handlers.ts:598,642,720-724` |
| S6 | `ssh.shellWrite/Close/Resize` 可操作**任何窗口**的终端，`ssh.shells` 泄露别人终端的主机名/用户名 | **P0** | 见摘要 #2 |
| S7 | `net.socket` 的 `timeoutMs: 0` = 关闭空闲超时（`desktop/net.ts` 注释与 `socket-params.mjs:14`），配合「不做缓冲」意味着空闲会话可长期占着 | P2 | `DCP:85-92`（文档已写，属「已声明的边界」） |
| S8 | `dev.installDependencies` 会执行 npm postinstall（无 `--ignore-scripts`），且子进程继承整个宿主环境 | P1 | GAP §5.3-5（已报，此处仅标注它属于能力面「危险默认值」） |
| S9 | `dialog.*` 授予的路径**永不回收**、且对所有窗口生效：一个插件弹一次「打开文件」，全应用此后都能读那个路径 | P1 | `ipc.ts:50-72,570,582,594` |
| S10 | `storage.*` 的 namespace 是**约定而非强制**：任何插件可 `storage.list({namespace:'app.x'})` 读宿主数据、`storage.clear` 清别人的 namespace | P2（文档已声明，`DCP:41-43`、`STG:58`） | `storage/index.ts:136-200` 无任何 namespace 归属校验 |

### 4.5 DOC — 文档与代码不符 / 悬空引用 / 行号漂移

| # | 结论 | 证据 |
| --- | --- | --- |
| DOC1 | `docs/PLUGIN_SECRETS.md` 被 2 处代码引用，**文件不存在**（`docs/` 只有 `PLUGIN_CONFIG_SECRETS.md`） | `packages/common/src/core/desktop/secrets.ts:29`；`apps/desktop/src/main/capabilities/secret-params.mjs:60` |
| DOC2 | 唯一写到 system/dialog/fs/window 的文档是**过期设计稿**，其形状与实现相反：稿里 `shell.openExternal`（实现 `shell.browserOpen`）、`clipboard.readText/writeText`（**从未实现**）、`fs.readFile → string`（实现 `DesktopFileResult<string>`）、`notification.show` 无 available/setBadge/clear、`DesktopPlatform` 无 `'other'` | `docs/superpowers/specs/2026-09-16-desktop-capabilities-sdk-design.md:1-3,120-155`；实现 `core/desktop/index.ts`、`ipc.ts:415-608` |
| DOC3 | GAP 分析里的 `main/ipc.ts` 行号已全部漂移（引用 `:602-607` 的 toggleDevTools，实际 `:719-724`；引用 `preload/index.ts:71-89` 的 dev 段，实际 `:122-140`） | `docs/PLUGIN_STUDIO_GAP_ANALYSIS.md:141,419` vs 现行文件 |
| DOC4 | `DESKTOP_CAPABILITIES.md` 的「55 项自测」「922 项」这类计数无法在本审计中核验（未跑测试），但与代码规模无矛盾 | `DESKTOP_CAPABILITIES.md:33,275` |
| DOC5 | 文档承诺的限值**核对通过**：每窗口 16 条 socket（`socket-params.mjs:27`）、OAuth 并发 4（`oauth-callback.mjs:36`）、每窗口 32 个定时任务（`scheduler.mjs:32`）、全局 8 条隧道 / 每条 64 并发（`ssh-params.mjs:40-42`） | `DCP:86,131,227`、`SSH:125` |
| DOC6 | 契约拆分后新增的文件头注释是占位文案（`Generated by the desktop contract split — <域>`），且 `contract.ts:23-34`、`bridge.ts:17-28` 出现**两段堆叠的 JSDoc**（合并残留） | `core/desktop/contract.ts:23-34`、`bridge.ts:17-28`、`capabilities.ts:1-3` |

---

## 5. agent 发现能力的现状与摩擦点

### 5.1 现在 agent 有什么（6 个工具，全部实现在 `packages/plugin-plugin-studio/src/studio-tools.ts`）

| 工具 | 行 | 返回粒度 | 缺什么 |
| --- | --- | --- | --- |
| `listDesktopCapabilities` | `:1939-2026` | 能力**名字**（按族分组）+ 族级一句话说明 + 3 个类型化组的**方法名** | 无 params/result、无门禁细节、无示例、无文档指针（`hint` 只有一句「去读 desktop-bridge.ts」，`:1961-1964`） |
| `listHostGlobals` | `:2032-2055` | `window.__KN__` 的名字/类型 + 标准包清单 | 与 desktop 能力无关（是 externals 用的） |
| `listPluginServices` | `:2063-2140` | 服务名 + 提供者 | 与能力面无关 |
| `listHostApiPackages` | `:2272-2291` | 6 个标准包的 name/version/entry | 只有包级 |
| `searchHostApi` | `:2293-2316` | `{package,path,line,text≤240字符}`，默认 60 条、上限 200（`plugin-dev/host-api.mjs:22-23,126-131`） | 只给「一行文本」，长泛型/多行签名会被 240 字符截断 |
| `readHostApiFile` | `:2318-2341` | **整个文件原文**（`host-api.mjs:139-158`，`MAX_READ_BYTES=200000`，超出直接报错） | **没有行区间**、没有 `symbol` 参数（快照时刻；文档/技能已在 16:26 描述将来的 `symbol` 用法，见 §5.2） |

族级说明只有 12 条（`studio-tools.ts:706-719`）：`system. http. net.policy. capture. dialog. fs. window. app. credentials. dev. ssh. storage.`。
**缺的 4 族**：`net.`（socket）、`shell.`、`notification.`、`background.` —— 恰好是最难猜语义的四个（base64、origin 授权、点击回调、窗口隔离）。

### 5.2 案例：agent 想「让插件读一个本地文件」，当前要几步

| 步 | 调用 | 拿到什么 | 还缺什么 |
| --- | --- | --- | --- |
| 1 | `listDesktopCapabilities({ query: 'fs' })` | 9 个名字（`fs.readFile…fs.move`）+ 一句族说明「全部受 fs 白名单限制（标准用户目录 + 对话框授权过的目录）」（`studio-tools.ts:712`） | 参数名、返回形状、**白名单到底是哪几个目录**、越界时是抛还是返回 `{error}` |
| 2 | `searchHostApi({ query: 'DesktopCapabilityContract' })` | 1–3 条命中：`@kn/common` + 文件路径 + 行号 + 240 字符文本（`host-api.mjs:126-131`） | 具体签名（`fs.readFile` 那一行是 `contract.ts:102`，文本长度刚好够，但 `storage.set` 这类多行条目只有开头） |
| 3 | `readHostApiFile({ package: '@kn/common', path: 'src/core/desktop-bridge.ts' })` | **整个文件**：HEAD 版 1,902 行 / 73,244 B；拆分后的工作区版 2,098 行 / 83,596 B（`MAX_READ_BYTES=200000` 放得下） | 只想要 9 条升级；却要吞掉 73 KB ≈ 20k tokens 的全文。**拆分后可以改读 `desktop/contract.ts`（13.3 KB）**，但**没有任何工具告诉 agent「能力 → 该读哪个小文件」** |
| 4 | 想确认白名单根目录 | **无工具可查**：`assertAllowedPath` 在 `apps/desktop/src/main/ipc.ts:36-76`，而 `readHostApiFile` 只在 `packages/{common,core,ui,icon,editor,plugin-api}` 里找（`host-api.mjs:16`）——`apps/**` 完全不可达 | 白名单语义（`documents/downloads/desktop/temp/userData` + 对话框授权，`ipc.ts:36-47`）只能靠猜或读源码仓库 |
| 5 | 想确认失败形状 | 契约里 `DesktopFileResult` 在 `desktop/fs.ts:19-24`（需再读一个文件）；`fs.exists` 的例外（reject）**任何文档都没写** | N1 的族内不一致 |

**摩擦点归纳（按代价排序）**

1. **无「能力 → 位置」映射**：从名字到「读哪个文件、第几行」要经过一次全文搜索（`searchHostApi` 是子串匹配整包，默认 60 条上限，`DesktopCapabilityContract` 这种词会命中多处）。
2. **读文件没有行区间**：唯一的精读手段是整文件（上限 200 KB，超过就直接拒绝并叫你「search it instead」，`host-api.mjs:153-155`）。73 KB / 2,098 行的单文件时代，这是「为了 9 条行付 20k tokens」。
3. **门禁不可见**：门禁散在 4 个文件（`ipc.ts` 白名单+SSRF、`confirm/index.ts` 弹窗、`capabilities/handlers.ts` 的 grant 表、`ssh/index.ts` 的 grant 表），且**一个都不在 host-api 包里**。族级说明是手写的 12 条（4 族缺失），改门禁不会同步改它。
4. **清单本身有噪声**：3 条 `dialog.confirm.*` 混进结果（D3），`typedGroups` 只列 3 组（`studio-tools.ts:2007`），`desktop.net/browser/secrets/notifications/background` 的方法对 agent 完全不可见。
5. **文档指向过期**：`DESKTOP_CAPABILITIES.md` 不覆盖 fs/dialog/window/system（D1），唯一覆盖的是过期设计稿（DOC2），两者都不能作为权威来源。

> 快照时刻正在发生的变化（供 Lead 交叉核对，非本审计结论）：`docs/PLUGIN_STUDIO.md:115-132` 与 `packages/plugin-plugin-studio/src/skills/plugin-authoring.ts:41,130-157` 已在描述 `getDesktopCapability({names})` 与 `readHostApiFile({...,symbol})`，但 `studio-tools.ts` 里还没有这两个实现（`grep getDesktopCapability packages/plugin-plugin-studio/src/studio-tools.ts` 为空；`readHostApiFile.inputSchema` 仍只有 `package`+`path`，`:2322-2329`）。也就是说**文档已先于代码**，实现落地前 agent 会照着不存在的工具写。

### 5.3 如果只改 studio 工具面，最值得补的 3 个能力（不写代码，只给形状）

**A. `getDesktopCapability`（在途，需补 3 个字段才真的省事）**

```
输入:  { names: string[] }                 // 1–12 个能力名
输出:  {
  capabilities: [{
    name, family, available,                // available = desktop.has(name)
    call,                                    // 可直接照抄: "desktop.invoke('fs.readFile', { path, encoding? })"
    params, result,                          // TS 类型表达式
    guards: { network?, confirm?, fsAllowlist?, keychain?, windowScoped?,
              userInteraction?, sensitive?, irreversible? },   // 结构化，不要散文
    typedMethod?,                            // 有类型化组时给 "desktop.ssh.exec(...)"
    doc?: { path, line },                    // ← 补：现行文档位置（没有就 null，显式告诉 agent 别去猜）
    example?: string
  }],
  missing: string[]
}
```
价值：把 §5.2 的步 1→3 压成 1 次调用；`guards` 结构化后，agent 能直接生成「先 `desktop.has` 再降级」的代码而不需要读 `main/ipc.ts`。

**B. `checkDesktopPath`（把唯一「查不到」的门禁变成可查）**

```
输入:  { path: string }                      // 绝对路径，插件想读/写/删的
输出:  {
  allowed: boolean,
  matchedRoot?: string,                      // documents / downloads / desktop / temp / userData / granted-by-dialog
  resolveError?: string,                     // 空串/非绝对/不存在时说明
  realpathHint?: string,                     // 若中间层有符号链接，提示"实际解析到的路径与你给的不同"（对应 P0-3）
  fixHint?: string                           // "先 dialog.openFile 让用户选这个文件，再 fs.readFile"
}
```
实现成本：`allowedRoots` 与 `system.paths` 一一对应（`ipc.ts:36-47` ↔ `ipc.ts:238-244`），renderer 侧已能拿到全部 5 个根；对话框授权过的路径由插件自己记（或加一个 `grantedPaths` 只读镜像）。**不改任何主进程能力**即可回答「我这个路径能不能读」——这是当前最大的空白（§5.2 步 4）。

**C. `listDesktopBridges`（补齐 discovery 的枚举面）**

```
输入:  {}  | { group?: 'net'|'browser'|'secrets'|'notifications'|'background'|'ssh'|'dev'|'storage' }
输出:  {
  bridges: [{
    group, available,                        // 例: 'net' → desktop.net !== undefined
    gatedBy: string[],                       // 例: ['net.socketOpen','net.socketWrite',...]
    methods: [{ name, signature, eventChannel? }],   // eventChannel: net→'net', ssh→'ssh', background→'background', dev→'dev'
    eventPayload?: string,                   // "socket-data{dataBase64} | socket-close{local,graceful,...}"
    notes?: string
  }]
}
```
价值：修掉 §5.1 表最后两行 + 摘要 #8 —— 现在 `typedGroups` 只列 `dev/ssh/storage`（`studio-tools.ts:2007`），8 个组里的 5 个（`net/browser/secrets/notifications/background`）对 agent 不可见，而这 5 个恰好是「没有对应 invoke 语义提示」的组；`eventChannel` 还能一次说清 `dataBase64`（net）与 `data`（ssh）的差异（N2）。

---

## 6. 未实测与待确认

- 所有「弹窗/授权/上限」行为均为源码阅读结论，**未启动 Electron 实测**（任务约束：不跑 build/测试）。
- §2 的「门禁」列依据 handler 内的分支与注入依赖判断；`net.policy` 的**运行时**取值（`net-policy-store` 落盘）未验证。
- §5.2 里 `readHostApiFile` 的 73 KB / 2,098 行数字来自 `wc -c`（`git show HEAD:` 版与拆分后目录之和），**token 估算（≈20k）是粗算**，未用模型实际计量。
- 审计期间契约目录仍在变动（`index.ts` 引用的 `catalog.ts`/`storage.ts` 尚未出现，§4.1-D5）；若后续落地，§2 的行号换算与 §5 的建议 A 需要复核。