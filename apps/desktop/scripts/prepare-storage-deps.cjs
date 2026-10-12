/**
 * electron-builder `afterPack` 钩子（存储层原生依赖侧）：把 SQLite 原生模块装进产物。
 *
 * ## 为什么需要它
 *
 * 本项目的 electron-builder `files` 只包含 `out` 目录、并显式排除 `node_modules`，
 * 而 `better-sqlite3` 是**主进程运行时真实 require 的原生模块**（含 `*.node` 二进制），
 * 不能被打进 bundle。缺了它，打包后的「本地存储」在启动时就打不开数据库 —— 应用会
 * 降级到 localStorage（`storage.info` 报告 `STORAGE_UNAVAILABLE`），用户数据落不进 SQLite。
 *
 * ## 落盘位置
 *
 *     <Resources>/node_modules/better-sqlite3/
 *     <Resources>/node_modules/bindings/
 *     <Resources>/node_modules/file-uri-to-path/
 *
 * 为什么是 `Resources/node_modules`：主进程代码在 `app.asar/out/main/` 里，Node 的模块
 * 解析会从那里逐级向上找 `node_modules`（`app.asar/out/main/node_modules` →
 * `app.asar/out/node_modules` → `app.asar/node_modules` → `<Resources>/node_modules`）。
 * 前面的路径都在 asar 内不存在，最后一级正好落在 asar **外面**的真实目录上 —— 因此
 * `require('better-sqlite3')` 拿到的 `*.node` 是磁盘上的真实文件（原生插件不能从 asar 里
 * 加载）。这条路径不依赖 `app.asar.unpacked` 的路径反推（本项目实测那套 existsSync 不可靠，
 * 见 ./prepare-studio-deps.cjs 的说明）。
 *
 * ## 依赖闭包
 *
 * `better-sqlite3@12` 运行时 require `bindings`，后者 require `file-uri-to-path`。
 * 三者按真实解析结果复制（`require.resolve` 从包自己的目录出发），不用维护手写清单。
 *
 * `dependencies` 里混着**只用于安装/编译**的包（`prebuild-install` 及其一整棵树、
 * `node-addon-api`）：它们不会被运行时代码 require，装进产物只会白白增大体积（实测
 * 38 个包 vs 3 个）。SHIP_SKIP_PACKAGES 就是这份"构建期专用"清单。
 *
 * 复制后还会裁掉包内只对编译有意义的目录（`src/`、`deps/`、`binding.gyp`、
 * `build/obj.target`）—— 12 MB 里 9.9 MB 是编译期源码/头文件。
 *
 * 关闭方式：KN_SKIP_STORAGE_DEPS=1（打包仍成功，但产物的本地存储不可用）。
 */

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

/** 需要打进产物的根包。 */
const ROOT_PACKAGES = ['better-sqlite3']

/** 只用于安装/编译、运行时不会 require 的包。 */
const SHIP_SKIP_PACKAGES = new Set([
    'prebuild-install',
    'node-addon-api',
    'node-gyp',
    'node-gyp-build',
    'node-pre-gyp',
])

/** 包内只对编译有意义的路径，复制后删除。 */
const PRUNE_PATHS = [
    'src',
    'deps',
    'binding.gyp',
    'node_modules',
    'build/obj.target',
    'build/.deps',
    'build/Makefile',
    'build/config.gypi',
    'build/binding.sln',
    'build/better_sqlite3.vcxproj',
    'build/better_sqlite3.vcxproj.filters',
]

/** 依赖闭包规模上限，防止异常清单把打包拖死。 */
const MAX_PACKAGES = 200

/** 找不到 Resources 目录时抛错，避免静默产出不可用的包。 */
const resolveResourcesDir = (context) =>
    [
        path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources'),
        path.join(context.appOutDir, 'resources'),
    ].find((candidate) => fs.existsSync(candidate))

/** 递归复制，解析符号链接（pnpm 的 node_modules 全是链接）。 */
const copyTree = (from, to) => {
    fs.rmSync(to, { recursive: true, force: true })
    fs.cpSync(from, to, { recursive: true, dereference: true, preserveTimestamps: true })
}

/** 解析一个包的目录；从 `fromDir` 出发，模拟 Node 的解析规则。 */
const resolvePackageDir = (fromDir, name) => {
    const requireFrom = createRequire(path.join(fromDir, 'noop.js'))
    return path.dirname(requireFrom.resolve(`${name}/package.json`))
}

/**
 * 把根包及其运行时依赖复制到 `<dest>/node_modules/<name>`。
 *
 * 这里不重建 pnpm 的嵌套布局：三个包的依赖图是线性的且无版本冲突，扁平放置即可被
 * Node 正常解析。若将来出现冲突，应改为按 scope 嵌套（见 prepare-studio-deps.cjs）。
 */
const materialize = (dest, packages) => {
    const modulesDir = path.join(dest, 'node_modules')
    const placed = new Map()

    const visit = (name, fromDir) => {
        if (placed.has(name)) return
        if (placed.size >= MAX_PACKAGES) {
            throw new Error(`[prepare-storage-deps] 依赖闭包超过 ${MAX_PACKAGES} 个包，疑似清单异常`)
        }
        const source = resolvePackageDir(fromDir, name)
        const target = path.join(modulesDir, ...name.split('/'))
        copyTree(source, target)
        placed.set(name, target)

        for (const prune of PRUNE_PATHS) {
            fs.rmSync(path.join(target, ...prune.split('/')), { recursive: true, force: true })
        }

        const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
        for (const dependency of Object.keys(manifest.dependencies || {})) {
            if (SHIP_SKIP_PACKAGES.has(dependency)) continue
            visit(dependency, source)
        }
    }

    for (const name of packages) visit(name, __dirname)
    return placed
}

module.exports = async function prepareStorageDependencies(context) {
    if (process.env.KN_SKIP_STORAGE_DEPS === '1') {
        console.log('[prepare-storage-deps] KN_SKIP_STORAGE_DEPS=1，跳过 SQLite 原生模块')
        return
    }

    const resources = resolveResourcesDir(context)
    if (!resources) {
        throw new Error(`[prepare-storage-deps] 找不到 Resources 目录 (appOutDir=${context.appOutDir})`)
    }

    // 直接物化在 Resources/node_modules 下：主进程从 app.asar/out/main 逐级向上解析
    // 时会命中这一级（见文件头说明）。
    let placed
    try {
        placed = materialize(resources, ROOT_PACKAGES)
    } catch (error) {
        throw new Error(
            `[prepare-storage-deps] 安装 SQLite 原生模块失败：${error.message}\n` +
                '请先跑 pnpm install（apps/desktop 依赖 better-sqlite3）。',
        )
    }

    // 原生二进制必须真的落盘：缺了它打包产物会静默降级到 localStorage。
    // 先找 prebuilds（v13 的 N-API 形态），再找 node-gyp 的 build/Release（v12 在
    // 用 @electron/rebuild 时把为 Electron 编译的二进制放在这里）。
    const sqliteDir = placed.get('better-sqlite3')
    const binaries = [
        ...(fs.existsSync(path.join(sqliteDir, 'prebuilds'))
            ? fs.readdirSync(path.join(sqliteDir, 'prebuilds')).map((file) => path.join('prebuilds', file))
            : []),
        ...['Release', 'Debug']
            .map((kind) => path.join('build', kind, 'better_sqlite3.node'))
            .filter((relative) => fs.existsSync(path.join(sqliteDir, relative))),
    ]
    if (binaries.length === 0) {
        throw new Error(
            '[prepare-storage-deps] better-sqlite3 没有可用的原生二进制。' +
                '请先跑 pnpm --filter @kn/desktop rebuild:native（针对 Electron 的 ABI 编译）。',
        )
    }

    console.log(
        `[prepare-storage-deps] 已装入 ${placed.size} 个包（${[...placed.keys()].join(', ')}）、` +
            `原生二进制 ${binaries.join(', ')} → ${path.relative(context.appOutDir, path.join(resources, 'node_modules'))}`,
    )
}
