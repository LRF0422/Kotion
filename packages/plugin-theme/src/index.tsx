import { KPlugin, PluginConfig } from "@kn/common"
import { Palette } from "@kn/icon"
import React from "react"
import { ThemeSettings } from "./ThemeSettings"

class ThemePlugin extends KPlugin<PluginConfig> {}

export const theme = new ThemePlugin({
    name: "Theme",
    status: "ACTIVE",
    settings: {
        key: "theme-settings",
        label: "主题配色",
        description: "选择预设配色方案并自定义主色",
        icon: React.createElement(Palette, { className: "h-4 w-4" }),
        component: ThemeSettings,
    },
    locales: {
        en: {
            translation: {
                theme: {
                    title: "Theme Colors",
                    presets: "Color Presets",
                    accent: "Primary Color",
                    resetAccent: "Reset to preset",
                    custom: "Custom",
                },
            },
        },
        zh: {
            translation: {
                theme: {
                    title: "主题配色",
                    presets: "配色方案",
                    accent: "主色",
                    resetAccent: "恢复预设主色",
                    custom: "自定义",
                },
            },
        },
    },
})
