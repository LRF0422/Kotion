import { cn } from "@ui/lib/utils";
import React, { forwardRef, ReactNode, useCallback, useRef } from "react";

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

export const TreeView = ({
    elements,
    className,
    initialSelectedId,
    initialExpendedItems,
    expandAll,
    selectParent = false,
    indicator = false,
    onTreeSelected,
    size
}: TreeViewProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

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
                {elements.map((element: any) => (
                    <TreeItem
                        aria-label="Root"
                        key={element.key}
                        elements={[element]}
                        indicator={indicator}
                    />
                ))}
                {/* <CollapseButton elements={elements} expandAll={expandAll}>
                    <span>Expand All</span>
                </CollapseButton> */}
            </Tree>
        </div>
    );
};

TreeView.displayName = "TreeView";

export const TreeItem = forwardRef<
    HTMLUListElement,
    {
        elements?: TreeViewElement[];
        indicator?: boolean;
    } & React.HTMLAttributes<HTMLUListElement>
>(({ className, elements, indicator, ...props }, ref) => {
    return (
        <ul ref={ref} className="w-full space-y-1" {...props}>
            {elements &&
                elements.map((element: TreeViewElement) => (
                    <li key={element.id} className="w-full block">
                        {element.children && element.children?.length > 0 ? (
                            element.isGroup ? <TreeItemGroup name={element.name} key={element.id} actions={element.actions} height={element.height}>
                                <TreeItem
                                    // key={element.id}
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
                                <TreeItemGroup name={element.name} key={element.id} actions={element.actions} height={element.height}>
                                    {
                                        (element.children && element.children.length > 0) ? <TreeItem
                                            // key={element.id}
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
                                        <span>{element?.name}</span>
                                    </File>
                        )}
                    </li>
                ))}
        </ul>
    );
});

TreeItem.displayName = "TreeItem";
