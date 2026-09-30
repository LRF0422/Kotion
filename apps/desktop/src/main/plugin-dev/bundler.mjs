/**
 * Plugin source bundler.
 *
 * Turns a plugin *source project* into a bundle the host window can install at
 * runtime. Runs inside the dev-server child process (plain Node), never in the
 * renderer, so a broken build cannot take the host down.
 *
 * Design notes:
 * - **Host modules stay external.** `react`, `@kn/common`, `@kn/ui`, … are
 *   resolved through a `require()` shim generated in the bundle banner that
 *   reads `window.__KN__`. That keeps one React instance, keeps bundles small,
 *   and makes hot-reload independent of host library versions.
 * - **The registration seam is generated, not hand-written.** A virtual entry
 *   re-exports the author's module and calls `__KN__.definePlugin(key, …)`, so
 *   authors never write the UMD `outro` by hand (the repo's rollup build does
 *   the same thing for published plugins).
 * - **Subpaths map to the package global.** `@kn/common/x` and `@kn/ui/y` fall
 *   back to the package global, because the host only publishes package roots.
 */
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { buildPluginCss } from './tailwind.mjs'

const require = createRequire(import.meta.url)

/**
 * esbuild is loaded lazily.
 *
 * A plain `import * as esbuild from 'esbuild'` would make Rollup drop this whole
 * module (the dynamic import of a package with an installed binary cannot be
 * safely inlined), and would also pay esbuild's startup cost on every app launch
 * even though the child process that needs it only starts on demand.
 */
let esbuildPromise
const loadEsbuild = () => {
    if (!esbuildPromise) esbuildPromise = import('esbuild')
    return esbuildPromise
}

/** Import specifiers that must resolve to a host global, not be bundled. */
export const DEFAULT_HOST_MODULES = {
    react: 'React',
    'react-dom': 'ReactDOM',
    'react-dom/client': 'ReactDOM',
    'react/jsx-runtime': 'React',
    'react/jsx-dev-runtime': 'React',
    '@kn/common': '__KN__.common',
    '@kn/core': '__KN__.core',
    '@kn/ui': '__KN__.ui',
    '@kn/icon': '__KN__.icon',
    '@kn/editor': '__KN__.editor',
    '@kn/plugin-api': '__KN__.pluginApi',
}

const VIRTUAL_ENTRY = 'kn-studio-entry'
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'release', 'out', '.turbo'])

/**
 * The host-namespace name a declared external resolves to.
 *
 * A declared external is a *host global*, so the name is the package's own
 * name with any scope dropped — the same rule for `@kn/chart` and
 * `@scope/pkg`, which both map to `chart` / `pkg`. The studio validates the
 * name against the running host before building, so a wrong guess is reported
 * instead of silently resolving to `{}`.
 */
export const hostNameForExternal = (specifier) => {
    if (!specifier.startsWith('@')) return specifier
    const slash = specifier.indexOf('/')
    return slash === -1 ? specifier : specifier.slice(slash + 1)
}

/**
 * Marks a host-module expression that is a *name* to look up rather than a path
 * to walk: `__KNNAME__chart` reads `window.__KN__.chart`, then `globalThis.chart`.
 *
 * Declared externals use this form, so any specifier works — including scoped
 * ones like `@scope/pkg`, which could never be spliced into a dotted path.
 */
export const HOST_NAME_PREFIX = '__KNNAME__'

export const toPosix = (value) => value.split(sep).join('/')

/**
 * Convert a host global expression into a readable local identifier, e.g.
 * `__KN__.common` -> `__KN_common`, `React` -> `React`.
 */
const localNameFor = (specifier, globalExpression) => {
    const named = { React: 'React', ReactDOM: 'ReactDOM' }[globalExpression]
    if (named) return named
    const slug = specifier.replace(/^@/, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    return `__host_${slug || 'mod'}`
}

/**
 * The `require()` shim the bundle uses to reach host libraries.
 *
 * Resolution order for a specifier:
 *   1. exact match in the host module map
 *   2. subpath of a mapped package (`@kn/common/foo` -> `@kn/common`)
 *   3. warn once and return `{}` so one missing host module cannot break the
 *      whole plugin
 *
 * Emitted as an esbuild `banner`, so it lands at the very top of the IIFE —
 * before any rewritten external call runs. Two esbuild details shape it:
 *  - `format: 'iife'` emits `var window;` first, shadowing the global, so the
 *    shim reads the real one through `globalThis.window`.
 *  - esbuild rewrites every free `require` in bundled code to its own
 *    `__require`, which is why externals are redirected to `__knRequire` (a
 *    name esbuild leaves alone) in {@link buildPlugin}.
 */

/**
 * The virtual entry that wires the author's module to the host registry.
 *
 * Emitted as **CommonJS**, not ESM, so esbuild keeps `require` as a real free
 * identifier and the shim's externals resolve verbatim. The namespace is handed
 * to the wrapper through a globalThis slot because esbuild's CommonJS module
 * wrapper does not expose its `module` object to the entry, and the wrapper
 * cannot see the entry's function scope.
 */
export const buildEntryContents = ({ entryPath, deliverSlot }) => `var __knExports = require(${JSON.stringify(toPosix(entryPath))});
globalThis[${JSON.stringify(deliverSlot)}] = __knExports;
`

/**
 * The runtime shim, emitted as an esbuild `banner` so it lands at the very top
 * of the IIFE — before any rewritten external call runs.
 *
 * Two esbuild details shape this code:
 *  - `format: 'iife'` emits `var window;` at the top, shadowing the global, so
 *    the shim reads the real one through `globalThis.window`.
 *  - esbuild rewrites every free `require` in bundled code to its own
 *    `__require`, which is why externals are redirected to `__knRequire`
 *    (a name esbuild leaves alone) after the build.
 */
export const buildRuntimePrelude = ({ hostModules }) => {
    const entries = Object.entries(hostModules)
    const declarations = entries
        .map(([specifier, expression]) => {
            const local = localNameFor(specifier, expression)
            return `  var ${local} = __knHost(${JSON.stringify(expression)}, ${JSON.stringify(specifier)});`
        })
        .join('\n')

    const exact = entries
        .map(([specifier, expression]) => `  ${JSON.stringify(specifier)}: ${localNameFor(specifier, expression)}`)
        .join(',\n')

    const fallbacks = [...new Set(entries.map(([specifier]) => specifier))]
        .map(
            (specifier) =>
                `  { expression: ${JSON.stringify(hostModules[specifier])}, specifier: ${JSON.stringify(specifier)} }`,
        )
        .join(',\n')

    return `/* plugin-studio runtime shim: host modules via globalThis.window.__KN__ */
function __knHostNamespace() {
  /* Reflect.get keeps esbuild from capturing the IIFE's shadowing \`var window\`. */
  var host = typeof globalThis !== 'undefined' ? Reflect.get(globalThis, 'window') : undefined;
  return (host && host.__KN__) || {};
}
function __knHost(expression, specifier) {
  var host = __knHostNamespace();
  if (expression === 'React') return host.React || (typeof globalThis !== 'undefined' && globalThis.React) || {};
  if (expression === 'ReactDOM') return host.ReactDOM || (typeof globalThis !== 'undefined' && globalThis.ReactDOM) || {};
  /* Declared externals: look the NAME up on the host namespace first, then on
     globalThis — so a library the host (or another script) publishes can be
     shared instead of bundled. The prefix is a marker, not a path. */
  if (expression.indexOf('${HOST_NAME_PREFIX}') === 0) {
    var named = expression.slice(${HOST_NAME_PREFIX.length});
    var fromNamespace = host ? host[named] : undefined;
    if (fromNamespace !== undefined && fromNamespace !== null) return fromNamespace;
    var fromGlobal = typeof globalThis !== 'undefined' ? Reflect.get(globalThis, named) : undefined;
    if (fromGlobal !== undefined && fromGlobal !== null) return fromGlobal;
    __knNoteMissing(specifier);
    return {};
  }
  var parts = expression.split('.');
  var value = host;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '__KN__' || parts[i] === '') continue;
    value = value ? value[parts[i]] : undefined;
  }
  if (value === undefined || value === null) {
    __knNoteMissing(specifier);
    return {};
  }
  return value;
}
var __knMissing = [];
function __knNoteMissing(specifier) {
  if (__knMissing.indexOf(specifier) !== -1) return;
  __knMissing.push(specifier);
  if (typeof console !== 'undefined') console.warn('[plugin-studio] host module not available: ' + specifier);
}
var __knFallbacks = [
${fallbacks}
];
${declarations}
var __knExact = {
${exact}
};
function __knRequire(specifier) {
  if (Object.prototype.hasOwnProperty.call(__knExact, specifier)) return __knExact[specifier];
  for (var i = 0; i < __knFallbacks.length; i++) {
    var entry = __knFallbacks[i];
    if (specifier.indexOf(entry.specifier + '/') === 0) return __knHost(entry.expression, entry.specifier);
  }
  __knNoteMissing(specifier);
  return {};
}
/* Flatten esbuild's CommonJS namespace and register it with the host.
   \`__copyProps\` defines exports as non-enumerable getters, so this enumerates
   own property names instead of using for..in. */
function __knRegister(namespace, key, packageName) {
  var flat = {};
  try {
    var source = (namespace && namespace.__esModule && namespace.default) || namespace || {};
    var names = Object.getOwnPropertyNames(source);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (name === '__esModule') continue;
      try { flat[name] = source[name]; } catch (error) { /* getter threw */ }
    }
  } catch (error) {
    flat = namespace || {};
  }
  try {
    var host = __knHostNamespace();
    if (host && typeof host.definePlugin === 'function') {
      host.definePlugin(key, flat, { apiVersion: host.hostApiVersion, packageName: packageName });
      host.__lastDevPlugin = flat;
    }
  } catch (error) {
    if (typeof console !== 'undefined') console.error('[plugin-studio] registration failed', error);
  }
  return flat;
}
`
}

/**
 * Scaffold templates.
 *
 * Each template is a working starting point for one contribution point, and
 * every one of them must build as-is (the smoke test proves it) — an agent's
 * first `createPluginProject` must never produce a project that looks broken.
 *
 * Deliberately no `editor` node template: `@tiptap/core` is not a host module,
 * and a plugin that bundles its own copy would register ProseMirror nodes from
 * a different schema instance than the host editor's. The `command` template
 * therefore contributes a slash-menu entry only (`extendsion: []`).
 */
export const SCAFFOLD_TEMPLATES = ['panel', 'page', 'settings', 'command', 'blank']

export const DEFAULT_SCAFFOLD_TEMPLATE = 'panel'

/** Metadata collected from the project manifest. */
export const readProjectManifest = async (root) => {
    const manifestPath = join(root, 'package.json')
    let manifest = {}
    try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
        if (error && error.code !== 'ENOENT') throw new Error(`Invalid package.json: ${error.message}`)
    }

    const studio = manifest.knPluginStudio || manifest.knPlugin || {}
    const name = manifest.name || 'kn-dev-plugin'
    const pluginKey = studio.pluginKey || manifest.knPluginKey || name.replace(/^@[^/]+\//, '')

    const entryCandidates = [
        studio.entry,
        manifest.source,
        manifest.module,
        manifest.main,
    ].filter((value) => typeof value === 'string' && value)

    let entry = null
    for (const candidate of entryCandidates) {
        const candidatePath = resolve(root, candidate)
        if (SOURCE_EXTENSIONS.includes(extname(candidatePath))) {
            try {
                await readFile(candidatePath, 'utf8')
                entry = candidatePath
                break
            } catch {
                // try the next candidate
            }
        }
    }
    if (!entry) entry = await findEntry(root)

    return {
        name,
        pluginKey,
        displayName: studio.displayName || manifest.knDisplayName || null,
        icon: studio.icon || null,
        apiVersion: studio.apiVersion || null,
        entry,
        manifest,
    }
}

/** Depth-first search for the first `src/index.*`-style entry. */
export const findEntry = async (root) => {
    const preferred = ['src/index', 'index']
    for (const base of preferred) {
        for (const extension of SOURCE_EXTENSIONS) {
            const candidate = join(root, base + extension)
            try {
                await readFile(candidate, 'utf8')
                return candidate
            } catch {
                // keep looking
            }
        }
    }

    const queue = [root]
    while (queue.length) {
        const dir = queue.shift()
        let entries
        try {
            entries = await readdir(dir, { withFileTypes: true })
        } catch {
            continue
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) queue.push(full)
                continue
            }
            if (SOURCE_EXTENSIONS.includes(extname(entry.name))) return full
        }
    }
    return null
}


/**
 * CSS injection snippet prepended to the bundle. A per-plugin style tag means
 * a hot reload replaces the previous CSS instead of stacking copies.
 */
export const buildCssInjection = (pluginKey, css) => {
    if (!css) return ''
    return `
var __knStyleKey = ${JSON.stringify(pluginKey)};
var __knCss = ${JSON.stringify(css)};
try {
  var __knDocument = typeof document !== 'undefined' ? document : null;
  if (__knDocument && __knCss) {
    var __knSelector = 'style[data-kn-plugin-style="' + __knStyleKey + '"]';
    var __knStyle = __knDocument.querySelector(__knSelector);
    if (!__knStyle) {
      __knStyle = __knDocument.createElement('style');
      __knStyle.setAttribute('data-kn-plugin-style', __knStyleKey);
      (__knDocument.head || __knDocument.documentElement).appendChild(__knStyle);
    }
    __knStyle.textContent = __knCss;
  }
} catch (__knCssError) { /* CSS injection is best-effort */ }
`
}

/** Escape a value for use inside a double-quoted CSS attribute selector. */
const escapeCssAttributeValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/**
 * The DOM scope the host tags a plugin's dock panel with. The bundler scopes
 * the plugin's compiled CSS to it so the plugin's utilities cannot leak into
 * the host document; the host sets the matching `data-kn-plugin` attribute in
 * its dock (see DockHost).
 */
export const pluginCssScope = (pluginKey) =>
    `[data-kn-plugin="${escapeCssAttributeValue(pluginKey)}"]`

/** `my-kn-plugin` -> `myKnPlugin`; used for generated export/class names. */
const toIdentifier = (value, fallback = 'devPlugin') => {
    const safe = String(value).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')) || fallback
    return safe.charAt(0).toLowerCase() + safe.slice(1)
}

/** A `/`-menu path segment derived from the registry key. */
const toSlug = (value, fallback = 'command') =>
    String(value)
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || fallback

/**
 * Render one template project.
 *
 * `template` selects the contribution point the project starts from, so an
 * agent (or the New-project dialog) can produce a page renderer, a settings
 * panel, a slash command or a bare plugin instead of always getting a dock
 * panel. An unknown template is an error rather than a silent fallback: a typo
 * must not quietly change what got created.
 *
 * Every template must build as-is; the studio's smoke test builds all of them.
 */
export const renderScaffold = ({ name, pluginKey, displayName, template }) => {
    const chosen = template || DEFAULT_SCAFFOLD_TEMPLATE
    if (!SCAFFOLD_TEMPLATES.includes(chosen)) {
        throw new Error(
            `Unknown scaffold template "${chosen}". Expected one of: ${SCAFFOLD_TEMPLATES.join(', ')}`,
        )
    }

    const title = displayName || name
    const exportName = toIdentifier(name)
    const panelId = `${pluginKey}-panel`
    const pageTypeId = `${pluginKey}:page`

    const packageJson = {
        name,
        version: '0.0.1',
        private: true,
        type: 'module',
        knPluginStudio: { pluginKey, displayName: title, entry: 'src/index.tsx', template: chosen },
        peerDependencies: {
            react: '>=18',
            'react-dom': '>=18',
            '@kn/common': '*',
            '@kn/ui': '*',
        },
    }

    const files = { 'package.json': JSON.stringify(packageJson, null, 2) + '\n' }
    let nextStep

    if (chosen === 'panel') {
        files['src/index.tsx'] = `import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { DevPanel } from './DevPanel'

class DevPlugin extends KPlugin<PluginConfig> {}

export const ${exportName} = new DevPlugin({
    name: ${JSON.stringify(title)},
    status: 'ACTIVE',
    dockPanels: [
        {
            id: ${JSON.stringify(panelId)},
            title: ${JSON.stringify(title)},
            icon: React.createElement('span', null, '🛠'),
            component: DevPanel,
        },
    ],
})
`
        files['src/DevPanel.tsx'] = `import React, { useState } from 'react'

/**
 * Contributed dock panel. Rendered by the host, so it must not import its own
 * React — the host's copy is injected at bundle time.
 */
export const DevPanel: React.FC = () => {
    const [count, setCount] = useState(0)
    return (
        <div className="flex flex-col gap-3 p-4 text-sm">
            <div className="font-medium">${title}</div>
            <p className="text-muted-foreground">
                这是 ${pluginKey} 贡献的侧边面板。编辑 src/DevPanel.tsx 保存后会自动热更。
            </p>
            <button
                className="rounded-md border px-3 py-1.5 hover:bg-accent"
                onClick={() => setCount((value) => value + 1)}
            >
                clicked {count}
            </button>
        </div>
    )
}
`
        nextStep = '编辑 src/DevPanel.tsx（面板内容）或 src/index.tsx（面板注册信息：id/title/order/position）。'
    } else if (chosen === 'page') {
        files['src/index.tsx'] = `import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { CanvasPage } from './CanvasPage'

class PagePlugin extends KPlugin<PluginConfig> {}

export const ${exportName} = new PagePlugin({
    name: ${JSON.stringify(title)},
    status: 'ACTIVE',
    pageTypes: [
        {
            // Stable, namespaced id: the host resolves pages by it, so never
            // change it once pages of this type exist.
            id: ${JSON.stringify(pageTypeId)},
            label: ${JSON.stringify(title)},
            description: '整页视图，由插件渲染',
            icon: React.createElement('span', null, '📄'),
            defaultTitle: ${JSON.stringify(title)},
            order: 100,
            // type: 'component' — your React tree IS the page.
            // Swap for { type: 'editor-component', createInitialDocument } to
            // embed a node inside the standard editor instead.
            renderer: { type: 'component', component: CanvasPage },
        },
    ],
})
`
        files['src/CanvasPage.tsx'] = `import React from 'react'
import type { PageRendererProps } from '@kn/common'

/**
 * Whole-page renderer: the host mounts it for every page of this plugin's page
 * type, in the editing view and in the read-only shared view.
 */
export const CanvasPage: React.FC<PageRendererProps> = ({ page, pageId, spaceId, active, readOnly, mode }) => (
    <div className="flex h-full flex-col gap-3 overflow-auto p-6 text-sm">
        <h1 className="text-lg font-semibold">{page?.title || 'Untitled'}</h1>
        <p className="text-muted-foreground">
            space: {spaceId} · page: {pageId} · mode: {mode}
            {readOnly ? ' · read-only' : ''}
            {active ? ' · active' : ''}
        </p>
        <p className="text-muted-foreground">编辑 src/CanvasPage.tsx 保存后会自动热更。</p>
    </div>
)
`
        nextStep = '编辑 src/CanvasPage.tsx 渲染页面内容；pageTypes 的 id 一经使用不要再改。'
    } else if (chosen === 'settings') {
        files['src/index.tsx'] = `import { KPlugin, PluginConfig } from '@kn/common'
import { SettingsPanel } from './SettingsPanel'

class SettingsPlugin extends KPlugin<PluginConfig> {}

export const ${exportName} = new SettingsPlugin({
    name: ${JSON.stringify(title)},
    status: 'ACTIVE',
    settings: {
        key: ${JSON.stringify(`${pluginKey}:settings`)},
        label: ${JSON.stringify(title)},
        description: '插件设置',
        component: SettingsPanel,
    },
})
`
        files['src/SettingsPanel.tsx'] = `import React, { useState } from 'react'
import { Input, Label } from '@kn/ui'

/**
 * Rendered inside the host's settings dialog. The host passes the plugin's
 * registry key, so one component can serve several panels if you want.
 */
export const SettingsPanel: React.FC<{ pluginKey?: string }> = ({ pluginKey }) => {
    const [value, setValue] = useState('')
    return (
        <div className="flex flex-col gap-3 p-1 text-sm">
            <div className="space-y-1.5">
                <Label htmlFor="plugin-setting">示例配置</Label>
                <Input
                    id="plugin-setting"
                    value={value}
                    placeholder={pluginKey ? 'pluginKey: ' + pluginKey : 'example'}
                    onChange={(event) => setValue(event.target.value)}
                />
            </div>
            <p className="text-xs text-muted-foreground">
                这里可以放插件自己的配置项；保存请走宿主的服务，不要直接写 localStorage 之外的存储。
            </p>
        </div>
    )
}
`
        nextStep = '编辑 src/SettingsPanel.tsx 放置真实配置项（设置对话框 → 你的插件分组）。'
    } else if (chosen === 'command') {
        const slug = toSlug(pluginKey)
        files['src/index.tsx'] = `import { KPlugin, PluginConfig } from '@kn/common'
import { slashCommandExtension } from './slash-command'

class CommandPlugin extends KPlugin<PluginConfig> {}

export const ${exportName} = new CommandPlugin({
    name: ${JSON.stringify(title)},
    status: 'ACTIVE',
    editorExtension: [slashCommandExtension],
})
`
        files['src/slash-command.ts'] = `import React from 'react'
import type { ExtensionWrapper } from '@kn/common'

/**
 * Editor contribution: one entry in the editor's "/" slash menu.
 *
 * \`extendsion\` is empty on purpose — this entry only runs an editor command and
 * contributes no node. To contribute a real Tiptap node, drop the extension in
 * here AND make sure \`@tiptap/core\` comes from the host instead of the project:
 * a plugin that bundles its own copy registers ProseMirror nodes built from a
 * different schema instance, and the editor rejects them.
 */
export const slashCommandExtension: ExtensionWrapper = {
    name: ${JSON.stringify(`${pluginKey}:command`)},
    extendsion: [],
    slashConfig: [
        {
            icon: React.createElement('span', { className: 'text-base leading-none' }, '📌'),
            text: ${JSON.stringify(title)},
            slash: ${JSON.stringify(`/${slug}`)},
            action: (editor) => {
                editor.chain().focus().insertContent('📌 ').run()
            },
        },
    ],
}
`
        nextStep = '编辑 src/slash-command.ts 的 text/slash/action（在编辑器里输入 “/” 即可看到）。'
    } else {
        files['src/index.tsx'] = `import { KPlugin, PluginConfig } from '@kn/common'

class MyPlugin extends KPlugin<PluginConfig> {}

/**
 * A valid plugin that contributes nothing yet. Add contribution points to this
 * config — dockPanels / pageTypes / settings / editorExtension / routes /
 * menus / tools / skills — see README.md.
 */
export const ${exportName} = new MyPlugin({
    name: ${JSON.stringify(title)},
    status: 'ACTIVE',
})
`
        nextStep = '在 src/index.tsx 里加入你要的贡献点（dockPanels、pageTypes、settings、editorExtension、tools…）。'
    }

    files['README.md'] = `# ${title}

由插件开发台（plugin-studio）生成的插件工程，模板：\`${chosen}\`。

- 清单：\`package.json\` 的 \`knPluginStudio\` 字段（pluginKey / entry / displayName / template）
- 入口：\`src/index.tsx\`，导出一个 \`KPlugin\` 实例
- 依赖 \`react\`、\`@kn/common\`、\`@kn/ui\` 等由宿主提供，不要打包进产物
- 构建产物是标准插件 UMD 包，可直接上架插件市场

下一步：${nextStep}

在「插件开发台」侧边面板里选中本工程即可开始热更开发。
`

    return files
}

/** Files esbuild actually pulled into the bundle, project-relative, entry last. */
export const collectModules = (metafile, root, entry) => {
    if (!metafile) return []
    const modules = []
    for (const path of Object.keys(metafile.inputs || {})) {
        // Plugin namespaces (the virtual entry) are not project files.
        if (path.includes(':')) continue
        const absolute = resolve(root, path)
        const relativePath = toPosix(relative(root, absolute))
        if (relativePath.startsWith('..')) continue
        if (!modules.includes(relativePath)) modules.push(relativePath)
    }
    const entryPath = entry ? toPosix(relative(root, entry)) : null
    return modules.sort((left, right) => {
        if (left === entryPath) return 1
        if (right === entryPath) return -1
        return left.localeCompare(right)
    })
}

/**
 * Bundle a plugin project.
 *
 * The output shape is the registration seam:
 *
 *   (() => {  var __knBridge = (() => { … })();          // shim + author code
 *             return __knBridge; })();
 *
 * esbuild's `globalName: 'window.__KN__.definePlugin'` assigns the module
 * namespace to that path, so `definePlugin` is called with the plugin's exports
 * and the build-time API version — the same handshake the repo's rollup build
 * performs for published plugins, but generated instead of hand-written.
 *
 * @returns `{ ok: true, code, outFile, modules, warnings }` or
 *          `{ ok: false, errors }` — never throws for build errors, so the
 *          caller can surface them in the studio without killing the watcher.
 */
export const buildPlugin = async ({ root, entry, pluginKey, name, writeToDisk = false, externals = [], minify = false }) => {
    if (!entry) {
        return { ok: false, errors: ['No entry file found. Set knPluginStudio.entry in package.json or add src/index.tsx.'] }
    }
    if (!pluginKey) {
        return { ok: false, errors: ['No pluginKey. Set knPluginStudio.pluginKey in package.json.'] }
    }

    const hostModules = { ...DEFAULT_HOST_MODULES }
    for (const specifier of externals) {
        if (!hostModules[specifier]) {
            hostModules[specifier] = HOST_NAME_PREFIX + hostNameForExternal(specifier)
        }
    }

    let esbuild
    try {
        esbuild = await loadEsbuild()
    } catch (error) {
        return { ok: false, errors: [`Bundler unavailable: ${error.message}`] }
    }

    const warnings = []
    const deliverSlot = `__knStudioDeliver__${Math.random().toString(36).slice(2)}`

    const virtualEntryPlugin = {
        name: 'kn-studio-entry',
        setup(build) {
            build.onResolve({ filter: new RegExp(`^${VIRTUAL_ENTRY}$`) }, () => ({
                path: VIRTUAL_ENTRY,
                namespace: 'kn-studio',
            }))
            build.onLoad({ filter: /.*/, namespace: 'kn-studio' }, () => ({
                contents: buildEntryContents({ entryPath: entry, deliverSlot }),
                loader: 'js',
                resolveDir: dirname(entry),
            }))
        },
    }

    const outFile = join(root, 'dist', 'index.js')

    try {
        const result = await esbuild.build({
            entryPoints: [VIRTUAL_ENTRY],
            absWorkingDir: root,
            bundle: true,
            write: false,
            metafile: true,
            format: 'iife',
            // Deliberately no `globalName`: it makes esbuild emit a top-level
            // `var window;` shadow (there is no global object inside a bundle
            // besides the IIFE), which breaks every host-namespace read. The
            // wrapper below owns the namespace assignment instead.
            platform: 'browser',
            target: ['chrome120'],
            jsx: 'transform',
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
            loader: { '.jsx': 'jsx' },
            logLevel: 'silent',
            sourcemap: false,
            minify,
            external: Object.keys(hostModules),
            banner: { js: buildRuntimePrelude({ hostModules }) },
            plugins: [virtualEntryPlugin],
        })

        const output = result.outputFiles?.[0]
        if (!output) return { ok: false, errors: ['Bundler produced no output'], warnings }

        const modules = collectModules(result.metafile, root, entry)

        // Compile the plugin's Tailwind utilities with the host theme and
        // inject them with the bundle, scoped to the plugin's own DOM so they
        // cannot restyle the host. CSS problems degrade to warnings.
        const cssResult = await buildPluginCss({ root, scope: pluginCssScope(pluginKey) })
        for (const warning of cssResult.warnings) warnings.push(warning)

        // esbuild rewrites externals to its own `__require` helper (sometimes
        // suffixed, e.g. `__require2`). Redirect every such *call* to the host
        // shim; the declaration site is skipped by the lookahead, and
        // `__knRequire` itself by the lookbehind.
        //
        // esbuild then wraps them in its CommonJS interop helper (`__toESM`),
        // which is right for `react`/`react-dom` (plugins use the default
        // export) but wrong for the `@kn/*` packages: their host objects are
        // already live namespaces, and the wrapper would add a `default` key
        // while hiding the named exports the plugin imports.
        const knHostPattern = '@kn/[a-z0-9-]+'
        const body = output.text
            .replace(/(?<!kn)\b__require\d*(?!\s*=)/g, '__knRequire')
            .replace(
                new RegExp(`__toESM\\(\\s*(__knRequire\\(\\s*["']${knHostPattern}["']\\s*\\))\\s*,\\s*\\d\\s*\\)`, 'g'),
                '$1',
            )
            .replace(
                new RegExp(`__toESM\\(\\s*(__knRequire\\(\\s*["']${knHostPattern}["']\\s*\\))\\s*\\)`, 'g'),
                '$1',
            )

        // The wrapper publishes the flattened namespace to the host registry.
        // It reads the entry's exports from a globalThis slot because esbuild's
        // CommonJS module wrapper does not expose `module` to the entry.
        const code = `(() => {
${body}
${buildCssInjection(pluginKey, cssResult.css)}
var __knNamespace;
try {
  __knNamespace = globalThis[${JSON.stringify(deliverSlot)}];
  delete globalThis[${JSON.stringify(deliverSlot)}];
} catch (error) {
  __knNamespace = undefined;
}
return __knRegister(__knNamespace, ${JSON.stringify(pluginKey)}, ${JSON.stringify(name)});
})();
//# sourceURL=kn-plugin://${name}/dist/index.js
`

        if (writeToDisk) {
            await mkdir(dirname(outFile), { recursive: true })
            await writeFile(outFile, code, 'utf8')
        }

        return {
            ok: true,
            code,
            outFile: writeToDisk ? outFile : undefined,
            modules,
            warnings,
        }
    } catch (error) {
        const errors = (error.errors || []).map((item) => {
            const location = item.location ? `${item.location.file}:${item.location.line}` : null
            return location ? `${location}: ${item.text}` : item.text
        })
        return {
            ok: false,
            errors: errors.length ? errors : [error.message || String(error)],
            warnings,
        }
    }
}
