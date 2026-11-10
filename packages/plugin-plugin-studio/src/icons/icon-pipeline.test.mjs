/**
 * AI icon end-to-end pipeline test.
 *
 * The pure tests (`icon-ai.test.mjs`, `icon-art.test.mjs`) each pin one half.
 * This one joins them: a model-style reply goes through extraction +
 * sanitization + validation, is written to a REAL temporary project through the
 * same injected IO the studio passes to the desktop bridge, read back, replaced,
 * and undone. That is the contract the human AI-icon flow depends on, and a
 * regression here is what would make "generate, look, apply, undo" silently
 * write the wrong file or leave the manifest pointing at nothing.
 *
 * Run: node packages/plugin-plugin-studio/src/icons/icon-pipeline.test.mjs
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
    PLUGIN_ICON_RELATIVE_PATH,
    applyPluginIcon,
    readPluginIcon,
    restorePluginIcon,
    writePluginIconSvg,
} from './icon-art.ts'
import { prepareIconReply, validateIconSvg } from './icon-ai.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* A project on disk, and the same IO surface the studio injects (paths only,
 * exactly like `capability.dev.readFile` / `writeFile` / `deleteFile`). */
const root = await mkdtemp(join(tmpdir(), 'kn-icon-pipeline-'))
const manifestPath = join(root, 'package.json')
const iconPath = join(root, PLUGIN_ICON_RELATIVE_PATH)
const entryPath = join(root, 'src', 'index.tsx')

const io = {
    async readFile({ path }) {
        return readFile(path, 'utf8')
    },
    async writeFile({ path, contents }) {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, contents, 'utf8')
    },
    async deleteFile({ path }) {
        await unlink(path)
        return { ok: true, path, relativePath: PLUGIN_ICON_RELATIVE_PATH }
    },
}

const resetProject = async () => {
    await rm(iconPath, { force: true })
    await io.writeFile({
        path: manifestPath,
        contents: JSON.stringify(
            {
                name: 'my-plugin',
                knPluginStudio: {
                    pluginKey: 'my-plugin',
                    displayName: 'My Plugin',
                    entry: 'src/index.tsx',
                },
            },
            null,
            2,
        ) + '\n',
    })
    await io.writeFile({
        path: entryPath,
        contents: [
            "import { KPlugin } from '@kn/common'",
            "import React from 'react'",
            '',
            'export const p = new KPlugin({',
            '    dockPanels: [',
            "        { id: 'p', title: 'P', icon: React.createElement('span', null, '🛠'), component: Panel },",
            '    ],',
            '})',
            '',
        ].join('\n'),
    })
}

const readManifest = async () => JSON.parse(await readFile(manifestPath, 'utf8'))
const exists = (path) => existsSync(path)

/* ------------------------------------------------------------------ *
 * 1) A model reply → a shippable document
 * ------------------------------------------------------------------ */
const reply = [
    '好的，这是为数据同步插件设计的图标：',
    '',
    '```svg',
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg viewBox="0 0 512 512" width="512" height="512">',
    '  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
    '    <stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#0369a1"/>',
    '  </linearGradient></defs>',
    '  <rect width="512" height="512" rx="112" fill="url(#bg)"/>',
    '  <g stroke="#ffffff" stroke-width="26" stroke-linecap="round" fill="none">',
    '    <path d="M168 256a88 88 0 0 1 88-88h88"/>',
    '    <path d="M344 256a88 88 0 0 1-88 88h-88"/>',
    '    <path d="M320 144l24 24-24 24"/>',
    '    <path d="M192 368l-24-24 24-24"/>',
    '  </g>',
    '  <desc>sync &amp; share</desc>',
    '</svg>',
    '```',
    '',
    '希望你喜欢。',
].join('\n')

const prepared = prepareIconReply(reply)
check('prepare: extracts the fenced SVG out of prose', prepared.candidate?.startsWith('<svg') === true)
check('prepare: strips the XML declaration', prepared.candidate?.startsWith('<?xml') === false)
check('prepare: injects the missing xmlns', prepared.candidate?.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') === true)
check('prepare: a valid artwork passes with no problems', prepared.problems.length === 0 && prepared.svg !== null, prepared.problems.join('；'))
check('prepare: validate() agrees with prepare()', validateIconSvg(prepared.svg ?? '').length === 0)

/* ------------------------------------------------------------------ *
 * 2) Write → manifest + file
 * ------------------------------------------------------------------ */
await resetProject()
const firstWrite = await writePluginIconSvg({ root, io, svg: prepared.svg })
const firstManifest = await readManifest()
const written = await readFile(iconPath, 'utf8')
check('write: puts the artwork at assets/icon.svg', written.trim() === prepared.svg)
check(
    'write: points knPluginStudio.icon at it and keeps the project metadata',
    firstManifest.knPluginStudio.icon === PLUGIN_ICON_RELATIVE_PATH
        && firstManifest.knPluginStudio.pluginKey === 'my-plugin'
        && firstManifest.knPluginStudio.displayName === 'My Plugin',
    JSON.stringify(firstManifest.knPluginStudio),
)
check('write: reports the path it wrote', firstWrite.relativePath === PLUGIN_ICON_RELATIVE_PATH)

/* ------------------------------------------------------------------ *
 * 3) Read back → the undo snapshot
 * ------------------------------------------------------------------ */
const snapshot = await readPluginIcon({ root, io })
check(
    'read: returns the pointer and the exact artwork text',
    snapshot.icon === PLUGIN_ICON_RELATIVE_PATH && snapshot.svg?.trim() === prepared.svg,
    JSON.stringify({ icon: snapshot.icon, chars: snapshot.svg?.length ?? 0 }),
)

/* ------------------------------------------------------------------ *
 * 4) Deterministic → AI replace → undo restores the previous artwork
 * ------------------------------------------------------------------ */
await resetProject()
const deterministic = await applyPluginIcon({ root, io, seed: 'my-plugin', keywords: ['sync'] })
const deterministicSvg = (await readFile(iconPath, 'utf8')).trim()
check('replace: deterministic artwork is on disk first', deterministicSvg === deterministic.svg.trim())
const beforeAi = await readPluginIcon({ root, io })

const aiSvg = prepared.svg
await writePluginIconSvg({ root, io, svg: aiSvg })
check('replace: the AI artwork overwrites the file', (await readFile(iconPath, 'utf8')).trim() === aiSvg)

const restored = await restorePluginIcon({ root, io, icon: beforeAi.icon, svg: beforeAi.svg })
const restoredManifest = await readManifest()
const restoredFile = (await readFile(iconPath, 'utf8')).trim()
check('undo: puts the previous artwork back', restoredFile === deterministicSvg)
check(
    'undo: restores the previous pointer',
    restoredManifest.knPluginStudio.icon === PLUGIN_ICON_RELATIVE_PATH && restored.icon === PLUGIN_ICON_RELATIVE_PATH,
)
check('undo: reports the file was not deleted (it was rewritten)', restored.fileRemoved === false)
check(
    'undo: the deterministic rail emoji patch is untouched by the AI path',
    (await readFile(entryPath, 'utf8')).includes(`React.createElement('span', null, '${deterministic.glyph}')`),
)

/* ------------------------------------------------------------------ *
 * 5) No previous icon → undo removes both the pointer and the file
 * ------------------------------------------------------------------ */
await resetProject()
const fresh = await readPluginIcon({ root, io })
check('fresh: a project with no icon reads as null', fresh.icon === null && fresh.svg === null)
await writePluginIconSvg({ root, io, svg: aiSvg })
check('fresh: the generated file exists before undo', exists(iconPath))
const undone = await restorePluginIcon({ root, io, icon: fresh.icon, svg: fresh.svg })
const undoneManifest = await readManifest()
check(
    'fresh undo: drops the icon pointer from the manifest',
    undoneManifest.knPluginStudio.icon === undefined && undone.icon === null,
    JSON.stringify(undoneManifest.knPluginStudio),
)
check('fresh undo: deletes the generated file', undone.fileRemoved === true && !exists(iconPath))

/* ------------------------------------------------------------------ *
 * 6) A malicious reply never reaches the project
 * ------------------------------------------------------------------ */
const malicious = prepared.svg.replace('<rect', '<script>alert(1)</script><rect')
const blocked = prepareIconReply(malicious)
check(
    'guard: a script-bearing candidate is rejected before any write',
    blocked.svg === null && blocked.problems.some((problem) => problem.includes('外部引用')),
    blocked.problems.join('；'),
)

await rm(root, { recursive: true, force: true })

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)