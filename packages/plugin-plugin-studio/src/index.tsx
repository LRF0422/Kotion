/**
 * Plugin Studio — a plugin that builds plugins.
 *
 * Everything interesting lives behind one contribution point: a side-dock
 * panel (`StudioDockPanel`) that manages the user's dev projects (start/stop,
 * hot reload, publish) and installed plugins while they keep working.
 *
 * The plugin is desktop-only: `desktopOnly` is honest metadata here, because
 * bundling needs a Node child process, which only the Electron host provides.
 * On the web, and on desktop builds without the `dev.*` capabilities, both
 * surfaces render an explanation instead of failing.
 */
import React from 'react'
import { KPlugin, resolveOptionalService, type PluginConfig } from '@kn/common'
import { Wrench } from '@kn/icon'
import { StudioDockPanel } from './StudioDockPanel'
import { createStudioTools } from './studio-tools'
import { pluginAuthoringSkill } from './skills/plugin-authoring'

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
    getPluginManagement: () =>
        resolveOptionalService('pluginManagement') as ReturnType<
            NonNullable<Parameters<typeof createStudioTools>[0]['getPluginManagement']>
        >,
    getMarketplace: () =>
        resolveOptionalService('pluginMarketplace') as ReturnType<
            NonNullable<Parameters<typeof createStudioTools>[0]['getMarketplace']>
        >,
})

class PluginStudio extends KPlugin<PluginConfig> {}

export const pluginStudio = new PluginStudio({
    name: 'PluginStudio',
    status: 'ACTIVE',
    desktopOnly: true,
    /**
     * Agent surface. `editorExtension` is the only contribution point a plugin
     * has for agent tools and skills (PluginManager.resolveTools/resolveSkills),
     * and both are editor-independent — they drive the studio's desktop
     * capabilities, not the document.
     */
    editorExtension: [
        {
            extendsion: [],
            name: 'plugin-studio-tools',
            tools: Object.entries(studioTools).map(([name, tool]) => ({
                name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                readOnly: Boolean((tool as { readOnly?: boolean }).readOnly),
                execute: () => tool.execute as (params: unknown) => unknown,
            })),
            // Teach the agent *how* to author a plugin; without this the
            // extension is tools-only and resolveSkills emits a contentless
            // default skill.
            skills: [pluginAuthoringSkill],
        },
    ],

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
                    cancel: 'Cancel',
                    createAndWatch: 'Create & watch',
                    createAndStart: 'Create & start watching',
                    pickFolderTitle: 'Select an existing plugin project folder',
                    nameRequired: 'Project name is required',
                    autoInstall: 'Auto hot-reload on save',
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
                    cancel: '取消',
                    createAndWatch: '创建并监听',
                    createAndStart: '创建并开始监听',
                    pickFolderTitle: '选择已有插件工程目录',
                    nameRequired: '工程名不能为空',
                    autoInstall: '保存后自动热更',
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
