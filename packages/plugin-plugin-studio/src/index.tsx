/**
 * Plugin Studio — a plugin that builds plugins.
 *
 * Everything interesting lives behind two contribution points:
 *  - a settings panel (`StudioSettings`) for managing projects end to end
 *  - a side-dock panel (`StudioDockPanel`) that follows the active project's
 *    build state while you keep working in the app
 *
 * The plugin is desktop-only: `desktopOnly` is honest metadata here, because
 * bundling needs a Node child process, which only the Electron host provides.
 * On the web, and on desktop builds without the `dev.*` capabilities, both
 * surfaces render an explanation instead of failing.
 */
import React from 'react'
import { KPlugin, createServiceResolver, type PluginConfig, type Services } from '@kn/common'
import { Wrench } from '@kn/icon'
import { StudioSettings } from './StudioSettings'
import { StudioDockPanel } from './StudioDockPanel'
import { createStudioTools } from './studio-tools'

/** Resolves the studio's own dependencies; see studio-tools.ts. */
const services = createServiceResolver<Services>()

const studioTools = createStudioTools({
    getDev: () => services.resolveOptional('desktop')?.dev,
    getPluginHost: () =>
        services.resolveOptional('pluginHost') as ReturnType<
            Parameters<typeof createStudioTools>[0]['getPluginHost']
        >,
})

class PluginStudio extends KPlugin<PluginConfig> {}

export const pluginStudio = new PluginStudio({
    name: 'PluginStudio',
    status: 'ACTIVE',
    desktopOnly: true,
    /**
     * Agent tools. `editorExtension` is the only tool contribution point a
     * plugin has (PluginManager.resolveTools reads `ext.tools`), and these
     * tools are editor-independent — they drive the studio's desktop
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
        },
    ],
    settings: {
        key: 'plugin-studio',
        label: '插件开发台',
        description: '在桌面端开发、热更、打包插件',
        icon: React.createElement(Wrench, { className: 'h-4 w-4' }),
        component: StudioSettings,
    },
    dockPanels: [
        {
            id: 'plugin-studio-status',
            title: '插件开发台',
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
                    status: 'Build status',
                    empty: 'Open Settings → Plugin Studio to add a plugin project.',
                    watching: 'Watching',
                    idle: 'Idle',
                    failed: 'Build failed',
                },
            },
        },
        zh: {
            translation: {
                pluginStudio: {
                    title: '插件开发台',
                    status: '构建状态',
                    empty: '在「设置 → 插件开发台」里添加一个插件工程。',
                    watching: '监听中',
                    idle: '未启动',
                    failed: '构建失败',
                },
            },
        },
    },
})
