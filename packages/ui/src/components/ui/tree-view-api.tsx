import { ScrollArea } from "@ui/components/ui/scroll-area";
import { cn } from "@ui/lib/utils";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown, ChevronRight } from "@kn/icon";
import React, {
    createContext,
    forwardRef,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
    memo,
    useMemo,
} from "react";
import { Button } from "@ui/components/ui/button";
import { EmptyProps } from "./empty";

type TreeViewElement = {
    id: string;
    name: ReactNode;
    isSelectable?: boolean;
    children?: TreeViewElement[];
    icon?: ReactNode;
    isGroup?: boolean;
    className?: string;
    onClick?: () => void;
    emptyProps?: EmptyProps,
    actions?: ReactNode[],
    customerRender?: ReactNode,
    height?: string
};
export type Size = 'default' | 'md' | 'sm'
type TreeContextProps = {
    selectedId: string | undefined;
    expendedItems: string[] | undefined;
    indicator: boolean;
    handleExpand: (id: string) => void;
    selectItem: (id: string) => void;
    setExpendedItems?: React.Dispatch<React.SetStateAction<string[] | undefined>>;
    openIcon?: React.ReactNode;
    closeIcon?: React.ReactNode;
    direction: "rtl" | "ltr";
    size?: Size;
    selectParent?: boolean;
    onTreeSelected?: (key: string) => void
};

const TreeContext = createContext<TreeContextProps | null>(null);

const useTree = () => {
    const context = useContext(TreeContext);
    if (!context) {
        throw new Error("useTree must be used within a TreeProvider");
    }
    return context;
};

interface TreeViewComponentProps extends React.HTMLAttributes<HTMLDivElement> { }

type Direction = "rtl" | "ltr" | undefined;

type TreeViewProps = {
    initialSelectedId?: string;
    indicator?: boolean;
    elements?: TreeViewElement[];
    initialExpendedItems?: string[];
    openIcon?: React.ReactNode;
    closeIcon?: React.ReactNode;
    size?: Size;
    selectParent?: boolean;
    onTreeSelected?: (key: string) => void;
    /** Imperative locate request: expand ancestors of `id` and scroll it into view. Bump `token` to re-trigger. */
    locateTarget?: { id: string; token: number } | null;
} & TreeViewComponentProps;


const getSize = (size?: Size) => {
    switch (size) {
        case 'default':
            return 'text-base'
        case 'md':
            return 'text-md'
        case 'sm':
            return 'text-sm'
        default:
            return 'text-base'
    }
}

/**
 * Tree Component - Core tree view implementation with context
 * 
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - useMemo for context value to prevent context re-creation
 * - useCallback for event handlers to maintain referential equality
 * - Optimized expand/collapse logic with state updates
 */
const Tree = memo(forwardRef<HTMLDivElement, TreeViewProps>(
    (
        {
            className,
            elements,
            initialSelectedId,
            initialExpendedItems,
            children,
            indicator = true,
            openIcon,
            closeIcon,
            size,
            selectParent = false,
            onTreeSelected,
            locateTarget,
            dir,
            ...props
        },
        ref
    ) => {
        const containerRef = React.useRef<HTMLDivElement | null>(null);
        const setRefs = useCallback((node: HTMLDivElement | null) => {
            containerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }, [ref]);
        const [selectedId, setSelectedId] = useState<string | undefined>(
            initialSelectedId
        );
        const [expendedItems, setExpendedItems] = useState<string[] | undefined>(
            initialExpendedItems
        );

        const selectItem = useCallback((id: string) => {
            setSelectedId(id);
        }, []);

        const handleExpand = useCallback((id: string) => {
            setExpendedItems((prev) => {
                if (prev?.includes(id)) {
                    return prev.filter((item) => item !== id);
                }
                return [...(prev ?? []), id];
            });
        }, []);

        const expandSpecificTargetedElements = useCallback(
            (elements?: TreeViewElement[], selectId?: string) => {
                if (!elements || !selectId) return;
                const findParent = (
                    currentElement: TreeViewElement,
                    currentPath: string[] = []
                ) => {
                    const isSelectable = currentElement.isSelectable ?? true;
                    const newPath = [...currentPath, currentElement.id];
                    if (currentElement.id === selectId) {
                        if (isSelectable) {
                            setSelectedId(selectId);
                            setExpendedItems((prev) => [...(prev ?? []), ...newPath]);
                        } else {
                            if (newPath.includes(currentElement.id)) {
                                newPath.pop();
                                setExpendedItems((prev) => [...(prev ?? []), ...newPath]);
                            }
                        }
                        return;
                    }
                    if (
                        isSelectable &&
                        currentElement.children &&
                        currentElement.children.length > 0
                    ) {
                        currentElement.children.forEach((child) => {
                            findParent(child, newPath);
                        });
                    }
                };
                elements.forEach((element) => {
                    findParent(element);
                });
            },
            []
        );

        useEffect(() => {
            if (initialSelectedId) {
                expandSpecificTargetedElements(elements, initialSelectedId);
            }
        }, [initialSelectedId, elements]);

        // Locate request: expand ancestors, then scroll the target node into view with a brief highlight
        useEffect(() => {
            if (!locateTarget?.id) return;
            expandSpecificTargetedElements(elements, locateTarget.id);
            setSelectedId(locateTarget.id);
            const timer = setTimeout(() => {
                const escaped = typeof CSS !== "undefined" && CSS.escape
                    ? CSS.escape(locateTarget.id)
                    : locateTarget.id.replace(/"/g, '\\"');
                const node = containerRef.current?.querySelector<HTMLElement>(
                    `[data-tree-item-id="${escaped}"]`
                );
                if (!node) return;
                node.scrollIntoView({ behavior: "smooth", block: "center" });
                node.classList.add("ring-1", "ring-primary/50", "bg-primary/10");
                setTimeout(() => {
                    node.classList.remove("ring-1", "ring-primary/50", "bg-primary/10");
                }, 1200);
            }, 250); // wait for accordion expand animation before scrolling
            return () => clearTimeout(timer);
        }, [locateTarget, elements, expandSpecificTargetedElements]);

        const direction: "rtl" | "ltr" = dir === "rtl" ? "rtl" : "ltr";

        // Memoize context value to prevent unnecessary re-renders of all tree children
        // This is critical for performance as context changes trigger re-renders in all consumers
        const contextValue = useMemo(() => ({
            selectedId,
            expendedItems,
            handleExpand,
            selectItem,
            setExpendedItems,
            indicator,
            openIcon,
            closeIcon,
            direction,
            size,
            selectParent,
            onTreeSelected
        }), [selectedId, expendedItems, handleExpand, selectItem, indicator, openIcon, closeIcon, direction, size, selectParent, onTreeSelected]);

        return (
            <TreeContext.Provider value={contextValue}>
                <div ref={setRefs} className={cn("w-full px-2 flex flex-col min-h-0", className)} dir={dir as Direction}>
                    <AccordionPrimitive.Root
                        {...props}
                        type="multiple"
                        defaultValue={expendedItems}
                        value={expendedItems}
                        className="flex flex-col gap-1 flex-1 min-h-0"
                        onValueChange={(value) =>
                            setExpendedItems((prev) => [...(prev ?? []), value[0]!])
                        }
                        dir={dir as Direction}
                    >
                        {children}
                    </AccordionPrimitive.Root>
                </div>
            </TreeContext.Provider>
        );
    }
));

Tree.displayName = "Tree";

const TreeIndicator = forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
    const { direction } = useTree();

    return (
        <div
            dir={direction}
            ref={ref}
            className={cn(
                "h-full w-px bg-muted absolute left-1.5 rtl:right-1.5 py-3 rounded-md hover:bg-slate-300 duration-300 ease-in-out",
                className
            )}
            {...props}
        />
    );
});

TreeIndicator.displayName = "TreeIndicator";

interface FolderComponentProps
    extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> { }

type FolderProps = {
    expendedItems?: string[];
    element: ReactNode;
    isSelectable?: boolean;
    isSelect?: boolean;
    icon?: ReactNode
    onClick?: () => void;
} & FolderComponentProps;

/**
 * Folder Component - Expandable/collapsible tree folder
 * 
 * Optimizations:
 * - React.memo to prevent re-renders when props haven't changed
 * - useCallback for click handlers to maintain stable references
 * - Computed isExpanded and isSelected to avoid recalculation
 */
const Folder = memo(forwardRef<
    HTMLDivElement,
    FolderProps & React.HTMLAttributes<HTMLDivElement>
>(
    (
        {
            className,
            element,
            value,
            isSelectable = true,
            isSelect,
            children,
            icon,
            onClick,
            ...props
        },
        ref
    ) => {
        const {
            direction,
            handleExpand,
            expendedItems,
            indicator,
            setExpendedItems,
            selectedId,
            selectItem,
            openIcon,
            closeIcon,
            size,
            selectParent,
            onTreeSelected
        } = useTree();

        // Cache expansion and selection state to avoid recalculation
        const isExpanded = expendedItems?.includes(value);
        const isSelected = (isSelect || selectedId === value) && isSelectable;

        // Memoize click handler to maintain referential equality
        // Prevents unnecessary re-renders of child components
        const handleClick = useCallback(() => {
            onClick?.();
            selectItem(value);
            onTreeSelected?.(value);
        }, [onClick, selectItem, value, onTreeSelected]);

        // Memoize expand handler separately to prevent re-renders
        const handleExpandClick = useCallback((e: React.MouseEvent) => {
            e.stopPropagation();
            handleExpand(value);
        }, [handleExpand, value]);

        return (
            <AccordionPrimitive.Item
                {...props}
                value={value}
                className="relative h-full w-full min-w-0 overflow-hidden"
            >
                {
                    selectParent ? <div data-tree-item-id={value} className={cn(
                        `flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md text-base`,
                        getSize(size),
                        className,
                        {
                            "bg-muted rounded-md": isSelected,
                            "cursor-pointer": isSelectable,
                            "cursor-not-allowed opacity-50": !isSelectable,
                        },
                        " hover:bg-muted",
                    )}>
                        <span className="flex w-full min-w-0 flex-row items-center gap-3 overflow-hidden px-1 py-1" onClick={handleClick}>
                            <AccordionPrimitive.Trigger
                                disabled={!isSelectable}
                                onClick={handleExpandClick}
                            >
                                <div className="flex-shrink-0">
                                    {isExpanded
                                        ? openIcon ?? <ChevronDown className="h-4 w-4" />
                                        : closeIcon ?? <ChevronRight className="h-4 w-4" />}
                                </div>
                            </AccordionPrimitive.Trigger>
                            <div className="flex w-0 min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                {icon}
                                <span
                                    className="w-0 min-w-0 flex-1 truncate"
                                    title={typeof element === "string" ? element : undefined}
                                >
                                    {element}
                                </span>
                            </div>
                        </span>
                    </div> : (
                        <AccordionPrimitive.Trigger
                            data-tree-item-id={value}
                            className={cn(
                                `relative flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md px-1 py-1 text-base`,
                                getSize(size),
                                className,
                                {
                                    "bg-muted rounded-md": isSelected,
                                    "cursor-pointer": isSelectable,
                                    "cursor-not-allowed opacity-50": !isSelectable,
                                },
                                " hover:bg-muted",
                            )}
                            disabled={!isSelectable}
                            onClick={() => {
                                handleExpand(value)
                                // selectItem(value)
                                // onTreeSelected && onTreeSelected(value)
                            }}
                        >
                            <span className="flex w-0 min-w-0 flex-1 flex-row items-center gap-3 overflow-hidden">
                                {icon}
                                <span
                                    className="w-0 min-w-0 flex-1 truncate"
                                    title={typeof element === "string" ? element : undefined}
                                >
                                    {element}
                                </span>
                            </span>
                            <div className="flex-shrink-0">
                                {isExpanded
                                    ? openIcon ?? <ChevronDown className="h-4 w-4" />
                                    : closeIcon ?? <ChevronRight className="h-4 w-4" />}
                            </div>
                        </AccordionPrimitive.Trigger>
                    )
                }
                <AccordionPrimitive.Content className={cn("data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down relative overflow-hidden h-full", getSize(size))}>
                    {element && indicator && <TreeIndicator aria-hidden="true" />}
                    <AccordionPrimitive.Root
                        dir={direction}
                        type="multiple"
                        className="ml-5 flex min-w-0 flex-col gap-1 overflow-hidden py-1 rtl:mr-5"
                        defaultValue={expendedItems}
                        value={expendedItems}
                        onValueChange={(value) => {
                            setExpendedItems?.((prev) => [...(prev ?? []), value[0]!]);
                        }}
                    >
                        {children}
                    </AccordionPrimitive.Root>
                </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
        );
    }
));

Folder.displayName = "Folder";

/**
 * File Component - Tree leaf node (non-expandable)
 * 
 * Optimizations:
 * - React.memo to prevent re-renders
 * - useCallback for click handler
 * - Computed isSelected state
 */
const File = memo(forwardRef<
    HTMLButtonElement,
    {
        value: string;
        handleSelect?: (id: string) => void;
        isSelectable?: boolean;
        isSelect?: boolean;
        fileIcon?: React.ReactNode;
        onClick?: () => void;
    } & React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(
    (
        {
            value,
            className,
            handleSelect,
            isSelectable = true,
            isSelect,
            fileIcon,
            children,
            onClick,
            ...props
        },
        ref
    ) => {
        const { direction, selectedId, selectItem, size, onTreeSelected } = useTree();
        // Cache selection state
        const isSelected = isSelect ?? selectedId === value;

        // Memoize click handler to prevent unnecessary re-renders
        const handleClick = useCallback(() => {
            onClick?.();
            selectItem(value);
            onTreeSelected?.(value);
        }, [onClick, selectItem, value, onTreeSelected]);

        return (
            <AccordionPrimitive.Item value={value} className="relative w-full min-w-0 overflow-hidden">
                <AccordionPrimitive.Trigger
                    ref={ref}
                    // {...props}
                    data-tree-item-id={value}
                    dir={direction}
                    disabled={!isSelectable}
                    aria-label="File"
                    className={cn(
                        "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-1 py-1 duration-200 ease-in-out rtl:pl-1 rtl:pr-0",
                        getSize(size),
                        {
                            "bg-muted": isSelected && isSelectable,
                        },
                        " hover:bg-muted",
                        isSelectable ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
                        className
                    )}
                    onClick={handleClick}
                >
                    {fileIcon}
                    {children}
                </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Item>
        );
    }
));

File.displayName = "File";

const CollapseButton = forwardRef<
    HTMLButtonElement,
    {
        elements: TreeViewElement[];
        expandAll?: boolean;
    } & React.HTMLAttributes<HTMLButtonElement>
>(({ className, elements, expandAll = false, children, ...props }, ref) => {
    const { expendedItems, setExpendedItems } = useTree();

    const expendAllTree = useCallback((elements: TreeViewElement[]) => {
        const expandTree = (element: TreeViewElement) => {
            const isSelectable = element.isSelectable ?? true;
            if (isSelectable && element.children && element.children.length > 0) {
                setExpendedItems?.((prev) => [...(prev ?? []), element.id]);
                element.children.forEach(expandTree);
            }
        };

        elements.forEach(expandTree);
    }, []);

    const closeAll = useCallback(() => {
        setExpendedItems?.([]);
    }, []);

    useEffect(() => {
        if (expandAll) {
            expendAllTree(elements);
        }
    }, [expandAll]);

    return (
        <Button
            variant={"ghost"}
            className="h-8 w-fit p-1 absolute bottom-1 right-2"
            onClick={
                expendedItems && expendedItems.length > 0
                    ? closeAll
                    : () => expendAllTree(elements)
            }
            ref={ref}
            {...props}
        >
            {children}
            <span className="sr-only">Toggle</span>
        </Button>
    );
});

CollapseButton.displayName = "CollapseButton";

/**
 * TreeItemGroup Component - Group header with optional actions and scrollable content
 * 
 * Optimizations:
 * - React.memo to prevent re-renders
 * - useMemo for conditional scroll area rendering
 */
const TreeItemGroup: React.FC<any> = memo((props) => {
    const hasHeight = props.height !== undefined;
    const contentWrapperClass = hasHeight
        ? "overflow-y-auto overflow-x-hidden"
        : "";
    const contentStyle = hasHeight
        ? { maxHeight: props.height }
        : {};

    return <div className={cn(props.className || "", "flex flex-col min-h-0")}>
        <div className={`px-1 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex justify-between items-center flex-shrink-0`}>
            <div>
                {props.name}
            </div>
            <div>
                {props.actions}
            </div>
        </div>
        <div className={cn(contentWrapperClass, "flex-1 min-h-0")} style={contentStyle}>
            {props.children}
        </div>
    </div>
});
TreeItemGroup.displayName = "TreeItemGroup"
export { Tree, Folder, File, CollapseButton, TreeItemGroup, type TreeViewElement };
