# plugin-dev-harness — 真机验证：桌面端「插件开发台」是否可行

这是动手实现之前的**可行性验证**。真正落地的实现在
[`docs/PLUGIN_STUDIO.md`](../../docs/PLUGIN_STUDIO.md) 与
[`apps/desktop/src/main/plugin-dev`](../../apps/desktop/src/main/plugin-dev)。

本 PoC 只验证技术前提：在真实 Electron 宿主里，用仓库里**真实的
`PluginScriptLoader`** 从一个独立端口的插件 dev server 加载 UMD bundle，
并热更、失败隔离、恢复。

## 结论（Electron 33.4.11 / macOS）

| 验证项 | 结果 |
| --- | --- |
| 跨端口（`localhost:4199` 宿主 / `localhost:4200` 插件）经典 script 加载 | ✅ 同一个 window，`window.__KN__` 可用 |
| bundle 自注册（`definePlugin`）并携带 `apiVersion` | ✅ |
| 改动 + `invalidateAll()` 后重新 load，拿到新产物 | ✅ `built-at-1` → `built-at-2` |
| 编译失败 / 404 时宿主不受影响 | ✅ 1–2ms 内 reject，不 hang |
| 修好构建后可恢复 | ✅ `recovered, registered=true` |
| 插件经桌面能力桥读写文件 | ✅ |

原始输出：

```
POC_RESULT {"observed":[
  {"phase":"install","marker":"built-at-1","apiVersion":"2.1.0"},
  {"phase":"hot-reload","marker":"built-at-2","reloads":2}],
 "fsResult":"written by plugin at 2026-09-22T16:35:13.765Z","platform":"MacIntel"}

POC_FAILURE_RESULT ["broken-build rejected after 2ms: Plugin poc-dev-plugin not found in window scope",
 "404 rejected after 0ms","recovered, registered=true, marker=built-at-1"]
```

## 怎么跑

```bash
cd poc/plugin-dev-harness

# 1) 用真实 loader 打一个浏览器 bundle（产物不入库）
../../node_modules/.pnpm/node_modules/.bin/esbuild \
  ../../packages/common/src/utils/import-util.ts \
  --bundle --format=esm --outfile=shell/loader.bundle.js

# 2) 宿主页面的 React（正式实现里由宿主 bundle 提供）
mkdir -p shell/vendor
cp ../../node_modules/react/umd/react.development.js shell/vendor/react.js
cp ../../node_modules/react-dom/umd/react-dom.development.js shell/vendor/react-dom.js

# 3) 起两个 origin
node host-server.js   # 宿主壳        http://localhost:4199
node dev-server.js    # 插件 dev server http://localhost:4200

# 4) 跑真实 Electron
../../apps/desktop/node_modules/.bin/electron electron-main.mjs --no-sandbox
```

- `shell/boot.js`：安装 + 热更 + fs 能力（默认入口）
- `shell/boot-failure.js`：失败隔离 + 恢复（把 `index.html` 入口换成它，
  先 `curl -X POST http://localhost:4200/break` 再跑）

## 与正式实现的差异

| PoC | 正式实现 |
| --- | --- |
| HTTP dev server + 手工 UMD | 子进程里跑 esbuild，产物经 Blob URL 安装，不需要 HTTP 源 |
| `POST /bump` 模拟改代码 | 子进程 `fs.watch` + NDJSON 事件 |
| 手写 `definePlugin` outro | 构建器生成 `require` shim + 注册代码 |
| 直接注入主窗口 | `pluginHost` 服务 + 独立的开发台插件 UI + agent 工具 |
| 需要自己准备工程目录 | 宿主内置工程目录，**建工程不需要目录对话框** |

## 文件

| 文件 | 作用 |
| --- | --- |
| `host-server.js` | 模拟宿主 origin |
| `dev-server.js` | 插件 dev server：UMD 输出、`/bump` 模拟重建、`/break` 模拟构建失败 |
| `electron-main.mjs` | 真实 Electron 宿主窗口 + 固定能力桥 |
| `preload.cjs` | capability 白名单桥 |
| `shell/boot.js` | 安装 + 热更 + fs 能力验证 |
| `shell/boot-failure.js` | 失败隔离 + 恢复验证 |
