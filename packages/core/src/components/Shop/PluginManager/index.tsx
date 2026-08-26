import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Badge, Button, ScrollArea, Separator, cn, useResponsive } from "@kn/ui";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PluginList } from "./PluginList";
import { SubmissionList } from "./SubmissionList";
import type { PluginSubmissionRecord } from "../PluginUploader/types";
import { useApi } from "@kn/common";
import { APIS } from "@kn/common";
import { BoxIcon, CheckCircleIcon, XCircleIcon, ClockIcon, LayoutGridIcon, CodeIcon, PaletteIcon, DatabaseIcon, SettingsIcon } from "@kn/icon";
import { useTranslation } from "@kn/common";

// Plugin category definitions
const PLUGIN_CATEGORIES = [
    { id: 'all', labelKey: 'pluginManager.allPlugins', icon: LayoutGridIcon },
    { id: 'active', labelKey: 'pluginManager.active', icon: CheckCircleIcon },
    { id: 'disabled', labelKey: 'pluginManager.inactive', icon: XCircleIcon },
    { id: 'uninstalled', labelKey: 'pluginManager.notInstalled', icon: ClockIcon },
] as const;

// Backend serializes the install status enum as a bare string or { value, desc }.
const installState = (p: { installStatus?: string | { value: string } | null }): string | undefined =>
    typeof p.installStatus === 'string' ? p.installStatus : (p.installStatus?.value ?? undefined);

const PLUGIN_TYPES = [
    { id: 'feature', labelKey: 'pluginManager.feature', icon: CodeIcon },
    { id: 'ui', labelKey: 'pluginManager.uiEnhancement', icon: PaletteIcon },
    { id: 'integration', labelKey: 'pluginManager.integration', icon: DatabaseIcon },
    { id: 'utility', labelKey: 'pluginManager.utility', icon: SettingsIcon },
] as const;

type CategoryId = typeof PLUGIN_CATEGORIES[number]['id'];
type PluginTypeId = typeof PLUGIN_TYPES[number]['id'];

const normalizeSubmission = (plugin: any): PluginSubmissionRecord => {
    const candidate = plugin.candidateVersion ?? plugin.currentVersion ?? {}
    const status = candidate.reviewStatus?.value ?? candidate.reviewStatus ?? plugin.status?.value ?? plugin.status
    return {
        ...plugin,
        id: plugin.id,
        status,
        category: plugin.category?.value ?? plugin.category,
        version: candidate.version,
        resourcePath: candidate.resourcePath,
        integrity: candidate.integrity,
        versionDescs: candidate.versionDescription ?? [],
    } as PluginSubmissionRecord
}

interface PluginData {
    id: string;
    name: string;
    icon: string;
    developer: string;
    maintainer: string;
    description?: string;
    status: { code: string; desc: string };
    currentVersion?: string;
    key?: string;
    type?: string;
    installStatus?: string | { value: string } | null;
    currentVersionId?: string;
}

export const PluginManager: React.FC<PropsWithChildren> = ({ children }) => {

    const { t } = useTranslation();
    const { isMobile } = useResponsive();
    const [plugins, setPlugins] = useState<PluginData[]>([])
    const [submissions, setSubmissions] = useState<PluginSubmissionRecord[]>([])
    const [submissionsLoading, setSubmissionsLoading] = useState(false)
    const [submissionsError, setSubmissionsError] = useState<string>()
    const [submissionPage, setSubmissionPage] = useState(1)
    const [submissionPages, setSubmissionPages] = useState(1)
    const submissionRequestRef = useRef(0)
    const [showSubmissions, setShowSubmissions] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all')
    const [selectedType, setSelectedType] = useState<PluginTypeId | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        useApi(APIS.GET_PLUGIN_LIST).then(res => {
            setPlugins(res.data.records || [])
        })
    }, [refreshKey])

    const refreshPlugins = useCallback(() => {
        setRefreshKey(k => k + 1)
    }, [])

    const refreshSubmissions = useCallback((page = 1) => {
        const requestId = ++submissionRequestRef.current
        setSubmissionsLoading(true)
        setSubmissionsError(undefined)
        useApi(APIS.GET_MY_PLUGIN_SUBMISSIONS, { current: page, pageSize: 20 })
            .then(res => {
                if (requestId !== submissionRequestRef.current) return
                const records = (res.data?.records || res.data || []).map(normalizeSubmission)
                setSubmissions(current => page === 1 ? records : [...current, ...records])
                setSubmissionPage(page)
                setSubmissionPages(res.data?.pages || 1)
            })
            .catch(error => {
                if (requestId !== submissionRequestRef.current) return
                setSubmissionsError(error?.message || t('pluginManager.loadFailed'))
            })
            .finally(() => {
                if (requestId === submissionRequestRef.current) setSubmissionsLoading(false)
            })
    }, [t])

    useEffect(() => {
        if (showSubmissions) refreshSubmissions()
    }, [refreshKey, refreshSubmissions, showSubmissions])

    // Calculate statistics based on the runtime install status axis.
    const stats = useMemo(() => {
        const total = plugins.length;
        const active = plugins.filter(p => installState(p) === 'ACTIVE').length;
        const disabled = plugins.filter(p => installState(p) === 'DISABLED').length;
        const uninstalled = plugins.filter(p => !installState(p)).length;
        return { total, active, disabled, uninstalled };
    }, [plugins]);

    // Filter plugins based on selected category and type
    const filteredPlugins = useMemo(() => {
        let result = [...plugins];

        // Filter by install-status category
        if (selectedCategory === 'active') {
            result = result.filter(p => installState(p) === 'ACTIVE');
        } else if (selectedCategory === 'disabled') {
            result = result.filter(p => installState(p) === 'DISABLED');
        } else if (selectedCategory === 'uninstalled') {
            result = result.filter(p => !installState(p));
        }

        // Filter by type
        if (selectedType) {
            result = result.filter(p => p.type === selectedType);
        }

        return result;
    }, [plugins, selectedCategory, selectedType]);

    const getCategoryCount = (categoryId: CategoryId): number => {
        switch (categoryId) {
            case 'all': return stats.total;
            case 'active': return stats.active;
            case 'disabled': return stats.disabled;
            case 'uninstalled': return stats.uninstalled;
            default: return 0;
        }
    };

    return <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="flex h-[100dvh] max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[90vh] sm:w-[92%] sm:max-w-none sm:rounded-xl sm:border sm:p-6">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pt-safe text-left sm:border-0 sm:px-0 sm:pt-0">
                <DialogTitle className="flex items-center gap-2">
                    <BoxIcon className="h-5 w-5" />
                    {t('pluginManager.title')}
                </DialogTitle>
                <DialogDescription className="text-sm">
                    {t('pluginManager.description')}
                </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-0">
                {isMobile && (
                    <div className="flex shrink-0 gap-2 border-b p-3">
                        <Button type="button" variant={!showSubmissions ? "default" : "outline"} className="h-11 flex-1" onClick={() => setShowSubmissions(false)}>
                            {t('pluginManager.allPlugins')}
                        </Button>
                        <Button type="button" variant={showSubmissions ? "default" : "outline"} className="h-11 flex-1" onClick={() => setShowSubmissions(true)}>
                            {t('pluginManager.mySubmissions')}
                        </Button>
                    </div>
                )}

                {/* Sidebar */}
                {!isMobile && <div className="h-full w-full border-r flex flex-col">
                    {/* Stats Overview */}
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('pluginManager.overview')}</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <div className="text-2xl font-bold">{stats.total}</div>
                                <div className="text-xs text-muted-foreground">{t('pluginManager.total')}</div>
                            </div>
                            <div className="p-3 bg-green-500/10 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                                <div className="text-xs text-muted-foreground">{t('pluginManager.active')}</div>
                            </div>
                            <div className="p-3 bg-gray-500/10 rounded-lg">
                                <div className="text-2xl font-bold text-gray-500">{stats.disabled}</div>
                                <div className="text-xs text-muted-foreground">{t('pluginManager.inactive')}</div>
                            </div>
                            <div className="p-3 bg-yellow-500/10 rounded-lg">
                                <div className="text-2xl font-bold text-yellow-600">{stats.uninstalled}</div>
                                <div className="text-xs text-muted-foreground">{t('pluginManager.notInstalled')}</div>
                            </div>
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-4 pb-0">
                            <button
                                onClick={() => setShowSubmissions(value => !value)}
                                className={cn(
                                    "flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                                    showSubmissions ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    <ClockIcon className="h-4 w-4" />
                                    {t('pluginManager.mySubmissions')}
                                </span>
                                <Badge variant={showSubmissions ? "secondary" : "outline"}>{submissions.length}</Badge>
                            </button>
                        </div>

                        {/* Status Categories */}
                        <div className={cn("p-4", showSubmissions && "opacity-60")}>
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('pluginManager.status')}</h3>
                            <div className="space-y-1">
                                {PLUGIN_CATEGORIES.map((category) => {
                                    const Icon = category.icon;
                                    const count = getCategoryCount(category.id);
                                    const isSelected = selectedCategory === category.id;
                                    return (
                                        <button
                                            key={category.id}
                                            onClick={() => {
                                                setShowSubmissions(false)
                                                setSelectedCategory(category.id)
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "hover:bg-muted text-foreground"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                <span>{t(category.labelKey)}</span>
                                            </div>
                                            <Badge
                                                variant={isSelected ? "secondary" : "outline"}
                                                className="h-5 min-w-[20px] justify-center"
                                            >
                                                {count}
                                            </Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <Separator />

                        {/* Plugin Types */}
                        <div className="p-4">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('pluginManager.type')}</h3>
                            <div className="space-y-1">
                                {PLUGIN_TYPES.map((type) => {
                                    const Icon = type.icon;
                                    const isSelected = selectedType === type.id;
                                    return (
                                        <button
                                            key={type.id}
                                            onClick={() => setSelectedType(isSelected ? null : type.id)}
                                            className={cn(
                                                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                                                isSelected
                                                    ? "bg-primary/10 text-primary border border-primary/20"
                                                    : "hover:bg-muted text-foreground"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span>{t(type.labelKey)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </ScrollArea>

                    {/* Quick Actions */}
                    <div className="p-4 border-t">
                        <div className="text-xs text-muted-foreground">
                            {filteredPlugins.length} {t('pluginManager.pluginsShown')}
                        </div>
                    </div>
                </div>}

                {/* Main Content */}
                <div className="min-h-0 min-w-0 flex-1">
                    {showSubmissions
                        ? <SubmissionList
                            data={submissions}
                            loading={submissionsLoading}
                            error={submissionsError}
                            hasMore={submissionPage < submissionPages}
                            onLoadMore={() => refreshSubmissions(submissionPage + 1)}
                            onRefresh={() => refreshSubmissions(1)}
                        />
                        : <PluginList data={filteredPlugins} onRefresh={refreshPlugins} />}
                </div>
            </div>
        </DialogContent>
    </Dialog>
}