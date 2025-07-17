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
    height?: number
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
    onTreeSelected?: (key: string) => void
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

const Tree = forwardRef<HTMLDivElement, TreeViewProps>(
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
            dir,
            ...props
        },
        ref
    ) => {
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

        const direction = dir === "rtl" ? "rtl" : "ltr";

        return (
            <TreeContext.Provider
                value={{
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
                }}
            >
                <div className={cn("size-full", className)}>
                    <ScrollArea
                        ref={ref}
                        className="h-full relative px-2"
                        dir={dir as Direction}
                    >
                        <AccordionPrimitive.Root
                            {...props}
                            type="multiple"
                            defaultValue={expendedItems}
                            value={expendedItems}
                            className="flex flex-col gap-1"
                            onValueChange={(value) =>
                                setExpendedItems((prev) => [...(prev ?? []), value[0]!])
                            }
                            dir={dir as Direction}
                        >
                            {children}
                        </AccordionPrimitive.Root>
                    </ScrollArea>
                </div>
            </TreeContext.Provider>
        );
    }
);

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

const Folder = forwardRef<
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

        return (
            <AccordionPrimitive.Item
                {...props}
                value={value}
                className="relative overflow-hidden h-full"
            >
                {
                    selectParent ? <div className={cn(
                        `flex items-center gap-2 text-base rounded-md w-full`,
                        getSize(size),
                        className,
                        {
                            "bg-muted rounded-md": (isSelect || selectedId === value) && isSelectable,
                            "cursor-pointer": isSelectable,
                            "cursor-not-allowed opacity-50": !isSelectable,
                        },
                        " hover:bg-muted",
                    )}>
                        <span className="w-full truncate flex flex-row items-center gap-3 px-1 py-1" onClick={() => {
                            onClick && onClick()
                            selectItem(value)
                            onTreeSelected && onTreeSelected(value)
                        }}>
                            <AccordionPrimitive.Trigger
                                disabled={!isSelectable}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleExpand(value)
                                }}
                            >
                                <div className="">
                                    {expendedItems?.includes(value)
                                        ? openIcon ?? <ChevronDown className="h-4 w-4" />
                                        : closeIcon ?? <ChevronRight className="h-4 w-4" />}
                                </div>
                            </AccordionPrimitive.Trigger>
                            {icon}
                            {element}
                        </span>
                    </div> : (
                        <AccordionPrimitive.Trigger
                            className={cn(
                                `flex items-center gap-1 text-base rounded-md w-full px-1 py-1 relative`,
                                getSize(size),
                                className,
                                {
                                    "bg-muted rounded-md": (isSelect || selectedId === value) && isSelectable,
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
                            <span className="flex flex-row items-center gap-3 w-[100px]">{icon}{element}</span>
                            <div className=" absolute right-10">
                                {expendedItems?.includes(value)
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
                        className="flex flex-col gap-1 py-1 ml-5 rtl:mr-5 "
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
);

Folder.displayName = "Folder";

const File = forwardRef<
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
        const isSelected = isSelect ?? selectedId === value;
        return (
            <AccordionPrimitive.Item value={value} className="relative">
                <AccordionPrimitive.Trigger
                    ref={ref}
                    // {...props}
                    dir={direction}
                    disabled={!isSelectable}
                    aria-label="File"
                    className={cn(
                        "flex items-center gap-2 cursor-pointer rtl:pl-1 rtl:pr-0 rounded-md duration-200 ease-in-out w-full py-1 px-1",
                        getSize(size),
                        {
                            "bg-muted": isSelected && isSelectable,
                        },
                        " hover:bg-muted",
                        isSelectable ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
                        className
                    )}
                    onClick={() => {
                        onClick && onClick()
                        selectItem(value)
                        onTreeSelected && onTreeSelected(value)
                    }}
                >
                    {fileIcon}
                    {children}
                </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Item>
        );
    }
);

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
        console.log(expandAll);
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

const TreeItemGroup: React.FC<any> = (props) => {
    return <div>
        <div className={`p-1 text-xs text-gray-500 flex justify-between items-center`}>
            <div>
                {props.name}
            </div>
            <div>
                {props.actions}
            </div>
        </div>
        {
            props.height ? <ScrollArea className={`max-h-[500px] overflow-y-auto max-h`}>
                {props.children}
            </ScrollArea> : props.children
        }
    </div>
}
TreeItemGroup.displayName = "TreeItemGroup"
export { Tree, Folder, File, CollapseButton, TreeItemGroup, type TreeViewElement };
