import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button, Input } from "@kn/ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@kn/ui";
import {
    Plus,
    MoreVertical,
    Settings,
    Trash2,
    Table2,
    Calendar,
    KanbanSquare,
    ImageIcon,
    GanttChartSquare,
    BarChart3,
    Upload,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Search,
    Zap,
    EyeOff,
    Pencil,
    Check,
    X,
    MoreHorizontal,
    Download,
    FileText,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { ViewType, ViewConfig } from "../../types";
import { getViewIcon } from "../utils/viewUtils";
import { SortPanel } from "./SortPanel";
import { FilterPanel } from "./FilterPanel";
import { GroupPanel } from "./GroupPanel";

export interface BitableToolbarProps {
    views: ViewConfig[];
    currentViewId: string;
    onSelectView: (viewId: string) => void;
    editorEditable: boolean;
    /** View-tab editing helpers */
    editingViewId: string | null;
    editingViewName: string;
    onStartEditingView: (viewId: string, name: string) => void;
    onSaveViewName: () => void;
    onCancelEditingView: () => void;
    onEditingViewNameChange: (name: string) => void;
    onOpenDeleteDialog: (viewId: string) => void;
    /** Add-view */
    onAddView: (type: ViewType) => void;
    /** Actions */
    onAddRecord: () => void;
    onExport: (fmt: "csv" | "excel") => void;
    onOpenFieldConfig: () => void;
    onOpenExcelImport: () => void;
    onDeleteNode: () => void;
    /** Current view for sort/filter/group panels */
    currentView: ViewConfig;
    fields: any[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    /** Search */
    searchText: string;
    onSearchChange: (text: string) => void;
}

export const BitableToolbar: React.FC<BitableToolbarProps> = (props) => {
    const {
        views,
        currentViewId,
        editorEditable,
        editingViewId,
        editingViewName,
        onStartEditingView,
        onSaveViewName,
        onCancelEditingView,
        onEditingViewNameChange,
        onOpenDeleteDialog,
        onAddView,
        onAddRecord,
        onExport,
        onOpenFieldConfig,
        onOpenExcelImport,
        onDeleteNode,
        currentView,
        fields,
        onUpdateView,
        searchText,
        onSearchChange,
    } = props;

    const { t } = useTranslation();
    const [showSearch, setShowSearch] = useState(false);

    // View-tab scroll state
    const viewTabsRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScrollState = useCallback(() => {
        const container = viewTabsRef.current;
        if (container) {
            setCanScrollLeft(container.scrollLeft > 0);
            setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
        }
    }, []);

    useEffect(() => {
        checkScrollState();
        const container = viewTabsRef.current;
        if (container) {
            container.addEventListener("scroll", checkScrollState);
            const resizeObserver = new ResizeObserver(checkScrollState);
            resizeObserver.observe(container);
            return () => {
                container.removeEventListener("scroll", checkScrollState);
                resizeObserver.disconnect();
            };
        }
    }, [checkScrollState, views.length]);

    const scrollViewTabs = useCallback((direction: "left" | "right") => {
        const container = viewTabsRef.current;
        if (container) {
            container.scrollBy({ left: direction === "left" ? -150 : 150, behavior: "smooth" });
        }
    }, []);

    return (
        <>
            <div className="flex items-center justify-between gap-1 pl-2 pr-2 py-1.5 md:pr-4 md:py-2 border-b border-gray-200 dark:border-border">
                {/* Left: view tabs */}
                <div className="flex items-center gap-1 min-w-0">
                    {canScrollLeft && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={() => scrollViewTabs("left")}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    )}

                    <div
                        ref={viewTabsRef}
                        className="flex items-center gap-1 overflow-x-auto scrollbar-none"
                        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    >
                        {views.map((view) => (
                            <div
                                key={view.id}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-all whitespace-nowrap flex-shrink-0 text-sm ${
                                    currentViewId === view.id
                                        ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#ffffff08]"
                                }`}
                                onClick={() => {
                                    if (editingViewId !== view.id) {
                                        props.onSelectView(view.id);
                                    }
                                }}
                                onDoubleClick={() => {
                                    if (editorEditable && currentViewId === view.id) {
                                        onStartEditingView(view.id, view.name);
                                    }
                                }}
                            >
                                {getViewIcon(view.type)}
                                {editingViewId === view.id ? (
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                            value={editingViewName}
                                            onChange={(e) => onEditingViewNameChange(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") onSaveViewName();
                                                else if (e.key === "Escape") onCancelEditingView();
                                            }}
                                            onBlur={onSaveViewName}
                                            autoFocus
                                            className="h-6 w-32 px-2 text-sm"
                                        />
                                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onSaveViewName}>
                                            <Check className="h-3 w-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onCancelEditingView}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <span>{view.name}</span>
                                )}
                                {editorEditable && currentViewId === view.id && editingViewId !== view.id && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <MoreVertical className="h-3 w-3 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => onStartEditingView(view.id, view.name)}>
                                                <Pencil className="h-4 w-4 mr-2" />
                                                {t("bitable.actions.renameView")}
                                            </DropdownMenuItem>
                                            {views.length > 1 && (
                                                <DropdownMenuItem
                                                    onClick={() => onOpenDeleteDialog(view.id)}
                                                    className="text-red-600 dark:text-red-400"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    {t("bitable.actions.deleteView")}
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        ))}

                        {editorEditable && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuLabel>{t("bitable.actions.addView")}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.TABLE)}>
                                        <Table2 className="h-4 w-4 mr-2" />
                                        {t("bitable.views.table")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.KANBAN)}>
                                        <KanbanSquare className="h-4 w-4 mr-2" />
                                        {t("bitable.views.kanban")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.GALLERY)}>
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        {t("bitable.views.gallery")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.TIMELINE)}>
                                        <GanttChartSquare className="h-4 w-4 mr-2" />
                                        {t("bitable.views.timeline")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.CALENDAR)}>
                                        <Calendar className="h-4 w-4 mr-2" />
                                        {t("bitable.views.calendar")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.CHART)}>
                                        <BarChart3 className="h-4 w-4 mr-2" />
                                        {t("bitable.views.chart")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddView(ViewType.FORM)}>
                                        <FileText className="h-4 w-4 mr-2" />
                                        {t("bitable.views.form", "Form")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {canScrollRight && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={() => scrollViewTabs("right")}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                        onClick={onOpenFieldConfig}
                    >
                        <EyeOff className="h-4 w-4" />
                    </Button>

                    <GroupPanel view={currentView} fields={fields} onUpdateView={onUpdateView} />
                    <SortPanel view={currentView} fields={fields} onUpdateView={onUpdateView} />
                    <FilterPanel view={currentView} fields={fields} onUpdateView={onUpdateView} />

                    <Button
                        size="icon"
                        variant="ghost"
                        className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50"
                        title={t("bitable.actions.comingSoon")}
                        disabled
                    >
                        <Zap className="h-4 w-4" />
                    </Button>

                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 md:h-8 md:w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                        onClick={() => setShowSearch(!showSearch)}
                    >
                        <Search className="h-4 w-4" />
                    </Button>

                    <Button
                        size="icon"
                        variant="ghost"
                        className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                        onClick={onOpenFieldConfig}
                    >
                        <Settings className="h-4 w-4" />
                    </Button>

                    {editorEditable && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={onOpenExcelImport}
                        >
                            <Upload className="h-4 w-4" />
                        </Button>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onExport("csv")}>
                                {t("bitable.actions.exportCsv", "Export as CSV")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onExport("excel")}>
                                {t("bitable.actions.exportExcel", "Export as Excel")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {editorEditable && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="sm"
                                    className="ml-1 md:ml-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 md:px-3 h-9 md:h-8"
                                >
                                    <Plus className="h-4 w-4 md:hidden" />
                                    <span className="hidden md:inline">{t("bitable.actions.new")}</span>
                                    <ChevronDown className="hidden md:inline-block h-4 w-4 ml-1" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={onAddRecord}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    {t("bitable.actions.addRecord")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {editorEditable && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={onDeleteNode}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}

                    {/* Mobile "more" menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="md:hidden h-9 w-9 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onOpenFieldConfig}>
                                <Settings className="h-4 w-4 mr-2" />
                                {t("bitable.actions.fieldSettings")}
                            </DropdownMenuItem>
                            {editorEditable && (
                                <DropdownMenuItem onClick={onOpenExcelImport}>
                                    <Upload className="h-4 w-4 mr-2" />
                                    {t("bitable.actions.importExcel")}
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onExport("csv")}>
                                <Download className="h-4 w-4 mr-2" />
                                {t("bitable.actions.exportCsv", "Export as CSV")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onExport("excel")}>
                                <Download className="h-4 w-4 mr-2" />
                                {t("bitable.actions.exportExcel", "Export as Excel")}
                            </DropdownMenuItem>
                            {editorEditable && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onDeleteNode} className="text-red-600 dark:text-red-400">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        {t("bitable.actions.deleteTable")}
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Search bar */}
            {showSearch && (
                <div className="pl-2 pr-2 py-2 md:pr-4 border-b border-gray-200 dark:border-border">
                    <Input
                        className="w-full md:w-64 h-9 md:h-8"
                        placeholder={t("bitable.search.placeholder") || "Search..."}
                        value={searchText}
                        onChange={(e) => onSearchChange(e.target.value)}
                        autoFocus
                    />
                </div>
            )}
        </>
    );
};
