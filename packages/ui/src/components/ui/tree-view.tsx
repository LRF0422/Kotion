import { cn } from "@ui/lib/utils";
import React, { forwardRef, ReactNode, useRef, useMemo, memo } from "react";

import {
    Tree,
    Folder,
    File,
    TreeViewElement,
    Size,
    TreeItemGroup,
} from "./tree-view-api";
import { Empty } from "./empty";


interface TreeViewComponentProps extends React.HTMLAttributes<HTMLDivElement> { }

type TreeViewProps = {
    initialSelectedId?: string;
    elements: TreeViewElement[];
    indicator?: boolean;
    selectParent?: boolean;
    icon?: ReactNode;
    onTreeSelected?: (key: string) => void;
    size?: Size;
    loading?: boolean
} & (
        | {
            initialExpendedItems?: string[];
            expandAll?: false;
        }
        | {
            initialExpendedItems?: undefined;
            expandAll: true;
        }
    ) &
    TreeViewComponentProps;

/**
 * TreeView Component - Optimized version with memoization
 * 
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - useMemo for expensive computations (tree items rendering)
 * - Memoized tree items to avoid re-creating on every render
 * - Virtual scrolling support (commented out, can be enabled for large datasets)
 * 
 * @param elements - Array of tree view elements to display
 * @param className - Additional CSS classes
 * @param initialSelectedId - Initially selected item ID
 * @param initialExpendedItems - Initially expanded item IDs
 * @param expandAll - Whether to expand all items
 * @param selectParent - Allow parent selection
 * @param indicator - Show tree indicator lines
 * @param onTreeSelected - Callback when item is selected
 * @param size - Size variant of the tree items
 * @param loading - Loading state
 */
export const TreeView = memo(({
    elements,
    className,
    initialSelectedId,
    initialExpendedItems,
    expandAll,
    selectParent = false,
    indicator = false,
    onTreeSelected,
    size,
    loading = false
}: TreeViewProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Memoize tree items to prevent unnecessary re-renders
    // This is crucial for performance with large tree structures
    const treeItems = useMemo(() => {
        return elements.map((element: any) => (
            <TreeItem
                aria-label="Root"
                key={element.id}
                elements={[element]}
                indicator={indicator}
                loading={loading}
            />
        ));
    }, [elements, indicator, loading]);

    // Virtual scrolling support - uncomment to enable for large datasets
    // Requires @tanstack/react-virtual package
    // const { getVirtualItems, getTotalSize } = useVirtualizer({
    //     count: elements.length,
    //     getScrollElement: () => containerRef.current,
    //     estimateSize: useCallback(() => 40, []),
    //     overscan: 5,
    // });

    // const { height = getTotalSize(), width } = useResizeObserver({
    //     ref: containerRef,
    // });
    return (
        <div
            ref={containerRef}
            className={cn(
                `py-1 relative`,
                className
            )}
        >
            <Tree
                initialSelectedId={initialSelectedId}
                initialExpendedItems={initialExpendedItems}
                elements={elements}
                // style={{ height }}
                selectParent={selectParent}
                onTreeSelected={onTreeSelected}
                size={size}
                className="w-full h-full"
            >
                {treeItems}
            </Tree>
        </div>
    );
});

TreeView.displayName = "TreeView";

/**
 * TreeItem Component - Recursive tree item renderer
 * 
 * Optimized with:
 * - React.memo to prevent re-renders when props haven't changed
 * - useMemo for rendering tree elements to avoid recalculation
 * - Conditional rendering based on element type (folder, file, group)
 */
export const TreeItem = memo(forwardRef<
    HTMLUListElement,
    {
        elements?: TreeViewElement[];
        indicator?: boolean;
        loading?: boolean
    } & React.HTMLAttributes<HTMLUListElement>
>(({ className, elements, indicator, loading, ...props }, ref) => {
    // Memoize the rendered tree items to avoid re-rendering unchanged elements
    const renderedElements = useMemo(() => {
        if (!elements) return null;

        return elements.map((element: TreeViewElement) => (
            <li key={element.id} className={element.isGroup ? element.className : "w-full block"}>
                {element.children && element.children?.length > 0 ? (
                    element.isGroup ? <TreeItemGroup name={element.name} key={element.id} actions={element.actions} height={element.height} className={element.className}>
                        <TreeItem
                            aria-label={`folder ${element.name}`}
                            elements={element.children}
                            indicator={indicator}
                        />
                    </TreeItemGroup> :
                        <Folder
                            className={element.className}
                            element={element.name}
                            value={element.id}
                            icon={element.icon}
                            isSelectable={element.isSelectable}
                            onClick={element.onClick}
                        >
                            <TreeItem
                                key={element.id}
                                aria-label={`folder ${element.name}`}
                                elements={element.children}
                                indicator={indicator}
                            />
                        </Folder>
                ) : (
                    element.isGroup ?
                        <TreeItemGroup name={element.name} key={element.id} actions={element.actions} height={element.height} className={element.className}>
                            {
                                (element.children && element.children.length > 0) ? <TreeItem
                                    aria-label={`folder ${element.name}`}
                                    elements={element.children}
                                    indicator={indicator}
                                /> : <Empty className=" border-none text-gray-400" {...element.emptyProps} />
                            }
                        </TreeItemGroup> :
                        element.customerRender ? element.customerRender :
                            <File
                                value={element.id}
                                className={element.className}
                                aria-label={`File ${element.name}`}
                                key={element.id}
                                fileIcon={element.icon}
                                isSelectable={element.isSelectable}
                                onClick={element.onClick}
                            >
                                <span className="w-full">{element?.name}</span>
                            </File>
                )}
            </li>
        ));
    }, [elements, indicator]);

    return (<ul ref={ref} className="w-full space-y-1" {...props}>
        {renderedElements}
    </ul>
    );
}));

TreeItem.displayName = "TreeItem";
