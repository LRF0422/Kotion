import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeFile, useApi, useUploadFile } from "../../../hooks";
import {
    Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger,
    IconButton, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, AlertDialog, AlertDialogAction,
    AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger, EmptyState, toast, Checkbox, Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue, Separator, ScrollArea, cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@kn/ui";
import {
    PlusIcon, SearchIcon, UploadIcon, XIcon, Loader2Icon, AlertCircleIcon, CheckCircleIcon, EditIcon,
    PowerIcon, BoxIcon, Trash2Icon, MoreVerticalIcon, ArrowUpDownIcon, EyeIcon, CopyIcon, RefreshCwIcon,
    SettingsIcon, HistoryIcon, InfoIcon, ChevronRightIcon
} from "@kn/icon";
import { PluginUploader } from "../PluginUploader";
import { APIS } from "../../../api";
import { CollaborationEditor } from "@kn/editor";
import { isObject } from "lodash";
import { useTranslation } from "@kn/common";

interface PluginStatus {
    code: string;
    desc: string;
}

interface Plugin {
    id: string;
    name: string;
    icon: string;
    developer: string;
    maintainer: string;
    description?: string;
    status: PluginStatus;
    currentVersion?: string;
    key?: string;
    createdAt?: string;
    updatedAt?: string;
}

interface PluginVersion {
    label: string;
    content: any;
}

type SortOption = 'name' | 'status' | 'updated' | 'created';
type SortDirection = 'asc' | 'desc';

export interface PluginListProps {
    data: Plugin[];
    onRefresh?: () => void;
}

export const PluginList: React.FC<PluginListProps> = (props) => {

    const { t } = useTranslation();
    const { usePath, upload } = useUploadFile();
    const [open, setOpen] = useState(false);
    const [currentId, setCurrentId] = useState<string>();
    const [currentPlugin, setCurrentPlugin] = useState<Plugin>();
    const [file, setFile] = useState<KnowledgeFile>();
    const [descriptions, setDescriptions] = useState<PluginVersion[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [activePluginId, setActivePluginId] = useState<string>();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [pluginToDelete, setPluginToDelete] = useState<Plugin>();
    const [newTabName, setNewTabName] = useState("");
    const [addingTab, setAddingTab] = useState(false);

    // New state for enhanced features
    const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortOption>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [detailPlugin, setDetailPlugin] = useState<Plugin | null>(null);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    // Sort and filter plugins
    const processedPlugins = useMemo(() => {
        let result = [...props.data];

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(plugin =>
                plugin.name.toLowerCase().includes(query) ||
                plugin.developer.toLowerCase().includes(query) ||
                plugin.maintainer.toLowerCase().includes(query) ||
                plugin.description?.toLowerCase().includes(query)
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
                    comparison = (a.status?.code || '').localeCompare(b.status?.code || '');
                    break;
                case 'updated':
                    comparison = (a.updatedAt || '').localeCompare(b.updatedAt || '');
                    break;
                case 'created':
                    comparison = (a.createdAt || '').localeCompare(b.createdAt || '');
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [props.data, searchQuery, sortBy, sortDirection]);

    // Check if all visible plugins are selected
    const allSelected = useMemo(() => {
        return processedPlugins.length > 0 &&
            processedPlugins.every(p => selectedPlugins.has(p.id));
    }, [processedPlugins, selectedPlugins]);

    // Check if some plugins are selected
    const someSelected = useMemo(() => {
        return processedPlugins.some(p => selectedPlugins.has(p.id)) && !allSelected;
    }, [processedPlugins, selectedPlugins, allSelected]);

    useEffect(() => {
        if (currentId) {
            setLoading(true);
            useApi(APIS.GET_PLUGIN, { id: currentId })
                .then(res => {
                    const desc: PluginVersion[] = res.data.currentVersion?.versionDescription || [];
                    setCurrentPlugin(res.data);
                    setDescriptions(desc.length > 0 ? res.data.currentVersion.versionDescription : [
                        { label: "Feature", content: {} },
                        { label: "Detail", content: {} },
                        { label: "ChangeLog", content: {} },
                    ]);
                    setOpen(true);
                })
                .catch(error => {
                    console.error('Failed to load plugin:', error);
                    toast.error(t('pluginManager.loadFailed'));
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [currentId])

    // Selection handlers
    const handleSelectAll = useCallback(() => {
        if (allSelected) {
            setSelectedPlugins(new Set());
        } else {
            setSelectedPlugins(new Set(processedPlugins.map(p => p.id)));
        }
    }, [allSelected, processedPlugins]);

    const handleSelectPlugin = useCallback((pluginId: string) => {
        setSelectedPlugins(prev => {
            const newSet = new Set(prev);
            if (newSet.has(pluginId)) {
                newSet.delete(pluginId);
            } else {
                newSet.add(pluginId);
            }
            return newSet;
        });
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedPlugins(new Set());
    }, []);

    // Bulk actions
    const handleBulkEnable = useCallback(async () => {
        if (selectedPlugins.size === 0) return;
        setBulkActionLoading(true);
        try {
            // TODO: Implement bulk enable API call
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated delay
            toast.success(`${selectedPlugins.size} ${t('pluginManager.bulkEnableSuccess')}`);
            setSelectedPlugins(new Set());
            props.onRefresh?.();
        } catch (error) {
            toast.error(t('pluginManager.operationFailed'));
        } finally {
            setBulkActionLoading(false);
        }
    }, [selectedPlugins, props.onRefresh, t]);

    const handleBulkDisable = useCallback(async () => {
        if (selectedPlugins.size === 0) return;
        setBulkActionLoading(true);
        try {
            // TODO: Implement bulk disable API call
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated delay
            toast.success(`${selectedPlugins.size} ${t('pluginManager.bulkDisableSuccess')}`);
            setSelectedPlugins(new Set());
            props.onRefresh?.();
        } catch (error) {
            toast.error(t('pluginManager.operationFailed'));
        } finally {
            setBulkActionLoading(false);
        }
    }, [selectedPlugins, props.onRefresh, t]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedPlugins.size === 0) return;
        setBulkActionLoading(true);
        try {
            // TODO: Implement bulk delete API call
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated delay
            toast.success(`${selectedPlugins.size} ${t('pluginManager.bulkDeleteSuccess')}`);
            setSelectedPlugins(new Set());
            props.onRefresh?.();
        } catch (error) {
            toast.error(t('pluginManager.operationFailed'));
        } finally {
            setBulkActionLoading(false);
        }
    }, [selectedPlugins, props.onRefresh, t]);

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

    const handleEditPlugin = useCallback((plugin: Plugin) => {
        setDetailPlugin(plugin);
    }, []);

    const handleToggleActive = useCallback(async (plugin: Plugin) => {
        setActivePluginId(plugin.id);
        try {
            // TODO: Implement activate/deactivate API call
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated delay
            toast.success(plugin.status.code === 'ACTIVE' ? t('pluginManager.disableSuccess') : t('pluginManager.enableSuccess'));
            props.onRefresh?.();
        } catch (error) {
            toast.error(t('pluginManager.operationFailed'));
        } finally {
            setActivePluginId(undefined);
        }
    }, [props.onRefresh, t]);

    const handleDeletePlugin = useCallback((plugin: Plugin) => {
        setPluginToDelete(plugin);
        setDeleteDialogOpen(true);
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!pluginToDelete) return;

        try {
            // TODO: Implement delete API call
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulated delay
            toast.success(t('pluginManager.deleteSuccess'));
            props.onRefresh?.();
        } catch (error) {
            toast.error(t('pluginManager.operationFailed'));
        } finally {
            setDeleteDialogOpen(false);
            setPluginToDelete(undefined);
        }
    }, [pluginToDelete, props.onRefresh, t]);

    const handleCopyPluginKey = useCallback((plugin: Plugin) => {
        navigator.clipboard.writeText(plugin.key || plugin.id);
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

        setPublishing(true);
        try {
            await useApi(APIS.CREATE_PLUGIN, null, {
                id: currentPlugin.id,
                resourcePath: file?.name,
                publish: true,
                versionDescs: descriptions.map(item => ({
                    label: item.label,
                    content: JSON.stringify(item.content),
                }))
            });
            toast.success(t('pluginManager.publishSuccess'));
            setOpen(false);
            setFile(undefined);
            props.onRefresh?.();
        } catch (error) {
            console.error('Failed to publish plugin:', error);
            toast.error(t('pluginManager.operationFailed'));
        } finally {
            setPublishing(false);
        }
    }, [currentPlugin, file, descriptions, props.onRefresh, t]);

    const getStatusBadgeVariant = (status: PluginStatus) => {
        switch (status?.code) {
            case 'ACTIVE': return 'default';
            case 'INACTIVE': return 'secondary';
            case 'PENDING': return 'outline';
            default: return 'secondary';
        }
    };

    const getStatusColor = (status: PluginStatus) => {
        switch (status?.code) {
            case 'ACTIVE': return 'text-green-500';
            case 'INACTIVE': return 'text-gray-400';
            case 'PENDING': return 'text-yellow-500';
            default: return 'text-gray-400';
        }
    };
    return <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b flex-shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <Input
                    icon={<SearchIcon className="h-4 w-4" />}
                    placeholder={t('pluginManager.searchPlugins')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-0 max-w-xs"
                />

                {/* Sort Options */}
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger className="w-[140px]">
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

            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center gap-1 flex-shrink-0">
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
                    <Button size="sm" className="flex-shrink-0">
                        <PlusIcon className="h-4 w-4 mr-1" />
                        {t('pluginManager.newPlugin')}
                    </Button>
                </PluginUploader>
            </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedPlugins.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b flex-shrink-0">
                <Checkbox
                    checked={allSelected}
                    // @ts-ignore
                    indeterminate={someSelected}
                    onCheckedChange={handleSelectAll}
                />
                <span className="text-sm font-medium">
                    {selectedPlugins.size} {t('pluginManager.selected')}
                </span>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBulkEnable}
                        disabled={bulkActionLoading}
                        className="h-7"
                    >
                        <PowerIcon className="h-3 w-3 mr-1 text-green-500" />
                        {t('pluginManager.enable')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBulkDisable}
                        disabled={bulkActionLoading}
                        className="h-7"
                    >
                        <PowerIcon className="h-3 w-3 mr-1 text-gray-400" />
                        {t('pluginManager.disable')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={bulkActionLoading}
                        className="h-7 text-destructive hover:text-destructive"
                    >
                        <Trash2Icon className="h-3 w-3 mr-1" />
                        {t('pluginManager.delete')}
                    </Button>
                </div>
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    className="h-7"
                >
                    <XIcon className="h-3 w-3 mr-1" />
                    {t('pluginManager.clear')}
                </Button>
            </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden min-w-0">
            {/* Plugin List */}
            <ScrollArea className={cn("flex-1 min-w-0", detailPlugin && "border-r")}>
                <div className="p-2 space-y-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
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
                            const isActivating = activePluginId === item.id;
                            const isActive = item.status?.code === 'ACTIVE';
                            const isSelected = selectedPlugins.has(item.id);
                            const isDetailOpen = detailPlugin?.id === item.id;

                            return (
                                <div
                                    key={item.id || index}
                                    className={cn(
                                        "px-3 py-2 rounded-md flex items-center gap-3 group w-full transition-colors overflow-hidden",
                                        isSelected && "bg-primary/10",
                                        isDetailOpen && "bg-muted ring-1 ring-primary/20",
                                        !isSelected && !isDetailOpen && "hover:bg-muted/50"
                                    )}
                                >
                                    {/* Checkbox */}
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleSelectPlugin(item.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex-shrink-0"
                                    />

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
                                            {item.currentVersion && (
                                                <span className="text-xs text-muted-foreground flex-shrink-0">v{item.currentVersion}</span>
                                            )}
                                            <Badge
                                                className="h-5 shrink-0 text-xs"
                                                variant={getStatusBadgeVariant(item.status)}
                                            >
                                                {item.status?.desc || 'Unknown'}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {item.developer} {item.maintainer && `/ ${item.maintainer}`}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                            ) : (
                                                                <PowerIcon className={cn("h-4 w-4", getStatusColor(item.status))} />
                                                            )
                                                        }
                                                        onClick={() => handleToggleActive(item)}
                                                        disabled={isActivating}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {isActive ? t('pluginManager.deactivate') : t('pluginManager.activate')}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <IconButton icon={<MoreVerticalIcon className="h-4 w-4" />} />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEditPlugin(item)}>
                                                    <EditIcon className="h-4 w-4 mr-2" />
                                                    {t('pluginManager.edit')}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => {
                                                    if (currentId === item.id) {
                                                        setOpen(true);
                                                    } else {
                                                        setCurrentId(item.id);
                                                    }
                                                }}>
                                                    <UploadIcon className="h-4 w-4 mr-2" />
                                                    {t('pluginManager.publishNewVersion')}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleCopyPluginKey(item)}>
                                                    <CopyIcon className="h-4 w-4 mr-2" />
                                                    {t('pluginManager.copyPluginKey')}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => handleDeletePlugin(item)}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash2Icon className="h-4 w-4 mr-2" />
                                                    {t('pluginManager.delete')}
                                                </DropdownMenuItem>
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
                <div className="w-[350px] flex-shrink-0 flex flex-col h-full">
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
                                        v{detailPlugin.currentVersion || '1.0.0'}
                                    </div>
                                    <Badge variant={getStatusBadgeVariant(detailPlugin.status)} className="mt-1">
                                        {detailPlugin.status?.desc || t('pluginManager.unknown')}
                                    </Badge>
                                </div>
                            </div>

                            <Separator />

                            {/* Plugin Info */}
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.developer')}</Label>
                                    <p className="text-sm">{detailPlugin.developer}</p>
                                </div>
                                {detailPlugin.maintainer && (
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
                                {detailPlugin.key && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.pluginKey')}</Label>
                                        <div className="flex items-center gap-1">
                                            <code className="text-xs bg-muted px-2 py-1 rounded">{detailPlugin.key}</code>
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
                                        onClick={() => handleToggleActive(detailPlugin)}
                                    >
                                        <PowerIcon className={cn("h-4 w-4 mr-2", getStatusColor(detailPlugin.status))} />
                                        {detailPlugin.status?.code === 'ACTIVE' ? t('pluginManager.disable') : t('pluginManager.enable')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="justify-start"
                                        onClick={() => {
                                            if (currentId === detailPlugin.id) {
                                                setOpen(true);
                                            } else {
                                                setCurrentId(detailPlugin.id);
                                            }
                                        }}
                                    >
                                        <UploadIcon className="h-4 w-4 mr-2" />
                                        {t('pluginManager.publish')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="justify-start"
                                        onClick={() => handleEditPlugin(detailPlugin)}
                                    >
                                        <SettingsIcon className="h-4 w-4 mr-2" />
                                        {t('pluginManager.settings')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="justify-start text-destructive hover:text-destructive"
                                        onClick={() => handleDeletePlugin(detailPlugin)}
                                    >
                                        <Trash2Icon className="h-4 w-4 mr-2" />
                                        {t('pluginManager.delete')}
                                    </Button>
                                </div>
                            </div>

                            <Separator />

                            {/* Version History Placeholder */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-muted-foreground uppercase">{t('pluginManager.versionHistory')}</Label>
                                    <Button variant="ghost" size="sm" className="h-6 text-xs">
                                        {t('pluginManager.viewAll')}
                                        <ChevronRightIcon className="h-3 w-3 ml-1" />
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                                        <HistoryIcon className="h-4 w-4 text-muted-foreground" />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">v{detailPlugin.currentVersion || '1.0.0'}</div>
                                            <div className="text-xs text-muted-foreground">{t('pluginManager.currentVersion')}</div>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">{t('pluginManager.latest')}</Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
        <Dialog open={open} onOpenChange={(value) => {
            setOpen(value);
            if (!value) {
                setFile(undefined);
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
                        <Label className="flex items-center gap-2">
                            {t('pluginManager.uploadPluginFile')}
                            <span className="text-xs text-muted-foreground">({t('pluginManager.required')})</span>
                        </Label>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    upload().then(res => {
                                        setFile(res);
                                        toast.success(t('pluginManager.fileUploaded'));
                                    }).catch(() => {
                                        toast.error(t('pluginManager.operationFailed'));
                                    });
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
                                                id=""
                                                content={isObject(item.content) ? item.content : JSON.parse(item.content || '{}')}
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
                    <AlertDialogTitle>{t('pluginManager.deletePlugin')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('pluginManager.deleteConfirm')} "{pluginToDelete?.name}"? {t('pluginManager.deleteWarning')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPluginToDelete(undefined)}>
                        {t('pluginManager.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>
                        {t('pluginManager.delete')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
}