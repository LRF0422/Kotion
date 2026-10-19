import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PluginArtifactFile, GlobalState, useApi, useUploadFile, useSelector, APIS, AppContext, event, PLUGIN_CHANGED, logger, usePluginState, getApiErrorMessage } from "@kn/common";
import {
    Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger,
    IconButton, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, AlertDialog, AlertDialogAction,
    AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger, EmptyState, toast, Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue, Separator, ScrollArea, cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@kn/ui";
import {
    PlusIcon, SearchIcon, UploadIcon, XIcon, Loader2Icon, CheckCircleIcon,
    PowerIcon, BoxIcon, Trash2Icon, MoreVerticalIcon, ArrowUpDownIcon, EyeIcon, CopyIcon, RefreshCwIcon
} from "@kn/icon";
import { PluginUploader } from "../PluginUploader";
import { useDeveloperProfile } from "../../Developer/developer-api";
import { DeveloperVerificationDialog } from "../../Developer/DeveloperVerificationDialog";
import { resolvePluginRuntimeState } from "../plugin-runtime-state";

import { CollaborationEditor } from "@kn/editor";
import { useTranslation } from "@kn/common";
import { hasDocumentationContent, pluginRuntimeIdentity, toRemotePluginDescriptor } from "../plugin-model";

interface Plugin {
    id: string;
    name: string;
    icon: string;
    developer: string;
    developerId?: string;
    maintainer: string;
    description?: string;
    /** Review status: PENDING / IN_PROGRESS / REJECTED / DONE (bare or { value }). */
    status?: string | { value?: string; desc?: string; code?: string };
    currentVersion?: string;
    currentVersionNumber?: string;
    key?: string;
    createdAt?: string;
    updatedAt?: string;
    createTime?: string;
    updateTime?: string;
    // Runtime install status (from backend PluginVO.installStatus): undefined/null = not installed
    installStatus?: string | { value?: string; desc?: string } | null;
    currentVersionId?: string;
    pluginKey?: string;
    resourcePath?: string;
    integrity?: string;
    /** Versions of this plugin installed by the current user (newest first). */
    installeddVersions?: Array<{ id?: string; version?: string }>;
    /** Candidate version while a submission is in review / rejected. */
    candidateVersion?: {
        version?: string;
        reviewComment?: string;
        reviewReasonCode?: string | { value?: string };
    };
}

// Backend may serialize an enum as a bare string or as { value, desc }. Install
// state comes from plugin-runtime-state (backend record + runtime registry).

const pluginRuntimeDescriptor = (plugin: Plugin) => {
    const descriptor = toRemotePluginDescriptor(plugin);
    if (!descriptor) {
        logger.warn('Skipping plugin with incomplete runtime metadata', {
            name: plugin.name,
            pluginKey: plugin.pluginKey,
            currentVersionId: plugin.currentVersionId,
        });
    }
    return descriptor;
};

const nextPatchVersion = (version?: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
    return match ? `${match[1]}.${match[2]}.${(BigInt(match[3]) + 1n).toString()}` : '1.0.0';
};

/**
 * Serialize a description payload exactly once. Content loaded from the API is
 * already a JSON string, so stringify only plain objects/arrays — otherwise the
 * stored value ends up double-encoded and unreadable on the detail page.
 */
const toVersionContentString = (content: any): string => {
    if (typeof content === 'string') {
        const trimmed = content.trim();
        if (!trimmed) return '{}';
        try {
            return JSON.stringify(JSON.parse(trimmed));
        } catch {
            return '{}';
        }
    }
    return JSON.stringify(content ?? {});
};

/** Coerce persisted content into an editor-friendly object without throwing. */
const resolveEditorContent = (content: any): any => {
    if (content && typeof content === 'object') return content;
    if (typeof content === 'string') {
        try {
            const parsed = JSON.parse(content);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

const pickPluginFile = () => new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,application/javascript,text/javascript';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
});

interface PluginVersion {
    label: string;
    content: any;
}

/** One row of the owner-only version history. */
interface PluginVersionHistoryItem {
    id?: string;
    version?: string;
    status?: string | { value?: string; desc?: string };
    reviewStatus?: string | { value?: string; desc?: string };
    reviewComment?: string;
    createTime?: string;
}

const enumCode = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'value' in value) {
        const inner = (value as { value?: unknown }).value;
        return typeof inner === 'string' ? inner : undefined;
    }
    return undefined;
};

const formatDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

type SortOption = 'name' | 'status' | 'updated' | 'created';
type SortDirection = 'asc' | 'desc';

export interface PluginListProps {
    data: Plugin[];
    onRefresh?: () => void;
    loadingPlugins?: boolean;
    pluginsError?: string;
}

export const PluginList: React.FC<PluginListProps> = (props) => {

    const { t } = useTranslation();
    const { userInfo } = useSelector((state: GlobalState) => state);
    const { usePath, uploadPluginFile } = useUploadFile();
    const { pluginManager } = useContext(AppContext);
    const { loadedPluginNames, pluginVersion } = usePluginState();
    const [open, setOpen] = useState(false);
    const [currentId, setCurrentId] = useState<string>();
    // Publishing a new version is a developer-only action, same gate as 上架.
    const { verified: developerVerified } = useDeveloperProfile();
    const [verifyOpen, setVerifyOpen] = useState(false);
    // Remember which row asked to publish, so "继续" after verification opens
    // that plugin's version dialog instead of dropping the user's intent.
    const [pendingPublishId, setPendingPublishId] = useState<string>();
    const [currentPlugin, setCurrentPlugin] = useState<Plugin>();
    const [file, setFile] = useState<PluginArtifactFile>();
    const [version, setVersion] = useState("1.0.0");
    const uploadSessionRef = useRef(0);
    // Live editor instances per description tab, read at publish time so unsaved
    // edits are never dropped (and content is never stringified twice).
    const editorRefs = useRef<Record<number, any>>({});
    const [descriptions, setDescriptions] = useState<PluginVersion[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [activePluginId, setActivePluginId] = useState<string>();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [pluginToDelete, setPluginToDelete] = useState<Plugin>();
    const [newTabName, setNewTabName] = useState("");
    const [addingTab, setAddingTab] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [detailPlugin, setDetailPlugin] = useState<Plugin | null>(null);
    const [versions, setVersions] = useState<PluginVersionHistoryItem[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState<string>();

    const runtimeEntries = useMemo(
        () => pluginManager?.getPluginEntries() ?? [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pluginManager, loadedPluginNames, pluginVersion],
    );

    const runtimeState = useCallback(
        (plugin: Plugin) =>
            resolvePluginRuntimeState(
                plugin,
                runtimeEntries,
                (name) => pluginManager?.isPluginRemovable(name) ?? true,
            ),
        [runtimeEntries, pluginManager],
    );

    /** Version id recorded by the backend for the *installed* copy. */
    const installedVersionId = useCallback(
        (plugin: Plugin): string | undefined =>
            plugin.installeddVersions?.[0]?.id ?? plugin.currentVersionId,
        [],
    );

    // Sort and filter plugins
    const processedPlugins = useMemo(() => {
        let result = [...props.data];

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(plugin =>
                (plugin.name || '').toLowerCase().includes(query) ||
                (plugin.developer || '').toLowerCase().includes(query) ||
                (plugin.maintainer || '').toLowerCase().includes(query) ||
                (plugin.description || '').toLowerCase().includes(query)
            );
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'status':
                    comparison = (runtimeState(a).active ? '0' : runtimeState(a).installed ? '1' : '2')
                        .localeCompare(runtimeState(b).active ? '0' : runtimeState(b).installed ? '1' : '2');
                    break;
                case 'updated':
                    comparison = (a.updateTime || a.updatedAt || '').localeCompare(b.updateTime || b.updatedAt || '');
                    break;
                case 'created':
                    comparison = (a.createTime || a.createdAt || '').localeCompare(b.createTime || b.createdAt || '');
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [props.data, searchQuery, sortBy, sortDirection, runtimeState]);

    const handleAddTab = useCallback(() => {
        if (!newTabName.trim()) {
            toast.error(t('pluginManager.tabNameEmpty'));
            return;
        }

        if (descriptions.some(desc => desc.label === newTabName)) {
            toast.error(t('pluginManager.tabNameExists'));
            return;
        }

        setDescriptions(prev => [...prev, { label: newTabName, content: {} }]);
        setNewTabName("");
        setAddingTab(false);
        toast.success(t('pluginManager.tabAdded'));
    }, [newTabName, descriptions, t]);

    const handleRemoveTab = useCallback((index: number) => {
        if (descriptions.length <= 1) {
            toast.error(t('pluginManager.cannotRemoveLastTab'));
            return;
        }

        setDescriptions(prev => prev.filter((_, i) => i !== index));
        toast.success(t('pluginManager.tabRemoved'));
    }, [descriptions, t]);

    const isOwnPlugin = useCallback(
        (plugin: Plugin) => String(plugin.developerId || '') === String(userInfo?.id || ''),
        [userInfo?.id],
    );

    // Owner-only version history for the detail panel. The endpoint is
    // owner-scoped, so other developers' plugins are not queried at all.
    useEffect(() => {
        if (!detailPlugin || !isOwnPlugin(detailPlugin)) {
            setVersions([]);
            setVersionsError(undefined);
            return;
        }
        let cancelled = false;
        setVersionsLoading(true);
        setVersionsError(undefined);
        useApi(APIS.GET_PLUGIN_VERSIONS, { id: detailPlugin.id })
            .then((response) => {
                if (cancelled) return;
                setVersions(Array.isArray(response.data) ? response.data : []);
            })
            .catch((error) => {
                if (cancelled) return;
                setVersionsError(getApiErrorMessage(error, t('pluginManager.loadFailed')));
            })
            .finally(() => {
                if (!cancelled) setVersionsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [detailPlugin, isOwnPlugin, t]);

    const requestVersionPublish = useCallback((plugin: Plugin) => {
        if (!developerVerified) {
            setPendingPublishId(plugin.id);
            setVerifyOpen(true);
            return;
        }
        if (currentId === plugin.id) {
            setOpen(true);
        } else {
            setCurrentId(plugin.id);
        }
    }, [currentId, developerVerified]);

    const handleInstall = useCallback(async (plugin: Plugin) => {
        const versionId = plugin.currentVersionId;
        const descriptor = pluginRuntimeDescriptor(plugin);
        if (!versionId || !descriptor) {
            toast.error(t('pluginManager.notInstalled'));
            return;
        }
        setActivePluginId(plugin.id);
        try {
            await useApi(APIS.INSTALL_PLUGIN, { versionId });
            const activated = pluginManager ? await pluginManager.installPlugin(descriptor) : false;
            event.emit(PLUGIN_CHANGED, { source: 'install' });
            if (activated) {
                toast.success(t('pluginManager.installSuccess'));
            } else {
                toast.warning(t('pluginHub.detail.activationFailed'));
            }
            props.onRefresh?.();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('pluginManager.operationFailed')));
        } finally {
            setActivePluginId(undefined);
        }
    }, [pluginManager, props.onRefresh, t]);

    const handleToggleActive = useCallback(async (plugin: Plugin) => {
        const state = runtimeState(plugin);
        if (!state.installed) {
            await handleInstall(plugin);
            return;
        }
        if (state.active && !state.removable) {
            toast.error(t('pluginManager.systemPluginLocked'));
            return;
        }
        const versionId = installedVersionId(plugin);
        setActivePluginId(plugin.id);
        try {
            if (state.active) {
                // Bundled/dev plugins have no backend install record; only the
                // registry needs to change. Marketplace installs update both.
                if (state.backendInstalled && versionId) {
                    await useApi(APIS.DISABLE_PLUGIN, { versionId });
                }
                pluginManager?.uninstallPlugin(pluginRuntimeIdentity(plugin));
                event.emit(PLUGIN_CHANGED, { source: 'disable' });
                toast.success(t('pluginManager.disableSuccess'));
            } else {
                if (!versionId) {
                    toast.error(t('pluginManager.notInstalled'));
                    return;
                }
                await useApi(APIS.ENABLE_PLUGIN, { versionId });
                const descriptor = pluginRuntimeDescriptor(plugin);
                const activated = pluginManager && descriptor
                    ? await pluginManager.installPlugin(descriptor)
                    : false;
                event.emit(PLUGIN_CHANGED, { source: 'enable' });
                if (activated) {
                    toast.success(t('pluginManager.enableSuccess'));
                } else {
                    toast.warning(t('pluginHub.detail.activationFailed'));
                }
            }
            props.onRefresh?.();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('pluginManager.operationFailed')));
        } finally {
            setActivePluginId(undefined);
        }
    }, [handleInstall, installedVersionId, pluginManager, props.onRefresh, runtimeState, t]);

    const handleDeletePlugin = useCallback((plugin: Plugin) => {
        const state = runtimeState(plugin);
        if (!state.installed) {
            toast.error(t('pluginManager.notInstalled'));
            return;
        }
        if (!state.removable) {
            toast.error(t('pluginManager.systemPluginLocked'));
            return;
        }
        setPluginToDelete(plugin);
        setDeleteDialogOpen(true);
    }, [runtimeState, t]);

    const confirmDelete = useCallback(async () => {
        if (!pluginToDelete) return;
        const state = runtimeState(pluginToDelete);
        if (!state.installed) {
            toast.error(t('pluginManager.notInstalled'));
            setDeleteDialogOpen(false);
            setPluginToDelete(undefined);
            return;
        }
        try {
            const versionId = installedVersionId(pluginToDelete);
            if (state.backendInstalled && versionId) {
                await useApi(APIS.DELETE_INSTALLED_PLUGIN, { versionId });
            }
            pluginManager?.uninstallPlugin(pluginRuntimeIdentity(pluginToDelete));
            event.emit(PLUGIN_CHANGED, { source: 'delete' });
            toast.success(t('pluginManager.uninstallSuccess'));
            props.onRefresh?.();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('pluginManager.operationFailed')));
        } finally {
            setDeleteDialogOpen(false);
            setPluginToDelete(undefined);
        }
    }, [installedVersionId, pluginManager, pluginToDelete, props.onRefresh, runtimeState, t]);

    const handleCopyPluginKey = useCallback((plugin: Plugin) => {
        navigator.clipboard.writeText(plugin.pluginKey || plugin.key || plugin.id);
        toast.success(t('pluginManager.keyCopied'));
    }, [t]);

    const publish = useCallback(async () => {
        if (!file) {
            toast.error(t('pluginManager.uploadFile'));
            return;
        }

        if (!currentPlugin) {
            toast.error(t('pluginManager.noPluginSelected'));
            return;
        }

        if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
            toast.error(t('pluginUploader.validation.versionFormat'));
            return;
        }
        // Pull the latest editor state before validating/sending: blur alone is
        // not reliable when the user clicks Publish straight from the editor.
        const synchronized = descriptions.map((item, index) => {
            const editor = editorRefs.current[index];
            return editor && typeof editor.getJSON === 'function'
                ? { ...item, content: editor.getJSON() }
                : item;
        });
        const normalizedLabels = synchronized.map(item => item.label.trim().toLowerCase());
        if (!synchronized.length || synchronized.length > 20
            || normalizedLabels.some(label => !label)
            || new Set(normalizedLabels).size !== normalizedLabels.length
            || !synchronized.some(item => hasDocumentationContent(item.content))) {
            toast.error(t('pluginUploader.validation.descriptionContent'));
            return;
        }

        const versionDescs = synchronized
            .filter(item => item.label.trim() && hasDocumentationContent(item.content))
            .map(item => ({
                label: item.label.trim(),
                content: toVersionContentString(item.content),
            }));

        setPublishing(true);
        try {
            await useApi(APIS.PUBLISH_PLUGIN_VERSION, { id: currentPlugin.id }, {
                version,
                resourcePath: file.name,
                integrity: file.integrity,
                versionDescs,
            });
            toast.success(t('pluginManager.publishSuccess'));
            setOpen(false);
            setFile(undefined);
            props.onRefresh?.();
        } catch (error) {
            console.error('Failed to publish plugin:', error);
            toast.error(getApiErrorMessage(error, t('pluginManager.operationFailed')));
        } finally {
            setPublishing(false);
        }
    }, [currentPlugin, file, version, descriptions, props.onRefresh, t]);

    // Badge/color/label are driven by the merged runtime state: a bundled or
    // dev plugin is active even without a backend install record.
    const installCode = useCallback((plugin: Plugin): 'ACTIVE' | 'DISABLED' | undefined => {
        const state = runtimeState(plugin);
        if (state.active) return 'ACTIVE';
        if (state.disabled) return 'DISABLED';
        return undefined;
    }, [runtimeState]);

    const getStatusBadgeVariant = (code?: string) => {
        switch (code) {
            case 'ACTIVE': return 'default';
            case 'DISABLED': return 'secondary';
            default: return 'outline';
        }
    };

    const getStatusColor = (code?: string) => {
        switch (code) {
            case 'ACTIVE': return 'text-green-500';
            case 'DISABLED': return 'text-gray-400';
            default: return 'text-gray-400';
        }
    };

    const versionLabel = (p: Plugin) =>
        p.currentVersionNumber || (typeof p.currentVersion === 'string' ? p.currentVersion : '');

    const installLabel = (p: Plugin) => {
        switch (installCode(p)) {
            case 'ACTIVE': return t('pluginManager.active');
            case 'DISABLED': return t('pluginManager.inactive');
            default: return t('pluginManager.notInstalled');
        }
    };

    const primaryActionLabel = (p: Plugin) => {
        const state = runtimeState(p);
        if (!state.installed) return t('pluginManager.install');
        if (state.active) return t('pluginManager.disable');
        return t('pluginManager.enable');
    };
    return <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b flex-shrink-0">
            <div className="flex w-full items-center gap-2 min-w-0 md:w-auto md:flex-1">
                <Input
                    icon={<SearchIcon className="h-4 w-4" />}
                    placeholder={t('pluginManager.searchPlugins')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-0 max-w-none sm:max-w-xs"
                />

                {/* Sort Options */}
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger className="w-[120px] sm:w-[140px]">
                        <ArrowUpDownIcon className="h-4 w-4 mr-1" />
                        <SelectValue placeholder={t('pluginManager.sortBy')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="name">{t('pluginManager.name')}</SelectItem>
                        <SelectItem value="status">{t('pluginManager.status')}</SelectItem>
                        <SelectItem value="updated">{t('pluginManager.lastUpdated')}</SelectItem>
                        <SelectItem value="created">{t('pluginManager.created')}</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                    className="h-9 w-9"
                >
                    <ArrowUpDownIcon className={cn("h-4 w-4 transition-transform", sortDirection === 'desc' && "rotate-180")} />
                </Button>
            </div>

            <Separator orientation="vertical" className="hidden h-6 md:block" />

            <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={props.onRefresh}
                                className="h-9 w-9"
                            >
                                <RefreshCwIcon className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('pluginManager.refresh', 'Refresh')}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <PluginUploader>
                    <Button size="sm" className="h-11 flex-shrink-0">
                        <PlusIcon className="h-4 w-4 mr-1" />
                        {t('pluginManager.newPlugin')}
                    </Button>
                </PluginUploader>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="relative flex-1 flex overflow-hidden min-w-0">
            {/* Plugin List */}
            <ScrollArea className={cn("flex-1 min-w-0", detailPlugin && "border-r")}>
                <div className="p-2 space-y-1">
                    {props.loadingPlugins ? (
                        <div className="flex items-center justify-center h-32">
                            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : props.pluginsError ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                            <p className="text-sm text-destructive">{props.pluginsError}</p>
                            <Button variant="outline" size="sm" onClick={props.onRefresh}>
                                {t('pluginManager.retry')}
                            </Button>
                        </div>
                    ) : processedPlugins.length === 0 ? (
                        <EmptyState
                            title={searchQuery ? t('pluginManager.noPluginsFound') : t('pluginManager.noPluginsYet')}
                            description={searchQuery ? t('pluginManager.tryAdjusting') : t('pluginManager.createFirst')}
                            icons={[BoxIcon]}
                            className="border-none"
                        />
                    ) : (
                        processedPlugins.map((item, index) => {
                            const state = runtimeState(item);
                            const isActivating = activePluginId === item.id;
                            const isActive = state.active;
                            const isDetailOpen = detailPlugin?.id === item.id;
                            const canToggle = !(isActive && !state.removable);

                            return (
                                <div
                                    key={item.id || index}
                                    className={cn(
                                        "px-3 py-2 rounded-md flex items-center gap-3 group w-full transition-colors overflow-hidden",
                                        isDetailOpen && "bg-muted ring-1 ring-primary/20",
                                        !isDetailOpen && "hover:bg-muted/50"
                                    )}
                                >
                                    {/* Avatar */}
                                    <Avatar className="h-10 w-10 shrink-0">
                                        <img src={usePath(item.icon)} alt={item.name} />
                                    </Avatar>

                                    {/* Info */}
                                    <div
                                        className="flex-1 min-w-0 overflow-hidden cursor-pointer"
                                        onClick={() => setDetailPlugin(isDetailOpen ? null : item)}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="text-sm font-medium truncate">{item.name}</span>
                                            {versionLabel(item) && (
                                                <span className="text-xs text-muted-foreground flex-shrink-0">v{versionLabel(item)}</span>
                                            )}
                                            <Badge
                                                className="h-5 shrink-0 text-xs"
                                                variant={getStatusBadgeVariant(installCode(item))}
                                            >
                                                {installLabel(item)}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {item.developer}
                                            {item.maintainer && item.maintainer !== item.developer && ` / ${item.maintainer}`}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <IconButton
                                                        icon={<EyeIcon className="h-4 w-4" />}
                                                        onClick={() => setDetailPlugin(isDetailOpen ? null : item)}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>{t('pluginManager.viewDetails')}</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <IconButton
                                                        icon={
                                                            isActivating ? (
                                                                <Loader2Icon className="h-4 w-4 animate-spin" />
                                                            ) : !state.installed ? (
                                                                <PlusIcon className="h-4 w-4" />
                                                            ) : (
                                                                <PowerIcon className={cn("h-4 w-4", getStatusColor(installCode(item)))} />
                                                            )
                                                        }
                                                        onClick={() => handleToggleActive(item)}
                                                        disabled={isActivating || !canToggle}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {!canToggle
                                                        ? t('pluginManager.systemPluginLocked')
                                                        : primaryActionLabel(item)}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <IconButton icon={<MoreVerticalIcon className="h-4 w-4" />} />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {String(item.developerId || '') === String(userInfo?.id || '') && (
                                                    <DropdownMenuItem onClick={() => requestVersionPublish(item)}>
                                                        <UploadIcon className="h-4 w-4 mr-2" />
                                                        {t('pluginManager.publishNewVersion')}
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => handleCopyPluginKey(item)}>
                                                    <CopyIcon className="h-4 w-4 mr-2" />
                                                    {t('pluginManager.copyPluginKey')}
                                                </DropdownMenuItem>
                                                {state.installed && state.removable && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => handleDeletePlugin(item)}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2Icon className="h-4 w-4 mr-2" />
                                                            {t('pluginManager.uninstall')}
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </ScrollArea>

            {/* Detail Panel */}
            {detailPlugin && (
                <div className="absolute inset-0 z-10 flex h-full w-full flex-col bg-background md:static md:w-[350px] md:flex-shrink-0">
                    <div className="p-4 border-b flex items-center justify-between">
                        <h3 className="font-semibold">{t('pluginManager.pluginDetails')}</h3>
                        <IconButton
                            icon={<XIcon className="h-4 w-4" />}
                            onClick={() => setDetailPlugin(null)}
                        />
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">
                            {/* Plugin Header */}
                            <div className="flex items-center gap-3">
                                <Avatar className="h-14 w-14">
                                    <img src={usePath(detailPlugin.icon)} alt={detailPlugin.name} />
                                </Avatar>
                                <div>
                                    <h4 className="font-semibold">{detailPlugin.name}</h4>
                                    <div className="text-sm text-muted-foreground">
                                        v{versionLabel(detailPlugin) || '1.0.0'}
                                    </div>
                                    <Badge variant={getStatusBadgeVariant(installCode(detailPlugin))} className="mt-1">
                                        {installLabel(detailPlugin)}
                                    </Badge>
                                    {runtimeState(detailPlugin).runtime && (
                                        <Badge variant="outline" className="ml-1 mt-1">
                                            {t(`pluginManager.source.${runtimeState(detailPlugin).runtime!.source}`)}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <Separator />

                            {/* Plugin Info */}
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.developer')}</Label>
                                    <p className="text-sm">{detailPlugin.developer}</p>
                                </div>
                                {detailPlugin.maintainer && detailPlugin.maintainer !== detailPlugin.developer && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.maintainer')}</Label>
                                        <p className="text-sm">{detailPlugin.maintainer}</p>
                                    </div>
                                )}
                                {detailPlugin.description && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.description', 'Description')}</Label>
                                        <p className="text-sm text-muted-foreground">{detailPlugin.description}</p>
                                    </div>
                                )}
                                {(detailPlugin.pluginKey || detailPlugin.key) && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.pluginKey')}</Label>
                                        <div className="flex items-center gap-1">
                                            <code className="text-xs bg-muted px-2 py-1 rounded">{detailPlugin.pluginKey || detailPlugin.key}</code>
                                            <IconButton
                                                icon={<CopyIcon className="h-3 w-3" />}
                                                onClick={() => handleCopyPluginKey(detailPlugin)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Separator />

                            {/* Quick Actions */}
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.quickActions')}</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="justify-start"
                                        disabled={
                                            activePluginId === detailPlugin.id ||
                                            (runtimeState(detailPlugin).active &&
                                                !runtimeState(detailPlugin).removable)
                                        }
                                        onClick={() => handleToggleActive(detailPlugin)}
                                    >
                                        {activePluginId === detailPlugin.id ? (
                                            <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                        ) : !runtimeState(detailPlugin).installed ? (
                                            <PlusIcon className="h-4 w-4 mr-2" />
                                        ) : (
                                            <PowerIcon className={cn("h-4 w-4 mr-2", getStatusColor(installCode(detailPlugin)))} />
                                        )}
                                        {primaryActionLabel(detailPlugin)}
                                    </Button>
                                    {String(detailPlugin.developerId || '') === String(userInfo?.id || '') && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="justify-start"
                                            onClick={() => requestVersionPublish(detailPlugin)}
                                        >
                                            <UploadIcon className="h-4 w-4 mr-2" />
                                            {t('pluginManager.publish')}
                                        </Button>
                                    )}
                                    {runtimeState(detailPlugin).installed && runtimeState(detailPlugin).removable && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="justify-start text-destructive hover:text-destructive"
                                            onClick={() => handleDeletePlugin(detailPlugin)}
                                        >
                                            <Trash2Icon className="h-4 w-4 mr-2" />
                                            {t('pluginManager.uninstall')}
                                        </Button>
                                    )}
                                </div>
                                {runtimeState(detailPlugin).active && !runtimeState(detailPlugin).removable && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('pluginManager.systemPluginLocked')}
                                    </p>
                                )}
                            </div>

                            {isOwnPlugin(detailPlugin) && (
                                <>
                                    <Separator />
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground uppercase">
                                            {t('pluginManager.versionHistory')}
                                        </Label>
                                        {versionsLoading ? (
                                            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                                <Loader2Icon className="h-4 w-4 animate-spin" />
                                                {t('pluginManager.loadingVersions')}
                                            </div>
                                        ) : versionsError ? (
                                            <p className="text-xs text-destructive">{versionsError}</p>
                                        ) : versions.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">{t('pluginManager.versionsEmpty')}</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {versions.map((item) => {
                                                    const versionStatus = enumCode(item.status);
                                                    const reviewCode = enumCode(item.reviewStatus);
                                                    const rejected = reviewCode === 'REJECTED';
                                                    const label = rejected
                                                        ? t('pluginManager.submissions.status.rejected')
                                                        : versionStatus === 'ACTIVE'
                                                            ? t('pluginManager.currentVersion')
                                                            : versionStatus === 'PENDING'
                                                                ? t('pluginManager.submissions.status.pending')
                                                                : versionStatus === 'IN_ACTIVE'
                                                                    ? t('pluginManager.historyVersion')
                                                                    : t('pluginManager.draftVersion');
                                                    return (
                                                        <div
                                                            key={item.id || `${item.version}-${item.createTime}`}
                                                            className="flex items-center gap-2 rounded-md bg-muted/50 p-2"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-medium">v{item.version || '-'}</div>
                                                                {item.createTime && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {formatDate(item.createTime)}
                                                                    </div>
                                                                )}
                                                                {rejected && item.reviewComment && (
                                                                    <p className="mt-1 text-xs text-destructive">
                                                                        {item.reviewComment}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <Badge
                                                                variant={rejected ? 'destructive' : versionStatus === 'ACTIVE' ? 'default' : 'secondary'}
                                                                className="shrink-0 text-xs"
                                                            >
                                                                {label}
                                                            </Badge>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
        <Dialog open={open} onOpenChange={(value) => {
            setOpen(value);
            if (!value) {
                uploadSessionRef.current += 1;
                setFile(undefined);
                setVersion("1.0.0");
                setCurrentId(undefined);
                setCurrentPlugin(undefined);
            }
        }}>
            <DialogTrigger />
            <DialogContent className="max-w-4xl w-full max-h-[85vh] flex flex-col">
                <DialogTitle className="flex items-center gap-3 flex-shrink-0">
                    <Avatar className="h-10 w-10">
                        <img src={usePath(currentPlugin?.icon || '')} alt={currentPlugin?.name || ''} />
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="truncate">{currentPlugin?.name}</div>
                        <div className="text-sm text-muted-foreground font-normal">
                            {t('pluginManager.publishVersion')}
                        </div>
                    </div>
                </DialogTitle>
                <DialogDescription />

                <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t('pluginManager.developer')}</Label>
                            <Input value={currentPlugin?.developer || ''} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('pluginManager.maintainer')}</Label>
                            <Input value={currentPlugin?.maintainer || ''} disabled />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('pluginManager.version')}</Label>
                        <Input
                            value={version}
                            onChange={(event) => setVersion(event.target.value)}
                            placeholder="1.0.0"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {t('pluginManager.uploadPluginFile')}
                            <span className="text-xs text-muted-foreground">({t('pluginManager.required')})</span>
                        </Label>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    const selected = await pickPluginFile();
                                    if (!selected) return;
                                    if (selected.size > 100 * 1024 * 1024) {
                                        toast.error(t('pluginUploader.uploadSection.fileLimit'));
                                        return;
                                    }
                                    const requestId = ++uploadSessionRef.current;
                                    setLoading(true);
                                    try {
                                        const uploaded = await uploadPluginFile(selected);
                                        if (requestId !== uploadSessionRef.current) return;
                                        setFile(uploaded);
                                        toast.success(t('pluginManager.fileUploaded'));
                                    } catch (error) {
                                        if (requestId === uploadSessionRef.current) toast.error(getApiErrorMessage(error, t('pluginManager.operationFailed')));
                                    } finally {
                                        if (requestId === uploadSessionRef.current) setLoading(false);
                                    }
                                }}
                                disabled={loading}
                            >
                                <UploadIcon className="h-4 w-4 mr-2" />
                                {t('pluginManager.chooseFile')}
                            </Button>
                            {file && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md flex-1">
                                    <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
                                    <span className="text-sm truncate flex-1">{file.originalName}</span>
                                    <IconButton
                                        icon={<XIcon className="h-4 w-4" />}
                                        onClick={() => setFile(undefined)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('pluginManager.versionDescription')}</Label>
                        {descriptions && descriptions.length > 0 && (
                            <Tabs defaultValue={descriptions[0].label} className="w-full">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <TabsList className="flex-shrink-0">
                                        {descriptions.map((item, index) => (
                                            <TabsTrigger key={index} value={item.label}>
                                                {item.label}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    {addingTab ? (
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <Input
                                                placeholder="Tab name"
                                                value={newTabName}
                                                onChange={(e) => setNewTabName(e.target.value)}
                                                className="h-8 w-28"
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleAddTab();
                                                    }
                                                }}
                                            />
                                            <IconButton
                                                icon={<CheckCircleIcon className="h-4 w-4" />}
                                                onClick={handleAddTab}
                                            />
                                            <IconButton
                                                icon={<XIcon className="h-4 w-4" />}
                                                onClick={() => {
                                                    setAddingTab(false);
                                                    setNewTabName("");
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <IconButton
                                            icon={<PlusIcon className="h-4 w-4" />}
                                            onClick={() => setAddingTab(true)}
                                            className="flex-shrink-0"
                                        />
                                    )}
                                </div>
                                <div className="border rounded-md overflow-hidden">
                                    {descriptions.map((item, index) => (
                                        <TabsContent key={index} value={item.label} className="m-0 p-0">
                                            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                                                <span className="text-sm font-medium">{item.label}</span>
                                                {descriptions.length > 1 && (
                                                    <IconButton
                                                        icon={<XIcon className="h-4 w-4" />}
                                                        onClick={() => handleRemoveTab(index)}
                                                    />
                                                )}
                                            </div>
                                            <CollaborationEditor
                                                ref={(editor: any) => {
                                                    editorRefs.current[index] = editor;
                                                }}
                                                id=""
                                                content={resolveEditorContent(item.content)}
                                                isEditable
                                                width="w-full"
                                                withTitle={false}
                                                toc={false}
                                                toolbar={true}
                                                user={null}
                                                token=""
                                                className="h-[250px] prose-sm"
                                                onBlur={(editor) => {
                                                    const content = editor.getJSON();
                                                    setDescriptions((data) => data.map((it, i) => i === index ? { ...it, content } : it));
                                                }}
                                            />
                                        </TabsContent>
                                    ))}
                                </div>
                            </Tabs>
                        )}
                    </div>
                </div>

                <DialogFooter className="mt-4 flex-shrink-0 border-t pt-4">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setOpen(false);
                            setFile(undefined);
                        }}
                        disabled={publishing}
                    >
                        {t('pluginManager.cancel')}
                    </Button>
                    <Button
                        onClick={publish}
                        disabled={publishing || !file}
                    >
                        {publishing ? (
                            <>
                                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                {t('pluginManager.publishing')}
                            </>
                        ) : (
                            t('pluginManager.publish')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger />
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('pluginManager.uninstallPlugin')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('pluginManager.uninstallConfirm')} "{pluginToDelete?.name}"? {t('pluginManager.uninstallWarning')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPluginToDelete(undefined)}>
                        {t('pluginManager.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>
                        {t('pluginManager.uninstall')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <DeveloperVerificationDialog
            open={verifyOpen}
            onOpenChange={setVerifyOpen}
            reason={t('pluginManager.publishNewVersion')}
            onVerified={() => {
                setVerifyOpen(false);
                if (pendingPublishId) {
                    setCurrentId(pendingPublishId);
                    setPendingPublishId(undefined);
                } else if (currentId) {
                    setOpen(true);
                }
            }}
        />
    </div>
}