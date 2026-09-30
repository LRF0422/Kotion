/**
 * Plugin Studio — a plugin that builds plugins.
 *
 * Two surfaces, one plugin:
 *  - a side-dock panel (`StudioDockPanel`) that manages the user's dev projects
 *    (start/stop, hot reload, publish) while they keep working;
 *  - a kernel agent surface — the tools that let the agent scaffold, build and
 *    hot-install a project on its own, plus the artifact contribution that makes
 *    a finished build a real, openable artifact in the conversation (see
 *    `./artifacts`).
 *
 * The plugin is desktop-only: `desktopOnly` is honest metadata here, because
 * bundling needs a Node child process, which only the Electron host provides.
 * On the web, and on desktop builds without the `dev.*` capabilities, both
 * surfaces render an explanation instead of failing.
 */
import React from 'react'
import {
    KPlugin,
    getBoundServiceRegistry,
    openAgentArtifact,
    resolveOptionalService,
    type AgentArtifact,
    type PluginConfig,
} from '@kn/common'
import { Wrench } from '@kn/icon'
import * as KN_ICONS from '@kn/icon'
import { StudioDockPanel } from './StudioDockPanel'
import { createStudioTools } from './studio-tools'
import * as iconArt from './icons/icon-art'
import { STUDIO_ARTIFACT_MAPPERS } from './artifacts/surface'
import { STUDIO_ARTIFACT_RENDERERS, STUDIO_TOOL_RENDERERS } from './artifacts'
import { pluginAuthoringSkill } from './skills/plugin-authoring'

/**
 * The icon toolkit: deterministic SVG rendering + project wiring from
 * `./icons/icon-art`, plus the host's real icon component names from `@kn/icon`
 * (a host module, so this costs nothing in the bundle and never goes stale).
 */
const iconToolkit = {
    iconNames: () => Object.keys(KN_ICONS),
    filterIconNames: iconArt.filterIconNames,
    suggestGlyphs: iconArt.suggestGlyphs,
    railIconSnippets: iconArt.railIconSnippets,
    applyIcon: iconArt.applyPluginIcon,
    readDeclaredIcon: iconArt.readDeclaredIcon,
    iconMimeType: iconArt.iconMimeType,
    isUploadableIcon: iconArt.isUploadableIcon,
}

/**
 * Resolve through the globally bound resolver from @kn/common (bound in
 * App.tsx via bindServiceRegistry), not a local createServiceResolver()
 * instance. A fresh instance is never bound, so resolveOptional would always
 * return undefined and the agent tools would report 'no desktop dev
 * capability' even inside the desktop host.
 */
const studioTools = createStudioTools({
    getDev: () => resolveOptionalService('desktop')?.dev,
    getPluginHost: () =>
        resolveOptionalService('pluginHost') as ReturnType<
            Parameters<typeof createStudioTools>[0]['getPluginHost']
        >,
    getMarketplace: () =>
        resolveOptionalService('pluginMarketplace') as ReturnType<
            NonNullable<Parameters<typeof createStudioTools>[0]['getMarketplace']>
        >,
    /**
     * The live service registry (bound by App.tsx). This is what lets the agent
     * answer "what can I call from here": every service name the host and the
     * installed plugins registered, with its owner.
     */
    getServiceRegistry: () => {
        const registry = getBoundServiceRegistry()
        return registry ? (registry as unknown as ReturnType<
            NonNullable<Parameters<typeof createStudioTools>[0]['getServiceRegistry']>
        >) : undefined
    },
    /** Icon art + the host's icon namespace; see `./icons/icon-art`. */
    getIconToolkit: () => iconToolkit,
    /**
     * A finished build becomes the conversation's working target, so the side
     * pane shows the artifact the agent just produced. `openAgentArtifact` is
     * the kernel's imperative entry for agent tools and returns false when no
     * surface has the pane mounted — a silent no-op, never an error.
     */
    focusArtifactResult: (tool, result, args) => {
        const artifact = STUDIO_ARTIFACT_MAPPERS[tool]?.(result, args)
        if (!artifact) return false
        return openAgentArtifact(artifact as AgentArtifact)
    },
})

class PluginStudio extends KPlugin<PluginConfig> {}

export const pluginStudio = new PluginStudio({
    name: 'PluginStudio',
    status: '',
    desktopOnly: true,
    /**
     * The studio's tools + the authoring skill, declared at the top level of the
     * plugin config.
     *
     * They are editor-independent — they drive the desktop dev capabilities, not
     * the document — so every tool declares `scope: 'any'` and reads no editor
     * from the tool context.
     */
    tools: Object.entries(studioTools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        readOnly: Boolean((tool as { readOnly?: boolean }).readOnly),
        scope: 'any' as const,
        // Result → artifact mapping for the tools that PRODUCE something (a
        // build, a scaffolded project). The kernel keys this by the tool's wire
        // name, so the mapper reaches the artifacts shelf and the side pane.
        artifactFromResult: STUDIO_ARTIFACT_MAPPERS[name],
        create: () => tool.execute as (params: unknown) => unknown,
    })),
    // Teach the agent *how* to author a plugin. The skill names its tools, which
    // is also what lets their schemas be delivered on demand.
    skills: [pluginAuthoringSkill],
    /**
     * The presentation half of the artifact pipeline: conversation cards for the
     * producing tools, and the side-pane preview for the studio's artifact
     * kinds. Declared here (not nested under `tools`) because these are kernel
     * contributions, not tool definitions.
     */
    agent: {
        toolRenderers: STUDIO_TOOL_RENDERERS,
        artifactRenderers: STUDIO_ARTIFACT_RENDERERS,
    },
    dockPanels: [
        {
            id: 'plugin-studio-status',
            title: 'pluginStudio.title',
            icon: React.createElement(Wrench, { className: 'h-4 w-4' }),
            position: 'right',
            order: 120,
            defaultWidth: 300,
            hideHeader: true,
            component: StudioDockPanel,
        },
    ],
    locales: {
        en: {
            translation: {
                pluginStudio: {
                    title: 'Plugin Studio',
                    subtitle:
                        'Pick a local plugin project; saving hot-reloads it into the current window, then package when ready',
                    settingsDesc: 'Develop, hot-reload and package plugins on the desktop',
                    desktopOnlyTitle: 'Plugin Studio needs the desktop app',
                    desktopOnly:
                        'Bundling and hot reload need the desktop app\'s child process and filesystem. Open this page in the KN desktop client.',
                    missingDevTitle: 'This desktop build does not support Plugin Studio yet',
                    missingDev:
                        'This client lacks the dev.* capabilities (dev.start / dev.build / dev.scaffold). Update the desktop app to develop plugins here; other features are unaffected.',
                    refresh: 'Refresh',
                    newProject: 'New',
                    newProjectLong: 'New project',
                    addFolder: 'Add',
                    addExisting: 'Add existing folder',
                    status: 'Status',
                    output: 'Output',
                    stop: 'Stop',
                    watch: 'Watch',
                    stopWatching: 'Stop watching',
                    startWatching: 'Start watching',
                    hotReload: 'Hot reload',
                    buildOnce: 'Build once',
                    installNow: 'Hot reload into window',
                    uninstall: 'Uninstall',
                    uninstallHint: 'Uninstall the running dev plugin from the host',
                    remove: 'Remove',
                    removeHint: 'Remove from the list only; files on disk are kept',
                    deleteProjectHint: 'Stop watching and delete this project folder and its files from disk',
                    deleteConfirmTitle: 'Delete plugin project?',
                    deleteConfirmDesc:
                        'This permanently deletes {{path}} and everything inside it. This cannot be undone.',
                    deleteConfirmAction: 'Delete',
                    noProjectsDock: 'No plugin projects yet. Create or add one below.',
                    selectOrCreate: 'Select or create a plugin project.',
                    emptyTitle: 'No plugin projects yet',
                    emptyHint:
                        'Create a template project, let the agent create one, or add an existing folder from disk',
                    managedGroup: 'Managed directory (agent-ready)',
                    addedGroup: 'Added folders',
                    buildLogs: 'Build log',
                    noLogs: 'No logs yet',
                    createTitle: 'New plugin project',
                    packageName: 'Package name',
                    displayName: 'Display name',
                    templateLabel: 'Starting point',
                    template: {
                        panel: 'Side dock panel',
                        page: 'Full page (pageType)',
                        settings: 'Settings panel',
                        command: 'Editor slash command',
                        blank: 'Blank plugin',
                    },
                    templateHint: {
                        panel: 'A panel in the left/right dock. Edit src/DevPanel.tsx for its content.',
                        page: 'A whole-page renderer registered as a page type. Edit src/CanvasPage.tsx.',
                        settings: 'A section in the host settings dialog. Edit src/SettingsPanel.tsx.',
                        command: 'An entry in the editor "/" menu. Edit src/slash-command.ts.',
                        blank: 'A valid plugin with no contributions yet — add the points you need.',
                    },
                    cancel: 'Cancel',
                    createAndWatch: 'Create & watch',
                    createAndStart: 'Create & start watching',
                    pickFolderTitle: 'Select an existing plugin project folder',
                    nameRequired: 'Project name is required',
                    autoInstall: 'Auto hot-reload on save',
                    generateIcon: 'Generate icon',
                    generateIconHint:
                        'Generate assets/icon.svg from the project name and swap the scaffold rail icon to the same glyph',
                    iconGenerated: 'Icon generated: {{glyph}} · rail {{rail}}',
                    iconRail: {
                        updated: 'updated',
                        'no-match': 'left as is',
                        'no-entry': 'no entry file',
                        disabled: 'skipped',
                        unreadable: 'unreadable',
                    },
                    pluginKeyLabel: 'pluginKey: ',
                    modulesLabel: 'Modules: ',
                    conventionsTitle: 'Project conventions',
                    conventions:
                        'The <code>knPluginStudio</code> block in <code>package.json</code> describes the project: <code>pluginKey</code> (registry key), <code>entry</code> (entry file, defaults to src/index.tsx) and <code>displayName</code>.<br /><code>react</code>, <code>@kn/common</code>, <code>@kn/ui</code>, <code>@kn/icon</code>, <code>@kn/editor</code> and <code>@kn/plugin-api</code> are injected by the host and are not bundled.',
                    noBuildYet: 'No build output to install yet',
                    installRejected: 'The host refused activation: check the plugin version or name conflicts',
                    autoInstallFailed: 'Auto-install failed: {{message}}',
                    selectFirst: 'Select a plugin project first',
                    unsupported: 'This host does not support plugin development',
                    publishTitle: 'Publish to marketplace',
                    publishDesc: 'Build this project, upload the artifact, then submit it for review or publish a new version.',
                    publishListed: 'Listed',
                    publishNew: 'New plugin',
                    publishSelectProject: 'Select a plugin project first.',
                    publishNoBuild: 'Build failed; nothing to publish.',
                    publishSubmitAction: 'Submit for review',
                    publishVersionAction: 'Publish version',
                    publishSubmitDone: 'Submitted for review.',
                    publishVersionDone: 'Published version {{version}}.',
                    marketplaceUnavailable: 'This host does not expose the plugin marketplace service.',
                    upgradeTitle: 'Plugin updates',
                    upgradeDesc: 'Installed plugins with a newer version available.',
                    upgradeAction: 'Upgrade',
                    upgradeEmpty: 'Everything is up to date.',
                    version: 'Version',
                    category: 'Category',
                    descriptionLabel: 'Description',
                    descriptionPlaceholder: 'What does this plugin do? (at least 10 characters)',
                    tagsLabel: 'Tags (comma separated)',
                    tabPublish: 'Publish',
                    versionDescTitle: 'Version notes',
                    versionDescFeature: 'Feature (what it does)',
                    versionDescDetail: 'Detail (how it works)',
                    versionDescChangeLog: 'Change log (what changed in this version)',
                    versionDescRequired: 'Add at least one version note (Feature / Detail / ChangeLog).',
                    publishAction: 'Publish',
                    artifact: {
                        buildFailed: 'Build failed: {{name}}',
                        installed: 'hot-reloaded',
                        openBeside: 'Preview',
                        moduleCount: '{{n}} modules',
                        fileCount: '{{n}} files',
                        publishedVersion: 'Published v{{version}}',
                        submitted: 'Submitted for review',
                        noSession: 'No dev session yet',
                        watching: 'watched',
                        build: 'Build',
                        size: 'Size',
                        time: 'Duration',
                        modules: 'Modules',
                        moduleList: 'Bundled modules',
                        hotReload: 'Preview',
                        files: 'Files',
                        managed: 'Directory',
                        managedBadge: 'Managed',
                        path: 'Path',
                        published: 'Published',
                        desktopOnlyHint: 'Live state comes from the desktop dev bridge; this host has none.',
                        paneHint: 'Watch, build and hot-reload from the Plugin Studio panel.',
                    },
                    preview: {
                        liveHint: 'Live preview of what this plugin contributes — updates on hot reload.',
                        notRunning:
                            'This plugin is not running in the window yet. Build and hot-reload it first (runPluginProject / buildPluginProject), then reopen this preview.',
                        left: 'left dock',
                        right: 'right dock',
                        crashed: '{{name}} failed to render',
                        editorComponent:
                            'This page type renders through an editor node, so it needs a real page — it cannot be mounted in the preview.',
                        page: 'page type',
                        settings: 'settings',
                        slash: 'slash command {{list}}',
                        toolbar: 'toolbar button',
                        bubble: 'bubble menu',
                        footer: 'page footer',
                        floating: 'floating panel',
                        editor: 'Editor',
                        tools: 'Agent tools',
                        skills: 'Skills',
                        services: 'Services',
                        menus: 'Menus',
                        routes: 'Routes',
                        desktop: 'Platform',
                        desktopOnly: 'desktop only',
                        nothing: 'This plugin contributes no UI and no capabilities yet (blank plugin / background logic only).',
                    },
                    services: {
                        title: 'Callable services',
                        summary: '· {{core}} from the host · {{plugins}} from plugins',
                        core: 'host (core)',
                        unavailable: 'This host exposed no service registry.',
                        hint:
                            'Services are the only formal channel between a plugin and the host / another plugin: call one with resolveOptionalService(name) (plain code) or useOptionalService(name) (inside a component). Signatures live in @kn/common src/core/types.ts → Services.',
                    },
                    icon: {
                        glyph: 'Glyph',
                        initial: 'initial',
                        manifest: 'Manifest',
                        rail: 'Rail icon',
                        railApplied: 'The app rail icon uses the same glyph.',
                        railSkipped: 'The rail icon was left alone ({{status}}).',
                        snippetHint: 'Paste this into src/index.tsx to use the same glyph in the rail:',
                        publishHint:
                            'The marketplace icon is this SVG file; publishing uploads it automatically.',
                    },
                    state: {
                        watching: 'Watching',
                        starting: 'Building',
                        failed: 'Build failed',
                        stopped: 'Stopped',
                        idle: 'Idle',
                    },
                },
            },
        },
        zh: {
            translation: {
                pluginStudio: {
                    title: '插件开发台',
                    subtitle: '选择本地插件工程，保存即热更到当前窗口，满意后一键打包',
                    settingsDesc: '在桌面端开发、热更、打包插件',
                    desktopOnlyTitle: '插件开发台需要桌面客户端',
                    desktopOnly: '打包与热更依赖桌面端的子进程与文件系统能力。请在 KN 桌面客户端中打开本页面。',
                    missingDevTitle: '当前桌面版本还不支持插件开发台',
                    missingDev:
                        '这个客户端缺少 dev.* 能力（dev.start / dev.build / dev.scaffold）。升级桌面客户端后即可在这里开发插件；其余功能不受影响。',
                    refresh: '刷新',
                    newProject: '新建',
                    newProjectLong: '新建工程',
                    addFolder: '添加',
                    addExisting: '添加已有目录',
                    status: '状态',
                    output: '产物',
                    stop: '停止',
                    watch: '监听',
                    stopWatching: '停止监听',
                    startWatching: '开始监听',
                    hotReload: '热更',
                    buildOnce: '构建一次',
                    installNow: '热更到当前窗口',
                    uninstall: '卸载',
                    uninstallHint: '从宿主卸载正在运行的开发插件',
                    remove: '移除',
                    removeHint: '仅从列表移除，不删除磁盘文件',
                    deleteProjectHint: '停止监听并删除该工程目录及磁盘文件（不可恢复）',
                    deleteConfirmTitle: '删除插件工程？',
                    deleteConfirmDesc: '将永久删除 {{path}} 及其中的全部文件，此操作不可撤销。',
                    deleteConfirmAction: '删除',
                    noProjectsDock: '还没有插件工程，用下面的按钮新建或添加。',
                    selectOrCreate: '选择或新建一个插件工程。',
                    emptyTitle: '还没有插件工程',
                    emptyHint: '新建一个模板工程，或让 agent 直接创建；也可以添加磁盘上已有的插件目录',
                    managedGroup: '内置目录（可直接让 agent 开发）',
                    addedGroup: '已添加的目录',
                    buildLogs: '构建日志',
                    noLogs: '暂无日志',
                    createTitle: '新建插件工程',
                    packageName: '包名',
                    displayName: '显示名',
                    templateLabel: '工程模板',
                    template: {
                        panel: '侧边停靠面板',
                        page: '整页视图（pageType）',
                        settings: '设置面板',
                        command: '编辑器斜杠命令',
                        blank: '空白插件',
                    },
                    templateHint: {
                        panel: '在左右侧边栏里停靠的面板，内容改 src/DevPanel.tsx。',
                        page: '注册成 pageType 的整页渲染器，内容改 src/CanvasPage.tsx。',
                        settings: '出现在宿主设置对话框里的分组，改 src/SettingsPanel.tsx。',
                        command: '编辑器 “/” 菜单里的一项，改 src/slash-command.ts。',
                        blank: '一个能装上的空插件，按需自己加贡献点。',
                    },
                    cancel: '取消',
                    createAndWatch: '创建并监听',
                    createAndStart: '创建并开始监听',
                    pickFolderTitle: '选择已有插件工程目录',
                    nameRequired: '工程名不能为空',
                    autoInstall: '保存后自动热更',
                    generateIcon: '生成图标',
                    generateIconHint: '按工程名生成 assets/icon.svg，并把脚手架那个 emoji 栏位图标换成同一字形',
                    iconGenerated: '已生成图标：{{glyph}} · 栏位 {{rail}}',
                    iconRail: {
                        updated: '已同步',
                        'no-match': '保留原样',
                        'no-entry': '找不到入口文件',
                        disabled: '未处理',
                        unreadable: '入口文件读不到',
                    },
                    pluginKeyLabel: 'pluginKey：',
                    modulesLabel: '模块：',
                    conventionsTitle: '工程约定',
                    conventions:
                        '<code>package.json</code> 里的 <code>knPluginStudio</code> 字段描述这个工程：<code>pluginKey</code>（注册键）、<code>entry</code>（入口文件，默认按 src/index.tsx 查找）、<code>displayName</code>。<br /><code>react</code>、<code>@kn/common</code>、<code>@kn/ui</code>、<code>@kn/icon</code>、<code>@kn/editor</code>、<code>@kn/plugin-api</code> 由宿主注入，不会打进产物。',
                    noBuildYet: '还没有可安装的构建产物',
                    installRejected: '宿主拒绝激活：请查看插件版本或名称冲突',
                    autoInstallFailed: '自动安装失败：{{message}}',
                    selectFirst: '请先选择一个插件工程',
                    unsupported: '当前宿主不支持插件开发',
                    publishTitle: '发布到插件市场',
                    publishDesc: '构建当前工程、上传产物，然后提交审核（上架）或发布新版本。',
                    publishListed: '已上架',
                    publishNew: '新插件',
                    publishSelectProject: '请先选择一个插件工程。',
                    publishNoBuild: '构建失败，没有可发布的产物。',
                    publishSubmitAction: '上架（提交审核）',
                    publishVersionAction: '发布新版本',
                    publishSubmitDone: '已提交审核。',
                    publishVersionDone: '已发布版本 {{version}}。',
                    marketplaceUnavailable: '当前宿主没有提供插件市场服务。',
                    upgradeTitle: '插件更新',
                    upgradeDesc: '有更新版本可用的已安装插件。',
                    upgradeAction: '升级',
                    upgradeEmpty: '全部已是最新。',
                    version: '版本',
                    category: '分类',
                    descriptionLabel: '描述',
                    descriptionPlaceholder: '这个插件是做什么的？（至少 10 字）',
                    tagsLabel: '标签（逗号分隔）',
                    tabPublish: '发布',
                    versionDescTitle: '版本说明',
                    versionDescFeature: '功能（这个插件是做什么的）',
                    versionDescDetail: '细节（如何使用/实现）',
                    versionDescChangeLog: '更新日志（这个版本改了什么）',
                    versionDescRequired: '至少填写一段版本说明（功能/细节/更新日志）。',
                    publishAction: '发布',
                    artifact: {
                        buildFailed: '构建失败：{{name}}',
                        installed: '已热更',
                        openBeside: '预览',
                        moduleCount: '{{n}} 个模块',
                        fileCount: '{{n}} 个文件',
                        publishedVersion: '已发布 v{{version}}',
                        submitted: '已提交审核',
                        noSession: '还没有开发会话',
                        watching: '监听中',
                        build: '构建',
                        size: '产物大小',
                        time: '耗时',
                        modules: '模块数',
                        moduleList: '包含模块',
                        hotReload: '预览',
                        files: '文件',
                        managed: '目录',
                        managedBadge: '内置目录',
                        path: '路径',
                        published: '发布',
                        desktopOnlyHint: '实时状态来自桌面端的开发能力；当前宿主没有。',
                        paneHint: '监听、构建与热更在「插件开发台」侧边面板里操作。',
                    },
                    preview: {
                        liveHint: '实时预览这个插件做了什么——热更后自动更新。',
                        notRunning:
                            '这个插件当前没有在窗口里运行。先构建并热更（runPluginProject / buildPluginProject），再打开本预览。',
                        left: '左栏',
                        right: '右栏',
                        crashed: '{{name}} 渲染失败',
                        editorComponent: '这个整页视图由编辑器节点渲染，需要真实页面数据，无法在预览里直接挂载。',
                        page: '整页视图',
                        settings: '设置面板',
                        slash: '斜杠命令 {{list}}',
                        toolbar: '工具栏按钮',
                        bubble: '气泡菜单',
                        footer: '页脚面板',
                        floating: '浮动窗口',
                        editor: '编辑器扩展',
                        tools: 'Agent 工具',
                        skills: '技能',
                        menus: '菜单',
                        routes: '路由',
                        desktop: '平台',
                        desktopOnly: '仅桌面端',
                        nothing: '这个插件当前没有贡献任何 UI 或能力（空插件/仅后台逻辑）。',
                    },
                    services: {
                        title: '可调用的服务',
                        summary: '· 宿主 {{core}} 个 · 插件 {{plugins}} 个',
                        core: '宿主（core）',
                        unavailable: '当前宿主没有暴露服务注册表。',
                        hint:
                            '服务是插件与宿主/其他插件互调的唯一正式通道：非 React 代码用 resolveOptionalService(name)，组件里用 useOptionalService(name)。签名在 @kn/common 的 src/core/types.ts → Services。',
                    },
                    icon: {
                        glyph: '字形',
                        initial: '首字母兜底',
                        manifest: '清单',
                        rail: '栏位图标',
                        railApplied: '应用里的栏位图标已用同一个字形。',
                        railSkipped: '栏位图标未自动替换（{{status}}）。',
                        snippetHint: '把这段粘进 src/index.tsx，栏位就用同一个字形：',
                        publishHint: '市场图标就是这张 SVG；上架时 publishPluginProject 会自动上传它。',
                    },
                    state: {
                        watching: '监听中',
                        starting: '构建中',
                        failed: '构建失败',
                        stopped: '已停止',
                        idle: '未启动',
                    },
                },
            },
        },
    },
})
