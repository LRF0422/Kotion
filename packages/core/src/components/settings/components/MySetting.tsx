import React from "react";
import { Label } from "@kn/ui";
import { Switch } from "@kn/ui";
import { Button } from "@kn/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { RadioGroup, RadioGroupItem } from "@kn/ui";
import { cn } from "@kn/ui";
import {
    Type,
    Clock,
    Monitor,
    Moon,
    Sun,
    Languages,
    Eye,
    Volume2,
    Zap,
    Bell,
    Mail,
    CalendarDays,
    Save,
} from "@kn/icon";
import { useSafeState } from "ahooks";
import { useTheme } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { SettingsPanel, SettingsSection, SettingsRow } from "./primitives";

interface SettingsState {
    fontSize: string;
    editorWidth: string;
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

const THEME_OPTIONS = [
    { value: "light", labelKey: "settings.preferences.themeLight", icon: Sun },
    { value: "dark", labelKey: "settings.preferences.themeDark", icon: Moon },
    { value: "system", labelKey: "settings.preferences.themeSystem", icon: Monitor },
] as const;

export const MySetting: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language?.startsWith("zh") ? "zh" : "en";

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        localStorage.setItem("language", lang);
    };

    const [settings, setSettings] = useSafeState<SettingsState>({
        fontSize: "medium",
        editorWidth: "default",
        dateFormat: "YYYY-MM-DD",
        startOfWeek: "monday",
        enableNotifications: true,
        enableSounds: true,
        enableDesktopNotifications: false,
        enableEmailDigest: true,
        enableAnimations: true,
        enableAutoSave: true,
        autoSaveInterval: "30",
    });

    const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const selectControl = (
        value: string,
        onChange: (v: string) => void,
        options: { value: string; label: string }[],
        width = "w-32",
    ) => (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={cn("h-9", width)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    return (
        <SettingsPanel>
            {/* 外观 */}
            <SettingsSection
                title={t("settings.preferences.appearanceTitle")}
                description={t("settings.preferences.appearanceDesc")}
            >
                <div className="space-y-2.5 px-4 py-3">
                    <Label className="text-sm font-medium text-foreground">
                        {t("settings.preferences.theme")}
                    </Label>
                    <RadioGroup
                        value={theme}
                        onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}
                        className="grid grid-cols-3 gap-2"
                    >
                        {THEME_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
                            <Label
                                key={value}
                                htmlFor={`theme-${value}`}
                                className={cn(
                                    "flex cursor-pointer flex-col items-center gap-2 rounded-lg border py-3 transition-colors",
                                    theme === value
                                        ? "border-primary bg-primary/5 text-foreground"
                                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                                )}
                            >
                                <RadioGroupItem value={value} id={`theme-${value}`} className="sr-only" />
                                <Icon className="h-4 w-4" />
                                <span className="text-xs font-medium">{t(labelKey)}</span>
                            </Label>
                        ))}
                    </RadioGroup>
                </div>

                <SettingsRow
                    icon={<Type />}
                    label={t("settings.preferences.fontSize")}
                    description={t("settings.preferences.fontSizeDesc")}
                    control={selectControl(
                        settings.fontSize,
                        (v) => updateSetting("fontSize", v),
                        [
                            { value: "small", label: t("settings.preferences.sizeSmall") },
                            { value: "medium", label: t("settings.preferences.sizeMedium") },
                            { value: "large", label: t("settings.preferences.sizeLarge") },
                        ],
                        "w-28",
                    )}
                />
                <SettingsRow
                    icon={<Eye />}
                    label={t("settings.preferences.editorWidth")}
                    description={t("settings.preferences.editorWidthDesc")}
                    control={selectControl(
                        settings.editorWidth,
                        (v) => updateSetting("editorWidth", v),
                        [
                            { value: "narrow", label: t("settings.preferences.widthNarrow") },
                            { value: "default", label: t("settings.preferences.widthDefault") },
                            { value: "wide", label: t("settings.preferences.widthWide") },
                            { value: "full", label: t("settings.preferences.widthFull") },
                        ],
                        "w-28",
                    )}
                />
                <SettingsRow
                    icon={<Zap />}
                    label={t("settings.preferences.animations")}
                    description={t("settings.preferences.animationsDesc")}
                    control={
                        <Switch
                            checked={settings.enableAnimations}
                            onCheckedChange={(c) => updateSetting("enableAnimations", c)}
                        />
                    }
                />
            </SettingsSection>

            {/* 语言与区域 */}
            <SettingsSection
                title={t("settings.preferences.languageTitle")}
                description={t("settings.preferences.languageDesc")}
            >
                <SettingsRow
                    icon={<Languages />}
                    label={t("settings.preferences.interfaceLanguage")}
                    description={t("settings.preferences.interfaceLanguageDesc")}
                    control={selectControl(currentLang, changeLanguage, [
                        { value: "zh", label: "简体中文" },
                        { value: "en", label: "English" },
                    ])}
                />
                <SettingsRow
                    icon={<CalendarDays />}
                    label={t("settings.preferences.dateFormat")}
                    description={t("settings.preferences.dateFormatDesc")}
                    control={selectControl(settings.dateFormat, (v) => updateSetting("dateFormat", v), [
                        { value: "YYYY-MM-DD", label: "2024-01-15" },
                        { value: "MM/DD/YYYY", label: "01/15/2024" },
                        { value: "DD/MM/YYYY", label: "15/01/2024" },
                        { value: "YYYY年MM月DD日", label: "2024年01月15日" },
                    ])}
                />
                <SettingsRow
                    icon={<Clock />}
                    label={t("settings.preferences.weekStart")}
                    description={t("settings.preferences.weekStartDesc")}
                    control={selectControl(
                        settings.startOfWeek,
                        (v) => updateSetting("startOfWeek", v),
                        [
                            { value: "monday", label: t("settings.preferences.monday") },
                            { value: "sunday", label: t("settings.preferences.sunday") },
                        ],
                        "w-28",
                    )}
                />
            </SettingsSection>

            {/* 通知 */}
            <SettingsSection
                title={t("settings.preferences.notificationsTitle")}
                description={t("settings.preferences.notificationsDesc")}
            >
                <SettingsRow
                    icon={<Bell />}
                    label={t("settings.preferences.notifyEnable")}
                    description={t("settings.preferences.notifyEnableDesc")}
                    control={
                        <Switch
                            checked={settings.enableNotifications}
                            onCheckedChange={(c) => updateSetting("enableNotifications", c)}
                        />
                    }
                />
                <SettingsRow
                    icon={<Volume2 />}
                    label={t("settings.preferences.notifySound")}
                    description={t("settings.preferences.notifySoundDesc")}
                    control={
                        <Switch
                            checked={settings.enableSounds}
                            onCheckedChange={(c) => updateSetting("enableSounds", c)}
                        />
                    }
                />
                <SettingsRow
                    icon={<Monitor />}
                    label={t("settings.preferences.notifyDesktop")}
                    description={t("settings.preferences.notifyDesktopDesc")}
                    control={
                        <Switch
                            checked={settings.enableDesktopNotifications}
                            onCheckedChange={(c) => updateSetting("enableDesktopNotifications", c)}
                        />
                    }
                />
                <SettingsRow
                    icon={<Mail />}
                    label={t("settings.preferences.notifyEmail")}
                    description={t("settings.preferences.notifyEmailDesc")}
                    control={
                        <Switch
                            checked={settings.enableEmailDigest}
                            onCheckedChange={(c) => updateSetting("enableEmailDigest", c)}
                        />
                    }
                />
            </SettingsSection>

            {/* 编辑器 */}
            <SettingsSection
                title={t("settings.preferences.editorTitle")}
                description={t("settings.preferences.editorDesc")}
            >
                <SettingsRow
                    icon={<Save />}
                    label={t("settings.preferences.autoSave")}
                    description={t("settings.preferences.autoSaveDesc")}
                    control={
                        <Switch
                            checked={settings.enableAutoSave}
                            onCheckedChange={(c) => updateSetting("enableAutoSave", c)}
                        />
                    }
                />
                {settings.enableAutoSave && (
                    <SettingsRow
                        icon={<Clock />}
                        label={t("settings.preferences.autoSaveInterval")}
                        description={t("settings.preferences.autoSaveIntervalDesc")}
                        control={selectControl(
                            settings.autoSaveInterval,
                            (v) => updateSetting("autoSaveInterval", v),
                            [
                                { value: "10", label: t("settings.preferences.sec10") },
                                { value: "30", label: t("settings.preferences.sec30") },
                                { value: "60", label: t("settings.preferences.min1") },
                                { value: "300", label: t("settings.preferences.min5") },
                            ],
                            "w-28",
                        )}
                    />
                )}
            </SettingsSection>

            {/* 操作 */}
            <div className="mx-auto flex w-full max-w-2xl justify-end gap-2">
                <Button variant="outline" size="sm">
                    {t("settings.preferences.reset")}
                </Button>
                <Button size="sm">{t("settings.preferences.saveBtn")}</Button>
            </div>
        </SettingsPanel>
    );
};
