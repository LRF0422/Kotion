import React from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Label,
    Separator,
    Button,
    cn,
    useColorScheme,
    ACCENT_SWATCHES,
    hexToHsl,
    hslToHex,
} from "@kn/ui"
import { Palette, Check, RotateCcw } from "@kn/icon"

export const ThemeSettings: React.FC<{ pluginKey?: string }> = () => {
    const { scheme, presets, setScheme } = useColorScheme()

    const activeAccent = scheme.accent

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-500/10">
                            <Palette className="h-3.5 w-3.5 text-purple-500" />
                        </div>
                        <div>
                            <CardTitle className="text-sm">配色方案</CardTitle>
                            <CardDescription className="text-xs">
                                选择一套预设配色，立即应用到整个界面
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Preset grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {presets.map((preset) => {
                            const isActive = scheme.presetId === preset.id
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setScheme({ ...scheme, presetId: preset.id })}
                                    className={cn(
                                        "flex items-center gap-2.5 p-2.5 rounded-lg border-2 text-left transition-all",
                                        isActive
                                            ? "border-primary bg-primary/5"
                                            : "border-muted hover:border-muted-foreground/30"
                                    )}
                                >
                                    {/* Swatch preview */}
                                    <span
                                        className="relative h-8 w-8 shrink-0 rounded-md border border-border overflow-hidden"
                                        style={{ background: `hsl(${preset.swatch.bg})` }}
                                    >
                                        <span
                                            className="absolute bottom-1 right-1 h-4 w-4 rounded-full"
                                            style={{ background: `hsl(${preset.swatch.primary})` }}
                                        />
                                    </span>
                                    <span className="flex-1 text-xs font-medium truncate">
                                        {preset.name}
                                    </span>
                                    {isActive && (
                                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    <Separator />

                    {/* Primary color customization */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-xs font-medium">主色</Label>
                                <p className="text-[10px] text-muted-foreground">
                                    覆盖配色方案的主色（按钮、链接、高亮）
                                </p>
                            </div>
                            {activeAccent && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                        const { accent, ...rest } = scheme
                                        setScheme(rest)
                                    }}
                                >
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                    恢复预设主色
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {ACCENT_SWATCHES.map((hsl) => {
                                const isActive = activeAccent === hsl
                                return (
                                    <button
                                        key={hsl}
                                        type="button"
                                        aria-label={`accent ${hsl}`}
                                        onClick={() => setScheme({ ...scheme, accent: hsl })}
                                        className={cn(
                                            "relative h-7 w-7 rounded-full border transition-transform hover:scale-110",
                                            isActive
                                                ? "ring-2 ring-offset-2 ring-offset-background ring-primary"
                                                : "border-border"
                                        )}
                                        style={{ background: `hsl(${hsl})` }}
                                    >
                                        {isActive && (
                                            <Check className="h-3.5 w-3.5 text-white absolute inset-0 m-auto drop-shadow" />
                                        )}
                                    </button>
                                )
                            })}

                            {/* Native color picker for full custom */}
                            <label
                                className="relative h-7 w-7 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center cursor-pointer overflow-hidden hover:border-muted-foreground"
                                title="自定义颜色"
                                style={
                                    activeAccent && !ACCENT_SWATCHES.includes(activeAccent)
                                        ? { background: `hsl(${activeAccent})` }
                                        : undefined
                                }
                            >
                                <Palette className="h-3.5 w-3.5 text-muted-foreground mix-blend-difference" />
                                <input
                                    type="color"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    value={activeAccent ? hslToHex(activeAccent) : "#2383e2"}
                                    onChange={(e) => {
                                        const hsl = hexToHsl(e.target.value)
                                        if (hsl) setScheme({ ...scheme, accent: hsl })
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <p className="text-[10px] text-muted-foreground px-1">
                配色随浅色 / 深色模式自动切换；明暗模式可在「偏好设置 → 外观」中调整。
            </p>
        </div>
    )
}
