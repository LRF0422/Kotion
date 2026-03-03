import type { ICommand } from '@univerjs/presets'
import {
    CommandType,
    ICommandService,
    Inject,
    Injector,
    Plugin,
} from '@univerjs/presets'
import {
    IMenuManagerService,
    MenuItemType,
    RibbonStartGroup,
    ComponentManager,
} from '@univerjs/preset-sheets-core'

// ── Icon components (simple SVG wrappers) ────────────────────────────
// Univer expects React components registered via ComponentManager.
// We define minimal inline SVG components so we don't need extra deps.
import React from 'react'

const ImportIcon: React.FC = () =>
    React.createElement(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' }),
        React.createElement('polyline', { points: '7 10 12 15 17 10' }),
        React.createElement('line', { x1: 12, y1: 15, x2: 12, y2: 3 }),
    )

const FullscreenIcon: React.FC = () =>
    React.createElement(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('polyline', { points: '15 3 21 3 21 9' }),
        React.createElement('polyline', { points: '9 21 3 21 3 15' }),
        React.createElement('line', { x1: 21, y1: 3, x2: 14, y2: 10 }),
        React.createElement('line', { x1: 3, y1: 21, x2: 10, y2: 14 }),
    )

// ── Plugin config ────────────────────────────────────────────────────
export interface ICustomMenuPluginConfig {
    onImportExcel?: () => void
    onToggleFullscreen?: () => void
}

// ── Command IDs ──────────────────────────────────────────────────────
const IMPORT_EXCEL_COMMAND_ID = 'custom.operation.import-excel'
const FULLSCREEN_COMMAND_ID = 'custom.operation.toggle-fullscreen'

// ── Plugin ───────────────────────────────────────────────────────────
export class CustomMenuPlugin extends Plugin {
    static override pluginName = 'custom-menu-plugin'

    private _config: ICustomMenuPluginConfig

    constructor(
        config: ICustomMenuPluginConfig | undefined,
        @Inject(Injector) readonly _injector: Injector,
        @Inject(IMenuManagerService) private readonly _menuManagerService: IMenuManagerService,
        @Inject(ICommandService) private readonly _commandService: ICommandService,
        @Inject(ComponentManager) private readonly _componentManager: ComponentManager,
    ) {
        super()
        this._config = config ?? {}
    }

    override onStarting(): void {
        // Register icon components
        this.disposeWithMe(this._componentManager.register('ImportExcelIcon', ImportIcon))
        this.disposeWithMe(this._componentManager.register('FullscreenIcon', FullscreenIcon))

        // ── Import Excel command ─────────────────────────────────────
        const importCommand: ICommand = {
            type: CommandType.OPERATION,
            id: IMPORT_EXCEL_COMMAND_ID,
            handler: () => {
                this._config.onImportExcel?.()
                return true
            },
        }
        this._commandService.registerCommand(importCommand)

        // ── Fullscreen command ───────────────────────────────────────
        const fullscreenCommand: ICommand = {
            type: CommandType.OPERATION,
            id: FULLSCREEN_COMMAND_ID,
            handler: () => {
                this._config.onToggleFullscreen?.()
                return true
            },
        }
        this._commandService.registerCommand(fullscreenCommand)

        // ── Merge into Univer ribbon ─────────────────────────────────
        this._menuManagerService.mergeMenu({
            [RibbonStartGroup.OTHERS]: {
                [IMPORT_EXCEL_COMMAND_ID]: {
                    order: 0,
                    menuItemFactory: () => ({
                        id: IMPORT_EXCEL_COMMAND_ID,
                        title: 'Import Excel',
                        tooltip: 'Import Excel',
                        icon: 'ImportExcelIcon',
                        type: MenuItemType.BUTTON,
                    }),
                },
                [FULLSCREEN_COMMAND_ID]: {
                    order: 1,
                    menuItemFactory: () => ({
                        id: FULLSCREEN_COMMAND_ID,
                        title: 'Fullscreen',
                        tooltip: 'Toggle fullscreen',
                        icon: 'FullscreenIcon',
                        type: MenuItemType.BUTTON,
                    }),
                },
            },
        })
    }
}
