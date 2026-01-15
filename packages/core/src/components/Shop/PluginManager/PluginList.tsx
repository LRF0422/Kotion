import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeFile, useApi, useUploadFile } from "../../../hooks";
import { Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger, IconButton, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, EmptyState, toast } from "@kn/ui";
import { PlusIcon, SearchIcon, UploadIcon, XIcon, Loader2Icon, AlertCircleIcon, CheckCircleIcon, EditIcon, PowerIcon, BoxIcon } from "@kn/icon";
import { PluginUploader } from "../PluginUploader";
import { APIS } from "../../../api";
import { CollaborationEditor } from "@kn/editor";
import { isObject } from "lodash";
import { cn } from "@kn/ui";

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
}

interface PluginVersion {
    label: string;
    content: any;
}

export interface PluginListProps {
    data: Plugin[];
}
export const PluginList: React.FC<PluginListProps> = (props) => {

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
    const [addingTab, setAddingTab] = useState(false)

    // Filtered plugins based on search query
    const filteredPlugins = useMemo(() => {
        if (!searchQuery.trim()) return props.data;

        const query = searchQuery.toLowerCase();
        return props.data.filter(plugin =>
            plugin.name.toLowerCase().includes(query) ||
            plugin.developer.toLowerCase().includes(query) ||
            plugin.maintainer.toLowerCase().includes(query) ||
            plugin.description?.toLowerCase().includes(query)
        );
    }, [props.data, searchQuery]);

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
                    toast.error('Failed to load plugin details');
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [currentId])

    const handleAddTab = useCallback(() => {
        if (!newTabName.trim()) {
            toast.error('Tab name cannot be empty');
            return;
        }

        if (descriptions.some(desc => desc.label === newTabName)) {
            toast.error('Tab name already exists');
            return;
        }

        setDescriptions(prev => [...prev, { label: newTabName, content: {} }]);
        setNewTabName("");
        setAddingTab(false);
        toast.success('Tab added successfully');
    }, [newTabName, descriptions]);

    const handleRemoveTab = useCallback((index: number) => {
        if (descriptions.length <= 1) {
            toast.error('Cannot remove the last tab');
            return;
        }

        setDescriptions(prev => prev.filter((_, i) => i !== index));
        toast.success('Tab removed successfully');
    }, [descriptions]);

    const handleEditPlugin = useCallback((plugin: Plugin) => {
        // TODO: Implement edit functionality
        toast.info('Edit functionality coming soon');
    }, []);

    const handleToggleActive = useCallback((plugin: Plugin) => {
        setActivePluginId(plugin.id);
        // TODO: Implement activate/deactivate functionality
        setTimeout(() => {
            setActivePluginId(undefined);
            toast.success(`Plugin ${plugin.status.code === 'ACTIVE' ? 'deactivated' : 'activated'} successfully`);
        }, 1000);
    }, []);

    const handleDeletePlugin = useCallback((plugin: Plugin) => {
        setPluginToDelete(plugin);
        setDeleteDialogOpen(true);
    }, []);

    const confirmDelete = useCallback(() => {
        if (!pluginToDelete) return;

        // TODO: Implement delete API call
        toast.success(`Plugin "${pluginToDelete.name}" deleted successfully`);
        setDeleteDialogOpen(false);
        setPluginToDelete(undefined);
    }, [pluginToDelete]);

    const publish = useCallback(() => {
        if (!file) {
            toast.error('Please upload a plugin file');
            return;
        }

        if (!currentPlugin) {
            toast.error('No plugin selected');
            return;
        }

        setPublishing(true);
        useApi(APIS.CREATE_PLUGIN, null, {
            id: currentPlugin.id,
            resourcePath: file?.name,
            publish: true,
            versionDescs: descriptions.map(item => ({
                label: item.label,
                content: JSON.stringify(item.content),
            }))
        })
            .then(() => {
                toast.success('Plugin published successfully');
                setOpen(false);
                setFile(undefined);
            })
            .catch(error => {
                console.error('Failed to publish plugin:', error);
                toast.error('Failed to publish plugin');
            })
            .finally(() => {
                setPublishing(false);
            });
    }, [currentPlugin, file, descriptions])
    return <div className="w-full h-full flex flex-col px-2">
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
            <Input
                icon={<SearchIcon className="h-4 w-4" />}
                placeholder="Search plugins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-0"
            />
            <PluginUploader>
                <Button size="sm" variant="ghost" className="flex-shrink-0">
                    <PlusIcon className="h-4 w-4 mr-2" />
                    New Plugin
                </Button>
            </PluginUploader>
        </div>

        <div className="flex-1 overflow-auto space-y-1 min-h-0">
            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : filteredPlugins.length === 0 ? (
                <EmptyState
                    title={searchQuery ? "No plugins found" : "No plugins yet"}
                    description={searchQuery ? "Try adjusting your search terms" : "Create your first plugin to get started"}
                    icons={[BoxIcon]}
                    className="border-none"
                />
            ) : (
                filteredPlugins.map((item, index) => {
                    const isActivating = activePluginId === item.id;
                    const isActive = item.status.code === 'ACTIVE';

                    return (
                        <div
                            key={item.id || index}
                            className="px-2 py-2 bg-muted/50 hover:bg-muted transition-colors duration-200 rounded-sm flex items-center gap-2 group w-full overflow-hidden"
                        >
                            <Avatar className="h-9 w-9 shrink-0">
                                <img src={usePath(item.icon)} alt={item.name} />
                            </Avatar>
                            <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">{item.name}</span>
                                    <Badge
                                        className="h-5 shrink-0 text-xs"
                                        variant={isActive ? "default" : "secondary"}
                                    >
                                        {item.status.desc}
                                    </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {item.developer} / {item.maintainer}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                                <IconButton
                                    icon={<EditIcon className="h-4 w-4" />}
                                    onClick={() => handleEditPlugin(item)}
                                />
                                <IconButton
                                    icon={
                                        isActivating ? (
                                            <Loader2Icon className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <PowerIcon className={cn("h-4 w-4", isActive && "text-green-500")} />
                                        )
                                    }
                                    onClick={() => handleToggleActive(item)}
                                    disabled={isActivating}
                                />
                                <Button
                                    size="sm"
                                    variant="link"
                                    className="text-xs px-2 h-7"
                                    onClick={() => {
                                        if (currentId === item.id) {
                                            setOpen(true);
                                        } else {
                                            setCurrentId(item.id);
                                        }
                                    }}
                                >
                                    Publish
                                </Button>
                            </div>
                        </div>
                    );
                })
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
                            Publish New Version
                        </div>
                    </div>
                </DialogTitle>
                <DialogDescription />

                <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Developer</Label>
                            <Input value={currentPlugin?.developer || ''} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label>Maintainer</Label>
                            <Input value={currentPlugin?.maintainer || ''} disabled />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Upload Plugin File
                            <span className="text-xs text-muted-foreground">(Required)</span>
                        </Label>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    upload().then(res => {
                                        setFile(res);
                                        toast.success('File uploaded successfully');
                                    }).catch(() => {
                                        toast.error('Failed to upload file');
                                    });
                                }}
                                disabled={loading}
                            >
                                <UploadIcon className="h-4 w-4 mr-2" />
                                Choose File
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
                        <Label>Version Description</Label>
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
                        Cancel
                    </Button>
                    <Button
                        onClick={publish}
                        disabled={publishing || !file}
                    >
                        {publishing ? (
                            <>
                                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                Publishing...
                            </>
                        ) : (
                            'Publish'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger />
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Plugin</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete "{pluginToDelete?.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setPluginToDelete(undefined)}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
}