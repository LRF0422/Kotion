import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kn/ui";
import { Label } from "@kn/ui";
import { Switch } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Button } from "@kn/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { RadioGroup, RadioGroupItem } from "@kn/ui";
import {
    Palette,
    Type,
    Bell,
    Clock,
    Monitor,
    Moon,
    Sun,
    Languages,
    Eye,
    Keyboard,
    Volume2,
    Zap
} from "@kn/icon";
import { useSafeState } from "ahooks";
import { useTheme } from "@kn/ui";

interface SettingsState {
    fontSize: string;
    editorWidth: string;
    language: string;
    dateFormat: string;
    startOfWeek: string;
    enableNotifications: boolean;
    enableSounds: boolean;
    enableDesktopNotifications: boolean;
    enableEmailDigest: boolean;
    enableAnimations: boolean;
    enableAutoSave: boolean;
    autoSaveInterval: string;
}

export const MySetting: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const [settings, setSettings] = useSafeState<SettingsState>({
        fontSize: 'medium',
        editorWidth: 'default',
        language: 'zh-CN',
        dateFormat: 'YYYY-MM-DD',
        startOfWeek: 'monday',
        enableNotifications: true,
        enableSounds: true,
        enableDesktopNotifications: false,
        enableEmailDigest: true,
        enableAnimations: true,
        enableAutoSave: true,
        autoSaveInterval: '30'
    });

    const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="space-y-4">
            {/* Appearance Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-500/10">
                            <Palette className="h-3.5 w-3.5 text-purple-500" />
                        </div>
                        <div>
                            <CardTitle className="text-sm">外观设置</CardTitle>
                            <CardDescription className="text-xs">自定义应用的视觉外观</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Theme Selection */}
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">主题模式</Label>
                        <RadioGroup
                            value={theme}
                            onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
                            className="grid grid-cols-3 gap-2"
                        >
                            <Label
                                htmlFor="theme-light"
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${theme === 'light'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted hover:border-muted-foreground/30'
                                    }`}
                            >
                                <RadioGroupItem value="light" id="theme-light" className="sr-only" />
                                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/20">
                                    <Sun className="h-4 w-4 text-amber-600" />
                                </div>
                                <span className="text-xs font-medium">浅色</span>
                            </Label>
                            <Label
                                htmlFor="theme-dark"
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${theme === 'dark'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted hover:border-muted-foreground/30'
                                    }`}
                            >
                                <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
                                <div className="p-2 rounded-lg bg-slate-700 dark:bg-slate-600">
                                    <Moon className="h-4 w-4 text-slate-300" />
                                </div>
                                <span className="text-xs font-medium">深色</span>
                            </Label>
                            <Label
                                htmlFor="theme-system"
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${theme === 'system'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted hover:border-muted-foreground/30'
                                    }`}
                            >
                                <RadioGroupItem value="system" id="theme-system" className="sr-only" />
                                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-slate-700">
                                    <Monitor className="h-4 w-4 text-slate-500" />
                                </div>
                                <span className="text-xs font-medium">跟随系统</span>
                            </Label>
                        </RadioGroup>
                    </div>

                    <Separator />

                    {/* Font Size */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Type className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">字体大小</Label>
                                <p className="text-[10px] text-muted-foreground">调整界面文字大小</p>
                            </div>
                        </div>
                        <Select
                            value={settings.fontSize}
                            onValueChange={(value) => updateSetting('fontSize', value)}
                        >
                            <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="small">小</SelectItem>
                                <SelectItem value="medium">中</SelectItem>
                                <SelectItem value="large">大</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Editor Width */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">编辑器宽度</Label>
                                <p className="text-[10px] text-muted-foreground">设置编辑器的默认宽度</p>
                            </div>
                        </div>
                        <Select
                            value={settings.editorWidth}
                            onValueChange={(value) => updateSetting('editorWidth', value)}
                        >
                            <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="narrow">窄屏</SelectItem>
                                <SelectItem value="default">默认</SelectItem>
                                <SelectItem value="wide">宽屏</SelectItem>
                                <SelectItem value="full">全屏</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Animations */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">动画效果</Label>
                                <p className="text-[10px] text-muted-foreground">启用界面动画和过渡效果</p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.enableAnimations}
                            onCheckedChange={(checked) => updateSetting('enableAnimations', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Language & Region Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-500/10">
                            <Languages className="h-3.5 w-3.5 text-blue-500" />
                        </div>
                        <div>
                            <CardTitle className="text-sm">语言与区域</CardTitle>
                            <CardDescription className="text-xs">设置您的语言和日期格式偏好</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {/* Language */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">界面语言</Label>
                                <p className="text-[10px] text-muted-foreground">选择您的首选语言</p>
                            </div>
                        </div>
                        <Select
                            value={settings.language}
                            onValueChange={(value) => updateSetting('language', value)}
                        >
                            <SelectTrigger className="w-32 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="zh-CN">简体中文</SelectItem>
                                <SelectItem value="zh-TW">繁體中文</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ja">日本語</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Format */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">日期格式</Label>
                                <p className="text-[10px] text-muted-foreground">选择日期显示格式</p>
                            </div>
                        </div>
                        <Select
                            value={settings.dateFormat}
                            onValueChange={(value) => updateSetting('dateFormat', value)}
                        >
                            <SelectTrigger className="w-32 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="YYYY-MM-DD">2024-01-15</SelectItem>
                                <SelectItem value="MM/DD/YYYY">01/15/2024</SelectItem>
                                <SelectItem value="DD/MM/YYYY">15/01/2024</SelectItem>
                                <SelectItem value="YYYY年MM月DD日">2024年01月15日</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Start of Week */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">每周开始日</Label>
                                <p className="text-[10px] text-muted-foreground">日历的第一天</p>
                            </div>
                        </div>
                        <Select
                            value={settings.startOfWeek}
                            onValueChange={(value) => updateSetting('startOfWeek', value)}
                        >
                            <SelectTrigger className="w-32 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="monday">星期一</SelectItem>
                                <SelectItem value="sunday">星期日</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Notifications Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/10">
                            <Bell className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                        <div>
                            <CardTitle className="text-sm">通知设置</CardTitle>
                            <CardDescription className="text-xs">管理您的通知偏好</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-xs font-medium">启用通知</Label>
                            <p className="text-[10px] text-muted-foreground">接收应用内通知</p>
                        </div>
                        <Switch
                            checked={settings.enableNotifications}
                            onCheckedChange={(checked) => updateSetting('enableNotifications', checked)}
                        />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">通知声音</Label>
                                <p className="text-[10px] text-muted-foreground">播放通知提示音</p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.enableSounds}
                            onCheckedChange={(checked) => updateSetting('enableSounds', checked)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">桌面通知</Label>
                                <p className="text-[10px] text-muted-foreground">在系统层面显示通知</p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.enableDesktopNotifications}
                            onCheckedChange={(checked) => updateSetting('enableDesktopNotifications', checked)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                                <Label className="text-xs font-medium">邮件摘要</Label>
                                <p className="text-[10px] text-muted-foreground">定期接收活动摘要邮件</p>
                            </div>
                        </div>
                        <Switch
                            checked={settings.enableEmailDigest}
                            onCheckedChange={(checked) => updateSetting('enableEmailDigest', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Editor Settings Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-green-500/10">
                            <Keyboard className="h-3.5 w-3.5 text-green-500" />
                        </div>
                        <div>
                            <CardTitle className="text-sm">编辑器设置</CardTitle>
                            <CardDescription className="text-xs">自定义编辑器行为</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-xs font-medium">自动保存</Label>
                            <p className="text-[10px] text-muted-foreground">自动保存您的更改</p>
                        </div>
                        <Switch
                            checked={settings.enableAutoSave}
                            onCheckedChange={(checked) => updateSetting('enableAutoSave', checked)}
                        />
                    </div>

                    {settings.enableAutoSave && (
                        <div className="flex items-center justify-between pl-6">
                            <div>
                                <Label className="text-xs font-medium">自动保存间隔</Label>
                                <p className="text-[10px] text-muted-foreground">每隔多久自动保存</p>
                            </div>
                            <Select
                                value={settings.autoSaveInterval}
                                onValueChange={(value) => updateSetting('autoSaveInterval', value)}
                            >
                                <SelectTrigger className="w-28 h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10 秒</SelectItem>
                                    <SelectItem value="30">30 秒</SelectItem>
                                    <SelectItem value="60">1 分钟</SelectItem>
                                    <SelectItem value="300">5 分钟</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm">重置默认</Button>
                <Button size="sm">保存设置</Button>
            </div>
        </div>
    );
}

// Need to import Mail icon for email digest
import { Mail } from "@kn/icon";