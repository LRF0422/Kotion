/**
 * electron-builder `afterPack` 钩子。
 *
 * electron-builder 只允许在 build 配置里写**一个** afterPack，所以这里串两件事：
 *
 * 1. **装入开发台运行时依赖**（所有平台）—— 见 ./prepare-studio-deps.cjs。
 *    开发台的编译跑在子进程里，需要 esbuild（含平台二进制）、Tailwind/PostCSS 工具链
 *    和宿主标准包源码；而本项目的 electron-builder `files` 只包含 out 目录、且排除了
 *    node_modules。不装入它们，打包后的「插件开发台」构建失败、没有样式、agent 也查不到
 *    宿主接口。
 * 2. **macOS ad-hoc 重新签名**（仅 darwin）—— 见下。
 *
 * 顺序有讲究：资源要先落到 `app.asar.unpacked/`，再签名，否则新加的文件不在签名封印里，
 * 会让 `codesign --verify --deep --strict` 失败。
 *
 * ## ad-hoc 签名的背景（第 2 件事）
 *
 * macOS（尤其 Apple Silicon）要求 .app 的主可执行文件带有有效签名。
 * electron-builder 在没有配置 Developer ID 证书时会 **完全跳过** 签名，
 * 于是打包产物只剩下链接器写入的 ad-hoc 签名：
 *
 *   $ codesign -dv "KN Desktop.app"
 *   Identifier=Electron
 *   Signature=adhoc
 *   Info.plist=not bound
 *   Sealed Resources=none
 *   $ codesign --verify --deep --strict "KN Desktop.app"
 *   code has no resources but signature indicates they must be present
 *
 * 即 app.asar / Info.plist 没有被封印进签名。该 .app 一旦被浏览器下载
 * （带上 com.apple.quarantine），Gatekeeper 就会弹出
 * “App is damaged and can't be opened. You should move it to the Bin.”。
 *
 * 本钩子在打包完成后（electron-builder 的签名步骤之前）对 .app 做一次
 * ad-hoc 重新签名，使签名覆盖 Info.plist 与 Resources，效果：
 *   - `codesign --verify --deep --strict` 通过（不再是“已损坏”）；
 *   - 本机 / 内网分发时 `xattr -dr com.apple.quarantine <app>` 后即可打开。
 *
 * 注意：ad-hoc 签名 **不能** 通过 Gatekeeper 的公证校验（`spctl -a` 仍为
 * rejected），对外公开分发必须使用 Developer ID 签名 + 公证，见 README。
 * 检测到真实签名凭证时本钩子会自动跳过，不干扰正式签名流程。
 *
 * 关闭方式：KN_ADHOC_SIGN=false（签名） / KN_SKIP_STUDIO_DEPS=1（运行时依赖）
 */

const { execFile } = require('node:child_process')
const path = require('node:path')
const { promisify } = require('node:util')
const prepareStudioDependencies = require('./prepare-studio-deps.cjs')

const execFileAsync = promisify(execFile)
const MAX_BUFFER = 64 * 1024 * 1024

/** macOS：ad-hoc 重新签名，让签名真正覆盖 Resources。 */
const adhocSign = async (context) => {
    if (process.env.KN_ADHOC_SIGN === 'false') {
        console.log('[adhoc-sign] KN_ADHOC_SIGN=false，跳过 ad-hoc 签名')
        return
    }
    if (process.env.CSC_LINK || process.env.CSC_NAME || process.env.CSC_KEY_PASSWORD) {
        console.log('[adhoc-sign] 检测到代码签名凭证，交给 electron-builder 正式签名，跳过 ad-hoc 签名')
        return
    }

    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

    // --deep：连同 Contents/Frameworks 下的 Helper、*.framework 一起签名。
    // 顺序由 codesign 自行处理，重新签名外层 .app 时会校验内层签名。
    await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
        maxBuffer: MAX_BUFFER,
    })

    // 校验：失败即让构建失败，避免产出“已损坏”的包。
    await execFileAsync('codesign', ['--verify', '--deep', '--strict', appPath], {
        maxBuffer: MAX_BUFFER,
    })

    console.log(`[adhoc-sign] 已完成 ad-hoc 签名并通过校验: ${appPath}`)
}

module.exports = async function afterPack(context) {
    // 先落资源，再签名 —— 否则 unpacked 出来的依赖不在签名封印里。
    await prepareStudioDependencies(context)

    if (context.electronPlatformName !== 'darwin') return
    await adhocSign(context)
}
