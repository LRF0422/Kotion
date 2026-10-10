/**
 * electron-builder `afterPack` 钩子（开发台运行时依赖侧）：把插件开发台在**打包后**
 * 需要的运行时依赖装进产物。
 *
 * ## 为什么需要它
 *
 * 开发台的编译能力跑在**子进程**里（`ELECTRON_RUN_AS_NODE` 启动
 * `out/main/plugin-dev/dev-server.mjs`），子进程需要三样只在源码树里、而打包产物
 * 里没有的东西：
 *
 * | 需要什么 | 谁用 | 缺了会怎样 |
 * | --- | --- | --- |
 * | `esbuild` + 平台二进制 | 编译插件源码 | 一构建就失败 → 开发台**完全不可用** |
 * | `tailwindcss` / `postcss` / 宿主 tailwind 配置 | 编译插件 CSS | 面板/页面**没有样式**（裸 DOM） |
 * | 宿主标准包源码（`packages/{common,core,ui,icon,editor,plugin-api}/src`） | agent 的 `searchHostApi` / `readHostApiFile` | AI 写插件时查不到真实接口，只能凭记忆 |
 *
 * 本项目的 electron-builder `files` 只包含 out 目录、并显式排除 node_modules，
 * 所以以上三者都不会出现在 `app.asar` 里 —— 这就是「本地开发一切正常、build 完
 * 插件开发台就不可用」的根因。
 *
 * ## 两个必须遵守的约束（都是实测结论）
 *
 * 1. **原生二进制必须在 asar 之外**：esbuild 要 `spawn` 平台二进制，而 asar 里的
 *    文件不是真实文件 —— `spawn` 会得到 `ENOTDIR`。所以资源落在
 *    `app.asar.unpacked/` 下（Electron 会把 asar 内的路径映射到这里）。
 * 2. **不能用 `NODE_PATH` 兜底**：ESM 解析器不认它（实测对 `import()` 无效）。
 *    因此依赖必须放在 **从 dev-server 所在目录向上查找就能命中** 的位置。
 *
 * ## 产物布局
 *
 *     app.asar.unpacked/out/main/plugin-dev/
 *     ├── dev-server.mjs / bundler.mjs / tailwind.mjs   ← 子进程入口（必须在 asar 外）
 *     ├── tailwind.config.cjs          ← 宿主 @kn/ui 的 tailwind 配置
 *     ├── node_modules/                ← 自包含依赖树（esbuild / tailwind / postcss …）
 *     └── host-api/packages/<name>/    ← 宿主标准包源码（只读参考）
 *
 * 为什么要连 `.mjs` 一起复制：`manager.mjs` 判断「随包发的那份 dev-server 是否可用」
 * 用的是 `existsSync`。在打包运行时，**asar 内的 `.mjs` 不是真实文件**——
 * `existsSync(.../app.asar.unpacked/.../dev-server.mjs)` 会返回 false（实测），
 * 于是 manager 回退去 asar 里取，子进程在真正的 Node 里一加载就 MODULE_NOT_FOUND。
 * 所以子进程会读到的文件必须**物理落在 asar 外**。
 *
 * 依赖按 **真实的 Node 解析结果** 物化：从入口包出发，用该包真实目录上的 resolver
 * 解析它的 dependencies，递归收集；同名不同版本才嵌套到父包的 node_modules 下。
 * 因此 pnpm / npm / yarn 布局都能得到一份可用的依赖树。
 *
 * 关闭方式：KN_SKIP_STUDIO_DEPS=1（打包仍成功，但开发台的编译能力不可用）。
 */

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

/** 目标平台 → esbuild 平台包名（与 esbuild 自己的 platformKey 表一致）。 */
const ESBUILD_PLATFORM_PACKAGES = {
    'darwin arm64': '@esbuild/darwin-arm64',
    'darwin x64': '@esbuild/darwin-x64',
    'win32 arm64': '@esbuild/win32-arm64',
    'win32 ia32': '@esbuild/win32-ia32',
    'win32 x64': '@esbuild/win32-x64',
    'linux arm': '@esbuild/linux-arm',
    'linux arm64': '@esbuild/linux-arm64',
    'linux ia32': '@esbuild/linux-ia32',
    'linux x64': '@esbuild/linux-x64',
    'linux ppc64': '@esbuild/linux-ppc64',
    'linux s390x': '@esbuild/linux-s390x',
    'linux riscv64': '@esbuild/linux-riscv64',
}

/** electron-builder 的 Arch 数字枚举 → 架构名。 */
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'arm', 3: 'arm64', 4: 'universal' }

/** 编译插件源码需要的包（bundler.mjs 里 `import('esbuild')`）。 */
const BUILD_PACKAGES = ['esbuild']

/** 编译插件 CSS 需要的包（版本与宿主一致，见 tailwind.mjs）。 */
const CSS_PACKAGES = ['tailwindcss', 'postcss', 'tailwindcss-animate', '@tailwindcss/typography']

/** 宿主标准包：agent 写插件时查阅的真实接口。 */
const HOST_PACKAGE_DIRS = ['common', 'core', 'ui', 'icon', 'editor', 'plugin-api']

/** 宿主 tailwind 配置在仓库里的相对位置（相对 workspace 根）。 */
const HOST_TAILWIND_CONFIG = ['packages', 'ui', 'tailwind.config.js']

/** 依赖树规模上限，防止异常清单把打包拖死。 */
const MAX_PACKAGES = 5000

const platformSubpath = (platform) => (platform === 'win32' ? 'esbuild.exe' : path.join('bin', 'esbuild'))

/**
 * 解析起点，按优先级：显式覆盖 → electron-builder 的 cwd（apps/desktop）→ 本脚本目录。
 * 后两者让这个钩子在仓库根被调用时（测试）也能工作。
 */
const resolutionBases = () => [process.env.KN_STUDIO_DEPS_BASE, process.cwd(), __dirname].filter(Boolean)

const readManifest = (dir) => {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    } catch {
        return {}
    }
}

/** 一个包的运行时依赖名（dependencies + optionalDependencies）。 */
const runtimeDeps = (manifest) => [
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
]

/** 递归复制，保留可执行位，并把符号链接解析成真实文件/目录。 */
const copyTree = (from, to) => {
    fs.rmSync(to, { recursive: true, force: true })
    fs.cpSync(from, to, { recursive: true, dereference: true, preserveTimestamps: true })
}

/**
 * 把一棵依赖树物化进 `<dest>/node_modules`。
 *
 * 不变量：**每个包的每个依赖，都能从「这个包的落盘目录」按 Node 的解析规则找到。**
 *
 * 做法是让每个包落在它父包解析范围（scope）下的 `<name>`。Node 从包的真实落盘位置
 * 向上查找 `node_modules`，会逐级命中这些位置 —— 因此同名不同版本各自落在自己父包
 * 下面，不会互相覆盖。
 *
 * 关键点：**去重必须按 scope 做，不能全局做**。把某个包挪到别处复用，它自己的依赖
 * 就跟着失效了（曾因此让 `@tailwindcss/typography` 的 `postcss-selector-parser`
 * 找不到 `cssesc`，宿主的 tailwind 配置直接加载失败）。所以同一版本在不同 scope 下
 * 可以各留一份，换来的是解析结果与真实安装布局一致。
 *
 * 解析用的是**每个包真实目录上的 resolver**，拿到的就是这个包在真实安装布局里
 * 实际依赖的那一份 —— 不会被镜像目录本身误导。
 */
const materializeDependencies = (dest, roots, modulesDir = path.join(dest, 'node_modules')) => {
    // Dependencies go to `modulesDir`; `dest` is only the boundary that
    // visibility walking stops at (per-scope `node_modules` are nested under it).
    fs.rmSync(modulesDir, { recursive: true, force: true })
    fs.mkdirSync(modulesDir, { recursive: true })

    /**
     * `${scope}\0${realDir}` → 已展开。
     *
     * 必须带上 scope：同一个包在不同解析范围下各自需要一份，只用 realDir 做全局去重
     * 会让后来那个 scope 拿不到它（曾因此让 `postcss-selector-parser` 找不到
     * `cssesc`）。带 scope 后它同时还能截断环形依赖。
     */
    const seen = new Set()
    /** scope 目录 → 该 scope 已经落盘的 `name@version`（同 scope 内去重）。 */
    const placedByScope = new Map()
    const queue = []
    let skipped = 0

    /** 解析某个包真实目录上的一个依赖名。 */
    const resolveName = (name, fromDir) => {
        const candidates = fromDir ? [fromDir, ...resolutionBases()] : resolutionBases()
        for (const dir of candidates) {
            try {
                const id = createRequire(path.join(dir, 'kn-anchor.cjs'))
                return fs.realpathSync(path.dirname(id.resolve(`${name}/package.json`)))
            } catch {
                // try the next base
            }
        }
        return null
    }

    for (const name of roots) {
        // esbuild 的平台包是 esbuild 的 optionalDependency：pnpm 下它只存在于
        // esbuild 自己的 node_modules 里，没有被提升到工程根部，
        // 所以要像 esbuild 一样从 esbuild 出发解析。
        const fromDir = name.startsWith('@esbuild/') ? resolveName('esbuild') : undefined
        const real = resolveName(name, fromDir)
        if (!real) {
            throw new Error(
                `[prepare-studio-deps] 无法解析 ${name}（尝试过: ${resolutionBases().join(', ')}）。` +
                    '请先在 apps/desktop 里安装依赖；确实要跳过请设置 KN_SKIP_STUDIO_DEPS=1。',
            )
        }
        queue.push({ name, real, scope: modulesDir })
    }

    let copied = 0
    while (queue.length) {
        if (copied >= MAX_PACKAGES) {
            throw new Error(`[prepare-studio-deps] 依赖树超过 ${MAX_PACKAGES} 个包，疑似清单异常，已中止`)
        }
        const { name, real, scope } = queue.shift()
        const visitKey = `${scope}\0${real}`
        if (seen.has(visitKey)) continue
        seen.add(visitKey)

        const manifest = readManifest(real)
        const version = manifest.version || '0.0.0'
        const key = `${manifest.name || name}@${version}`

        const placed = placedByScope.get(scope) || new Set()
        placedByScope.set(scope, placed)
        if (placed.has(key)) continue
        placed.add(key)

        const target = path.join(scope, name)
        copyTree(real, target)
        copied += 1

        // 这个包自己的解析范围，就是它落盘位置下的 node_modules。
        const childScope = path.join(target, 'node_modules')
        for (const dep of runtimeDeps(manifest)) {
            const depReal = resolveName(dep, real)
            if (!depReal) {
                // 可选依赖 / 未安装的 peer：跳过，不让打包失败。
                skipped += 1
                continue
            }
            queue.push({ name: dep, real: depReal, scope: childScope })
        }
    }

    return { placed: copied, skipped }
}

/** 目标平台需要装入的 esbuild 平台包（macOS universal 需要两份）。 */
const esbuildPlatformPackages = (platform, arch) => {
    if (arch === 'universal') {
        return [ESBUILD_PLATFORM_PACKAGES[`${platform} x64`], ESBUILD_PLATFORM_PACKAGES[`${platform} arm64`]].filter(Boolean)
    }
    const name = ESBUILD_PLATFORM_PACKAGES[`${platform} ${arch}`]
    return name ? [name] : []
}

/** 找到这个 app 的 Resources 目录（mac 与 win/linux 布局不同）。 */
const resolveResourcesDir = (context) =>
    [
        path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources'),
        path.join(context.appOutDir, 'resources'),
    ].find((candidate) => fs.existsSync(candidate))

/**
 * The built child-process scripts (`out/main/plugin-dev/*.mjs`).
 *
 * electron-vite copies them there; afterPack runs after that build, so they are
 * on disk under the app directory.
 */
const resolveBuiltPluginDevDir = (context) => {
    for (const base of resolutionBases()) {
        for (const candidate of [
            path.join(base, 'out', 'main', 'plugin-dev'),
            path.join(base, '..', 'out', 'main', 'plugin-dev'),
        ]) {
            if (fs.existsSync(path.join(candidate, 'dev-server.mjs'))) return candidate
        }
    }
    throw new Error(
        `[prepare-studio-deps] 找不到 out/main/plugin-dev/dev-server.mjs` +
            `（appOutDir=${context.appOutDir}）。请先跑 electron-vite build。`,
    )
}

/** 找到仓库根（含 packages/）。 */
const resolveWorkspaceRoot = () => {
    for (const base of resolutionBases()) {
        for (const candidate of [path.resolve(base, '..', '..'), path.resolve(base, '..', '..', '..')]) {
            if (fs.existsSync(path.join(candidate, 'packages', 'common', 'package.json'))) return candidate
        }
    }
    return undefined
}

/** 复制宿主标准包源码（只读 API 参考）。返回复制了几个包。 */
const copyHostApiSources = (dest, workspaceRoot) => {
    const hostApiDir = path.join(dest, 'host-api', 'packages')
    fs.rmSync(path.join(dest, 'host-api'), { recursive: true, force: true })

    let copied = 0
    for (const name of HOST_PACKAGE_DIRS) {
        const packageRoot = path.join(workspaceRoot, 'packages', name)
        if (!fs.existsSync(path.join(packageRoot, 'package.json'))) continue
        const target = path.join(hostApiDir, name)
        fs.mkdirSync(target, { recursive: true })
        fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(target, 'package.json'))
        // 只带源码：agent 查的是 TS 接口，dist/build 没有意义。
        if (fs.existsSync(path.join(packageRoot, 'src'))) {
            copyTree(path.join(packageRoot, 'src'), path.join(target, 'src'))
        }
        copied += 1
    }
    return copied
}

module.exports = async function prepareStudioDependencies(context) {
    if (process.env.KN_SKIP_STUDIO_DEPS === '1' || process.env.KN_SKIP_ESBUILD === '1') {
        console.log('[prepare-studio-deps] 已跳过（开发台的编译能力将不可用）')
        return
    }

    const platform = context.electronPlatformName
    const arch = ARCH_NAMES[context.arch] || process.arch
    const platformPackages = esbuildPlatformPackages(platform, arch)
    if (platformPackages.length === 0) {
        throw new Error(
            `[prepare-studio-deps] esbuild 不支持的目标平台: ${platform} ${arch}。` +
                '如需跳过（开发台将无法编译插件），设置 KN_SKIP_STUDIO_DEPS=1。',
        )
    }

    const resources = resolveResourcesDir(context)
    if (!resources) {
        throw new Error(`[prepare-studio-deps] 找不到 Resources 目录 (appOutDir=${context.appOutDir})`)
    }

    // 关键：资源必须落在 app.asar.unpacked 下，esbuild 才能 spawn 平台二进制。
    const dest = path.join(resources, 'app.asar.unpacked', 'out', 'main', 'plugin-dev')
    fs.mkdirSync(dest, { recursive: true })

    /* ---- 1a. 子进程入口脚本（物理落在 asar 外） ---- */
    // 这一步不能省：打包运行时 asar 里的 `.mjs` 不是真实文件，manager 的
    // existsSync 会判为不存在，于是回退到 asar 内的那份，子进程一加载就
    // MODULE_NOT_FOUND。复制源在 out/main/plugin-dev（electron-vite 的构建产物）。
    const sourceDir = resolveBuiltPluginDevDir(context)
    const childAssets = ['dev-server.mjs', 'bundler.mjs', 'tailwind.mjs']
    for (const file of childAssets) {
        const from = path.join(sourceDir, file)
        if (!fs.existsSync(from)) {
            throw new Error(
                `[prepare-studio-deps] 缺少构建产物 ${from}。` +
                    '请先跑 electron-vite build（apps/desktop:out/main/plugin-dev/*.mjs）。',
            )
        }
        fs.copyFileSync(from, path.join(dest, file))
    }

    /* ---- 1b. 依赖树（esbuild 平台包 + CSS 工具链） ---- */
    // node_modules 放在 Resources/app.asar.unpacked/out/main/plugin-dev/，与上面那份
    // dev-server.mjs 同层 —— 子进程从自己的真实路径向上查找即可命中。
    const modulesDir = path.join(resources, 'app.asar.unpacked', 'out', 'main', 'plugin-dev', 'node_modules')
    const { placed, skipped } = materializeDependencies(
        path.join(resources, 'app.asar.unpacked', 'out', 'main', 'plugin-dev'),
        [...BUILD_PACKAGES, ...platformPackages, ...CSS_PACKAGES],
        modulesDir,
    )

    for (const name of platformPackages) {
        const binary = path.join(modulesDir, ...name.split('/'), platformSubpath(platform))
        if (!fs.existsSync(binary)) {
            throw new Error(`[prepare-studio-deps] ${name} 的二进制没有落盘: ${binary}`)
        }
        if (platform !== 'win32') fs.chmodSync(binary, 0o755)
    }

    /* ---- 2. 宿主 tailwind 配置（插件 CSS 编译用） ---- */
    const workspaceRoot = resolveWorkspaceRoot()
    let tailwindConfig = false
    if (workspaceRoot) {
        const source = path.join(workspaceRoot, ...HOST_TAILWIND_CONFIG)
        if (fs.existsSync(source)) {
            fs.copyFileSync(source, path.join(dest, 'tailwind.config.cjs'))
            tailwindConfig = true
        }
    }

    /* ---- 3. 宿主标准包源码（agent 的只读 API 参考） ---- */
    const hostPackages = workspaceRoot ? copyHostApiSources(dest, workspaceRoot) : 0

    console.log(
        `[prepare-studio-deps] 已装入 ${placed} 个包（esbuild ${platformPackages.join(' + ')}）、` +
            `tailwind 配置=${tailwindConfig ? '有' : '无'}、宿主标准包=${hostPackages}` +
            `${skipped ? `、跳过可选依赖 ${skipped}` : ''} → ${path.relative(context.appOutDir, dest)}`,
    )
}
