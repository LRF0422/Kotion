import React, { useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@kn/ui";
import { ScrollArea } from "@kn/ui";
import { Input } from "@kn/ui";
import { TreeView } from "@kn/ui";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@kn/ui";
import {
    FileText,
    FolderOpen,
    ArrowRightLeft,
    Search,
    Loader2,
    Move,
} from "@kn/icon";
import { SettingContext } from "..";
import { useApi } from "@kn/core";
import { APIS } from "../../../../api";
import { toast } from "@kn/ui";
import { useTranslation } from "@kn/common";

interface PageTreeNode {
    id: string;
    name: string;
    icon?: any;
    parentId?: string;
    children?: PageTreeNode[];
    isDraft?: boolean;
}

export const PageManagement: React.FC = () => {
    const { space, spaceId } = useContext(SettingContext);
    const { t } = useTranslation();
    const [pageTree, setPageTree] = useState<PageTreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchValue, setSearchValue] = useState("");
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [movingPage, setMovingPage] = useState<PageTreeNode | null>(null);
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isMoving, setIsMoving] = useState(false);
    const [targetSearchValue, setTargetSearchValue] = useState("");

    // Fetch page tree
    useEffect(() => {
        if (!spaceId) return;
        setLoading(true);
        useApi(APIS.GET_PAGE_TREE, { id: spaceId, searchValue })
            .then((res: any) => {
                setPageTree(res.data || []);
            })
            .catch(() => {
                toast.error(t("space-settings.page.load_error", { defaultValue: "Failed to load page tree" }));
            })
            .finally(() => {
                setLoading(false);
            });
    }, [spaceId, searchValue]);

    // Open move dialog
    const handleOpenMoveDialog = useCallback((page: PageTreeNode) => {
        setMovingPage(page);
        setSelectedTargetId(null);
        setTargetSearchValue("");
        setMoveDialogOpen(true);
    }, []);

    // Execute move
    const handleMovePage = useCallback(async () => {
        if (!movingPage || !spaceId) return;

        setIsMoving(true);
        try {
            await useApi(APIS.MOVE_PAGE, { id: movingPage.id }, {
                targetParentId: selectedTargetId ? Number(selectedTargetId) : null,
                targetSpaceId: Number(spaceId),
            });

            toast.success(
                t("space-settings.page.move_success", { defaultValue: "Page moved successfully" })
            );
            setMoveDialogOpen(false);
            setMovingPage(null);
            setSelectedTargetId(null);
            // Refresh tree
            setLoading(true);
            useApi(APIS.GET_PAGE_TREE, { id: spaceId })
                .then((res: any) => setPageTree(res.data || []))
                .finally(() => setLoading(false));
        } catch {
            toast.error(
                t("space-settings.page.move_error", { defaultValue: "Failed to move page" })
            );
        } finally {
            setIsMoving(false);
        }
    }, [movingPage, selectedTargetId, spaceId, t]);

    // Filtered flat list for move target selection
    const targetOptions = useMemo(() => {
        const flattenTree = (nodes: PageTreeNode[], depth: number = 0, excludeId?: string): Array<PageTreeNode & { depth: number }> => {
            const result: Array<PageTreeNode & { depth: number }> = [];
            for (const node of nodes) {
                if (excludeId && node.id === excludeId) continue;
                result.push({ ...node, depth });
                if (node.children) {
                    result.push(...flattenTree(node.children, depth + 1, excludeId));
                }
            }
            return result;
        };
        if (!movingPage) return [];
        const flat = flattenTree(pageTree, 0, movingPage.id);
        if (!targetSearchValue) return flat;
        return flat.filter((item) =>
            item.name.toLowerCase().includes(targetSearchValue.toLowerCase())
        );
    }, [pageTree, movingPage, targetSearchValue]);

    // Convert tree data to TreeView elements with move actions
    const treeElements = useMemo(() => {
        const resolve = (treeNode: PageTreeNode): any => {
            const name = (
                <div className="flex flex-row gap-1.5 items-center group w-full overflow-hidden relative">
                    <span className="text-xs flex-shrink-0">
                        {treeNode.icon?.icon || <FileText className="h-3 w-3 text-muted-foreground" />}
                    </span>
                    <span className="text-xs truncate flex-1">{treeNode.name}</span>
                    <Button
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleOpenMoveDialog(treeNode);
                        }}
                        title={t("space-settings.page.move_title", { defaultValue: "Move Page" })}
                    >
                        <Move className="h-2.5 w-2.5" />
                    </Button>
                </div>
            );

            const base = {
                icon: null,
                name,
                key: treeNode.id,
                id: treeNode.id,
            };

            if (treeNode.children && treeNode.children.length > 0) {
                return {
                    ...base,
                    children: treeNode.children.map(resolve),
                };
            }
            return base;
        };
        return pageTree.map(resolve);
    }, [pageTree, handleOpenMoveDialog, t]);

    // Build TreeView elements for the move dialog target selection
    const moveTargetElements = useMemo(() => {
        const filterTree = (nodes: PageTreeNode[], excludeId: string): PageTreeNode[] => {
            return nodes
                .filter((n) => n.id !== excludeId)
                .map((n) => ({
                    ...n,
                    children: n.children ? filterTree(n.children, excludeId) : undefined,
                }));
        };

        const filteredTree = movingPage ? filterTree(pageTree, movingPage.id) : pageTree;

        const resolve = (treeNode: PageTreeNode): any => {
            const name = (
                <div className="flex flex-row gap-1.5 items-center w-full overflow-hidden">
                    <span className="text-xs flex-shrink-0">
                        {treeNode.icon?.icon || <FolderOpen className="h-3 w-3 text-muted-foreground" />}
                    </span>
                    <span className="text-xs truncate">{treeNode.name}</span>
                </div>
            );

            const base = {
                icon: null,
                name,
                key: treeNode.id,
                id: treeNode.id,
            };

            if (treeNode.children && treeNode.children.length > 0) {
                return {
                    ...base,
                    children: treeNode.children.map(resolve),
                };
            }
            return base;
        };
        return filteredTree.map(resolve);
    }, [pageTree, movingPage]);

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t("space-settings.page.management_title", { defaultValue: "Page Management" })}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t("space-settings.page.management_description", {
                        defaultValue: "Manage and organize pages in this space. Move pages to reorder the structure.",
                    })}
                </p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder={t("space-settings.page.search_placeholder", { defaultValue: "Search pages..." })}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="pl-8 max-w-md"
                />
            </div>

            {/* Page Tree */}
            <div className="border rounded-lg bg-card">
                <div className="px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                            {t("space-settings.page.tree_title", { defaultValue: "Page Structure" })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {pageTree.length} {t("space-settings.page.pages_count", { defaultValue: "pages" })}
                        </span>
                    </div>
                </div>
                <ScrollArea className="h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : pageTree.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <p className="text-sm text-muted-foreground">
                                {t("space-settings.page.empty", { defaultValue: "No pages in this space" })}
                            </p>
                        </div>
                    ) : (
                        <div className="p-2">
                            <TreeView
                                expandAll
                                size="sm"
                                selectParent
                                elements={treeElements}
                            />
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Move Dialog */}
            <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            {t("space-settings.page.move_title", { defaultValue: "Move Page" })}
                        </DialogTitle>
                        <DialogDescription>
                            {t("space-settings.page.move_description", {
                                name: movingPage?.name || "",
                                defaultValue: `Select a new parent for "${movingPage?.name || ""}"`,
                            })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Current page info */}
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium truncate">
                                {movingPage?.icon?.icon && (
                                    <span className="mr-1">{movingPage.icon.icon}</span>
                                )}
                                {movingPage?.name}
                            </span>
                            <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-auto" />
                        </div>

                        {/* Search target */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder={t("space-settings.page.move_search", { defaultValue: "Search target page..." })}
                                value={targetSearchValue}
                                onChange={(e) => setTargetSearchValue(e.target.value)}
                                className="pl-8 h-8 text-sm"
                            />
                        </div>

                        {/* Target selection tree */}
                        <div className="border rounded-lg max-h-[280px] overflow-auto">
                            {/* Root option */}
                            <div
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b ${selectedTargetId === null
                                        ? "bg-primary/10 text-primary"
                                        : ""
                                    }`}
                                onClick={() => setSelectedTargetId(null)}
                            >
                                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                                <span className="text-sm font-medium">
                                    {t("space-settings.page.move_to_root", { defaultValue: "Space root (top level)" })}
                                </span>
                                {selectedTargetId === null && (
                                    <span className="ml-auto text-xs text-primary">✓</span>
                                )}
                            </div>

                            {/* Tree for target selection */}
                            <div className="p-1">
                                <TreeView
                                    expandAll
                                    size="sm"
                                    selectParent
                                    elements={moveTargetElements}
                                    onTreeSelected={(key) => setSelectedTargetId(key)}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setMoveDialogOpen(false)}
                            disabled={isMoving}
                        >
                            {t("space-settings.page.move_cancel", { defaultValue: "Cancel" })}
                        </Button>
                        <Button onClick={handleMovePage} disabled={isMoving}>
                            {isMoving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {t("space-settings.page.move_confirm", { defaultValue: "Move" })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
