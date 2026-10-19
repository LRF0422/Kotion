import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Badge, Button, ScrollArea, Separator, cn, useResponsive } from "@kn/ui";
import React, { PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PluginList } from "./PluginList";
import { SubmissionList } from "./SubmissionList";
import { DeveloperStatusCard } from "../../Developer/DeveloperStatusCard";
import type { PluginSubmissionRecord } from "../PluginUploader/types";
import { AppContext, useApi } from "@kn/common";
import { APIS } from "@kn/common";
import { BoxIcon, CheckCircleIcon, XCircleIcon, ClockIcon, LayoutGridIcon } from "@kn/icon";
import { usePluginState, useTranslation } from "@kn/common";
import { resolvePluginRuntimeState } from "../plugin-runtime-state";

// Install-status categories. Review status (pending/rejected) is shown per row.
const PLUGIN_CATEGORIES = [
    { id: 'all', labelKey: 'pluginManager.allPlugins', icon: LayoutGridIcon },
    { id: 'active', labelKey: 'pluginManager.active', icon: CheckCircleIcon },
    { id: 'disabled', labelKey: 'pluginManager.inactive', icon: XCircleIcon },
    { id: 'uninstalled', labelKey: 'pluginManager.notInstalled', icon: ClockIcon },
] as const;

type CategoryId = typeof PLUGIN_CATEGORIES[number]['id'];

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
        permissions: candidate.permissions ?? plugin.permissions ?? [],
        reviewComment: candidate.reviewComment,
        reviewReasonCode: candidate.reviewReasonCode?.value ?? candidate.reviewReasonCode,
        reviewerName: candidate.reviewerName,
        reviewTime: candidate.reviewTime,
    } as PluginSubmissionRecord
}

interface PluginData {
    id: string;
    name: string;
    icon: string;
    developer: string;
    developerId?: string;
    maintainer: string;
    description?: string;
    status?: string | { value?: string; desc?: string };
    currentVersion?: string;
    currentVersionNumber?: string;
    pluginKey?: string;
    installStatus?: string | { value?: string } | null;
    currentVersionId?: string;
    resourcePath?: string;
    integrity?: string;
    installeddVersions?: Array<{ id?: string }>;
    permissions?: string[];
    createTime?: string;
    updateTime?: string;
}

const PAGE_SIZE = 100;

export const PluginManager: React.FC<PropsWithChildren> = ({ children }) => {

    const { t } = useTranslation();
    const { isMobile } = useResponsive();
    const { pluginManager } = useContext(AppContext);
    const { loadedPluginNames, pluginVersion } = usePluginState();
    const [plugins, setPlugins] = useState<PluginData[]>([])
    const [pluginsLoading, setPluginsLoading] = useState(true)
    const [pluginsError, setPluginsError] = useState<string>()
    const [submissions, setSubmissions] = useState<PluginSubmissionRecord[]>([])
    const [submissionsLoading, setSubmissionsLoading] = useState(false)
    const [submissionsError, setSubmissionsError] = useState<string>()
    const [submissionPage, setSubmissionPage] = useState(1)
    const [submissionPages, setSubmissionPages] = useState(1)
    const [submissionTotal, setSubmissionTotal] = useState(0)
    const submissionRequestRef = useRef(0)
    const [showSubmissions, setShowSubmissions] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all')
    const [refreshKey, setRefreshKey] = useState(0)

    const runtimeEntries = useMemo(
        () => pluginManager?.getPluginEntries() ?? [],
        // loadedPluginNames/pluginVersion change on registry updates; the
        // manager service itself is a stable object from AppContext.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pluginManager, loadedPluginNames, pluginVersion],
    )

    // The catalogue endpoint defaults to 10 per page; the manager must show the
    // whole catalogue, otherwise plugins silently disappear after the first ten.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setPluginsLoading(true);
            setPluginsError(undefined);
            try {
                const records: PluginData[] = [];
                let current = 1;
                let pages = 1;
                do {
                    const response = await useApi(APIS.GET_PLUGIN_LIST, { current, pageSize: PAGE_SIZE });
                    const pageRecords = response.data?.records ?? [];
                    records.push(...pageRecords);
                    pages = Number(response.data?.pages ?? 1) || 1;
                    current += 1;
                } while (current <= pages && !cancelled);
                if (!cancelled) setPlugins(records);
            } catch (error) {
                if (!cancelled) {
                    setPluginsError(error instanceof Error ? error.message : t('pluginManager.loadFailed'));
                }
            } finally {
                if (!cancelled) setPluginsLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [refreshKey, t]);

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
                setSubmissionTotal(res.data?.total ?? records.length)
            })
            .catch(error => {
                if (requestId !== submissionRequestRef.current) return
                setSubmissionsError(error?.message || t('pluginManager.loadFailed'))
            })
            .finally(() => {
                if (requestId === submissionRequestRef.current) setSubmissionsLoading(false)
            })
    }, [t])

    // Load the first page even when the submissions tab is closed: the sidebar
    // badge used to show 0 until the user happened to open the tab.
    useEffect(() => {
        refreshSubmissions(1)
    }, [refreshKey, refreshSubmissions])

    const resolveState = useCallback(
        (plugin: PluginData) =>
            resolvePluginRuntimeState(
                plugin,
                runtimeEntries,
                (name) => pluginManager?.isPluginRemovable(name) ?? true,
            ),
        [runtimeEntries, pluginManager],
    )

    // Statistics combine backend install records with the runtime registry, so
    // bundled/system plugins are not counted as "not installed".
    const stats = useMemo(() => {
        let active = 0;
        let disabled = 0;
        let uninstalled = 0;
        for (const plugin of plugins) {
            const state = resolveState(plugin);
            if (state.active) active += 1;
            else if (state.disabled) disabled += 1;
            else if (!state.installed) uninstalled += 1;
        }
        return { total: plugins.length, active, disabled, uninstalled };
    }, [plugins, resolveState]);

    const filteredPlugins = useMemo(() => {
        if (selectedCategory === 'all') return plugins;
        return plugins.filter((plugin) => {
            const state = resolveState(plugin);
            if (selectedCategory === 'active') return state.active;
            if (selectedCategory === 'disabled') return state.disabled;
            return !state.installed;
        });
    }, [plugins, selectedCategory, resolveState]);

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
            <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-0">
                {isMobile && (
                    <div className="flex shrink-0 flex-col gap-2 border-b p-3">
                        <div className="flex gap-2">
                            <Button type="button" variant={!showSubmissions ? "default" : "outline"} className="h-11 flex-1" onClick={() => setShowSubmissions(false)}>
                                {t('pluginManager.allPlugins')}
                            </Button>
                            <Button type="button" variant={showSubmissions ? "default" : "outline"} className="h-11 flex-1" onClick={() => setShowSubmissions(true)}>
                                {t('pluginManager.mySubmissions')}
                            </Button>
                        </div>
                        <DeveloperStatusCard />
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
                        <div className="space-y-2 p-4 pb-0">
                            <DeveloperStatusCard />
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
                                <Badge variant={showSubmissions ? "secondary" : "outline"}>{submissionTotal}</Badge>
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
                    </ScrollArea>
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
                        : <PluginList
                            data={filteredPlugins}
                            onRefresh={refreshPlugins}
                            loadingPlugins={pluginsLoading}
                            pluginsError={pluginsError}
                        />}
                </div>
            </div>
        </DialogContent>
    </Dialog>
}
