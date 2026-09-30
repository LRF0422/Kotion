/**
 * Plugin Studio — artifact surface test.
 *
 * Guards the data half of the kernel artifact pipeline: which tools map a result
 * to an artifact, what those artifacts look like, and that the mapper table,
 * the tool surface and the card lists all agree.
 *
 * It matters because the kernel derives the artifacts shelf from the transcript
 * via these mappers (`collectAgentArtifacts`). A mapper that points at a tool the
 * studio no longer exposes is dead weight; a producing tool with no mapper is an
 * artifact the user never sees; a mapper that throws breaks the shelf.
 *
 * Run: node packages/plugin-plugin-studio/src/artifacts/surface.test.mjs
 */
import {
    BUILD_ARTIFACT_TOOLS,
    ICON_ARTIFACT_TOOLS,
    PLUGIN_BUILD_KIND,
    PLUGIN_ICON_KIND,
    PLUGIN_PROJECT_KIND,
    PROJECT_ARTIFACT_TOOLS,
    STUDIO_ARTIFACT_KINDS,
    STUDIO_ARTIFACT_MAPPERS,
    baseName,
    buildArtifactFromResult,
    iconArtifactFromResult,
    projectArtifactFromResult,
    readArtifactSnapshot,
    readBuildView,
    readIconView,
    readProjectView,
} from './surface.ts'
import { createStudioTools } from '../studio-tools.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const ROOT = '/managed/agent-made-plugin'
const toolNames = Object.keys(createStudioTools({ getDev: () => undefined, getPluginHost: () => undefined }))

/* ------------------------------------------------------------------ *
 * The declaration agrees with the tool surface
 * ------------------------------------------------------------------ */
check(
    'surface: every mapped tool exists',
    Object.keys(STUDIO_ARTIFACT_MAPPERS).every((name) => toolNames.includes(name)),
    Object.keys(STUDIO_ARTIFACT_MAPPERS).filter((name) => !toolNames.includes(name)).join(', '),
)
check(
    'surface: every producing tool has a mapper',
    [...BUILD_ARTIFACT_TOOLS, ...PROJECT_ARTIFACT_TOOLS, ...ICON_ARTIFACT_TOOLS].every((name) => Boolean(STUDIO_ARTIFACT_MAPPERS[name])),
    [...BUILD_ARTIFACT_TOOLS, ...PROJECT_ARTIFACT_TOOLS, ...ICON_ARTIFACT_TOOLS].filter((name) => !STUDIO_ARTIFACT_MAPPERS[name]).join(', '),
)
check(
    'surface: mapped tools are all carded',
    Object.keys(STUDIO_ARTIFACT_MAPPERS).every(
        (name) =>
            BUILD_ARTIFACT_TOOLS.includes(name)
            || PROJECT_ARTIFACT_TOOLS.includes(name)
            || ICON_ARTIFACT_TOOLS.includes(name),
    ),
    Object.keys(STUDIO_ARTIFACT_MAPPERS).join(', '),
)
check(
    'surface: artifact kinds are the ones the pane renders',
    STUDIO_ARTIFACT_MAPPERS.buildPluginProject({ ok: true, root: ROOT, pluginKey: 'k' })?.kind === PLUGIN_BUILD_KIND
        && STUDIO_ARTIFACT_MAPPERS.createPluginProject({ ok: true, root: ROOT })?.kind === PLUGIN_PROJECT_KIND
        && STUDIO_ARTIFACT_KINDS.includes(PLUGIN_BUILD_KIND)
        && STUDIO_ARTIFACT_KINDS.includes(PLUGIN_PROJECT_KIND)
        && STUDIO_ARTIFACT_KINDS.includes(PLUGIN_ICON_KIND),
)

/* ------------------------------------------------------------------ *
 * Build results → one artifact per project
 * ------------------------------------------------------------------ */
const buildResult = {
    ok: true,
    root: ROOT,
    state: 'watching',
    pluginKey: 'agent-made-plugin',
    name: 'Agent Made',
    buildCount: 3,
    bytes: 4096,
    durationMs: 120,
    modules: ['src/DevPanel.tsx', 'src/index.tsx'],
    installed: true,
}
const buildArtifact = buildArtifactFromResult(buildResult, { root: ROOT })
check('build: kind and identity', buildArtifact?.kind === PLUGIN_BUILD_KIND && buildArtifact?.id === ROOT)
check('build: title from the plugin name', buildArtifact?.title === 'Agent Made' && buildArtifact?.subtitle === '#3')
check(
    'build: payload keeps stats and modules',
    buildArtifact?.data.bytes === 4096 && buildArtifact?.data.moduleCount === 2 && buildArtifact?.data.installed === true,
    JSON.stringify(buildArtifact?.data),
)
check(
    'build: rebuilding the same project keeps one identity',
    buildArtifactFromResult({ ...buildResult, buildCount: 4 }, { root: ROOT })?.id === buildArtifact?.id,
)

check(
    'build: a failed build produces no artifact',
    buildArtifactFromResult({ ok: false, root: ROOT, error: 'src/index.tsx:1: boom' }, { root: ROOT }) === null,
    'a failure has nothing to open; the card still renders the error',
)
check(
    'build: a result without a project produces no artifact',
    buildArtifactFromResult({ ok: true, bytes: 10 }, {}) === null,
)

/* publishPluginProject has no root in its result — the args carry it. */
const publishArtifact = buildArtifactFromResult(
    { ok: true, mode: 'version', pluginId: 11, version: '1.2.0', resourcePath: 'plugins/x.js', buildCount: 5 },
    { root: ROOT, version: '1.2.0' },
)
check(
    'publish: falls back to the args for the project',
    publishArtifact?.id === ROOT && publishArtifact?.subtitle === 'v1.2.0' && publishArtifact?.data.published?.version === '1.2.0',
    JSON.stringify(publishArtifact?.data.published),
)
check(
    'publish: submit is distinguishable from a version release',
    buildArtifactFromResult({ ok: true, mode: 'submit', pluginKey: 'k', version: '1.0.0' }, { root: ROOT })?.subtitle === 'v1.0.0',
)

/* ------------------------------------------------------------------ *
 * Project results
 * ------------------------------------------------------------------ */
const projectResult = {
    ok: true,
    root: ROOT,
    pluginKey: 'agent-made-plugin',
    template: 'page',
    managed: true,
    files: ['package.json', 'src/index.tsx', 'src/CanvasPage.tsx', 'README.md'],
}
const projectArtifact = projectArtifactFromResult(projectResult, { root: ROOT, displayName: 'Agent Made' })
check(
    'project: kind, identity and title',
    projectArtifact?.kind === PLUGIN_PROJECT_KIND && projectArtifact?.id === ROOT && projectArtifact?.title === 'Agent Made',
    JSON.stringify({ kind: projectArtifact?.kind, title: projectArtifact?.title }),
)
check(
    'project: template is the subtitle, files are counted',
    projectArtifact?.subtitle === 'page' && projectArtifact?.data.fileCount === 4 && projectArtifact?.data.managed === true,
    JSON.stringify(projectArtifact?.data),
)
check('project: unknown template falls back to panel', readProjectView({ ok: true, root: ROOT }, {})?.template === 'panel')
check('project: a failed create produces no artifact', projectArtifactFromResult({ ok: false, root: ROOT }, {}) === null)

/* ------------------------------------------------------------------ *
 * Icon results
 * ------------------------------------------------------------------ */
const iconResult = {
    ok: true,
    root: ROOT,
    glyph: '📊',
    isInitial: false,
    color: '#0ea5e9',
    relativePath: 'assets/icon.svg',
    svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    manifest: { previous: null, block: 'knPluginStudio' },
    railIcon: { updated: true, status: 'updated', snippet: "icon: React.createElement('span', null, '📊')," },
}
const iconArtifact = iconArtifactFromResult(iconResult, { root: ROOT, name: 'Agent Made' })
check(
    'icon: kind, identity and title',
    iconArtifact?.kind === PLUGIN_ICON_KIND && iconArtifact?.id === ROOT && iconArtifact?.title === 'Agent Made',
    JSON.stringify({ kind: iconArtifact?.kind, title: iconArtifact?.title }),
)
check(
    'icon: the glyph is the subtitle and the SVG travels in the payload',
    iconArtifact?.subtitle === '📊' && String(iconArtifact?.data.svg).includes('<svg'),
    JSON.stringify(iconArtifact?.subtitle),
)
check(
    'icon: regenerating keeps one identity per project',
    iconArtifactFromResult({ ...iconResult, glyph: '🚀' }, { root: ROOT })?.id === iconArtifact?.id,
)
check('icon: a failed generation produces no artifact', iconArtifactFromResult({ ok: false, root: ROOT }, {}) === null)
check(
    'icon: incomplete results are rejected',
    iconArtifactFromResult({ ok: true, root: ROOT, glyph: '📊' }, {}) === null,
)
const iconSnapshot = readArtifactSnapshot(iconArtifact)
check(
    'pane: reads the icon payload back',
    iconSnapshot?.icon?.glyph === '📊'
        && iconSnapshot?.icon?.relativePath === 'assets/icon.svg'
        && iconSnapshot?.icon?.railUpdated === true,
    JSON.stringify(iconSnapshot?.icon),
)
check(
    'pane: a bare icon artifact still resolves its project root',
    readArtifactSnapshot({ kind: PLUGIN_ICON_KIND, id: ROOT })?.root === ROOT,
)

/* ------------------------------------------------------------------ *
 * View readers and the pane snapshot
 * ------------------------------------------------------------------ */
const failedView = readBuildView({ ok: false, root: ROOT, error: 'boom' }, { root: ROOT })
check(
    'view: a failed build still yields a view (so the card can show it)',
    failedView?.ok === false && failedView?.error === 'boom',
    JSON.stringify(failedView),
)
check('view: garbage input is rejected, not thrown', readBuildView('nope', null) === null && readProjectView(undefined, {}) === null)
check(
    'view: long module lists are counted but truncated',
    readBuildView({ ok: true, root: ROOT, modules: Array.from({ length: 40 }, (_, index) => 'src/m' + index + '.ts') }, {})
        ?.moduleCount === 40
        && readBuildView({ ok: true, root: ROOT, modules: Array.from({ length: 40 }, (_, index) => 'm' + index) }, {})
            ?.modules.length === 24,
)
check('view: baseName survives both separators', baseName('/a/b/c.tsx') === 'c.tsx' && baseName('C:\\a\\b') === 'b')

/* The shelf stores the mapper's artifact; the pane reads it back. */
const snapshot = readArtifactSnapshot(buildArtifact)
check(
    'pane: reads the stored snapshot',
    snapshot?.root === ROOT && snapshot?.moduleCount === 2 && snapshot?.bytes === 4096,
    JSON.stringify(snapshot),
)
/* focusArtifact reconstructs a bare artifact from kind + id: no payload at all. */
const bareSnapshot = readArtifactSnapshot({ kind: PLUGIN_BUILD_KIND, id: ROOT, title: 'Agent Made' })
check(
    'pane: works without a payload (the focusArtifact path)',
    bareSnapshot?.root === ROOT && bareSnapshot?.moduleCount === 0 && bareSnapshot?.bytes === undefined,
    JSON.stringify(bareSnapshot),
)
check('pane: rejects an artifact with no id', readArtifactSnapshot({ kind: PLUGIN_BUILD_KIND, id: '' }) === null)

/* A mapper runs over every transcript result the kernel replays, so it must be
 * total: unknown shapes return null instead of throwing. */
const junk = [undefined, null, 0, 'x', [], () => {}, { ok: true }, { ok: true, root: 5 }]
let threw = ''
for (const value of junk) {
    for (const [name, mapper] of Object.entries(STUDIO_ARTIFACT_MAPPERS)) {
        try {
            const artifact = mapper(value, value)
            if (artifact !== null && typeof artifact?.id !== 'string') {
                threw = `${name} returned an artifact without an id for ${String(value)}`
            }
        } catch (error) {
            threw = `${name} threw for ${String(value)}: ${error.message}`
        }
    }
}
check('mappers: total over junk input', threw === '', threw)

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
