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
  var parts = expression.split('.');
  var value = host;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '__KN__' || parts[i] === '') continue;
    value = value ? value[parts[i]] : undefined;
  }
  if (value === undefined || value === null) {
    if (__knMissing.indexOf(specifier) === -1) __knMissing.push(specifier);
    return {};
  }
  return value;
}
var __knMissing = [];
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
  if (__knMissing.indexOf(specifier) === -1) {
    __knMissing.push(specifier);
    if (typeof console !== 'undefined') console.warn('[plugin-studio] host module not available: ' + specifier);
  }
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

/** Minimal single-file scaffold written by `dev.scaffold`. */
export const renderScaffold = ({ name, pluginKey, displayName }) => {
    const title = displayName || name
    const safeName = name.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')) || 'devPlugin'
    const exportName = safeName.charAt(0).toLowerCase() + safeName.slice(1)

    const packageJson = {
        name,
        version: '0.0.1',
        private: true,
        type: 'module',
        knPluginStudio: { pluginKey, displayName: title, entry: 'src/index.tsx' },
        peerDependencies: {
            react: '>=18',
            'react-dom': '>=18',
            '@kn/common': '*',
            '@kn/ui': '*',
        },
    }

    const index = `import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { DevPanel } from './DevPanel'

class DevPlugin extends KPlugin<PluginConfig> {}

export const ${exportName} = new DevPlugin({
    name: ${JSON.stringify(title)},
    status: 'ACTIVE',
    dockPanels: [
        {
            id: ${JSON.stringify(pluginKey + '-panel')},
            title: ${JSON.stringify(title)},
            icon: React.createElement('span', null, '🛠'),
            component: DevPanel,
        },
    ],
})
`

    const panel = `import React, { useState } from 'react'

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

    const readme = `# ${title}

由插件开发台（plugin-studio）生成的插件工程。

- 清单：\`package.json\` 的 \`knPluginStudio\` 字段（pluginKey / entry / displayName）
- 入口：\`src/index.tsx\`，默认导出一个 \`KPlugin\` 实例
- 依赖 \`react\`、\`@kn/common\`、\`@kn/ui\` 等由宿主提供，不要打包进产物

在「设置 → 插件开发台」里把本目录加入工作区即可开始开发。
`

    return {
        'package.json': JSON.stringify(packageJson, null, 2) + '\n',
        'src/index.tsx': index,
        'src/DevPanel.tsx': panel,
        'README.md': readme,
    }
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
        if (!hostModules[specifier]) hostModules[specifier] = `__KN__.${specifier.replace(/^@kn\//, '')}`
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
        // inject them with the bundle. CSS problems degrade to warnings.
        const cssResult = await buildPluginCss({ root })
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
