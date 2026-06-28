import React, { ElementType, useCallback, useEffect } from "react";
import { ExtensionWrapper, MenuConfigItem, useTranslation } from "@kn/common";
import { Editor } from "@tiptap/core";
import { Toggle } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { isArray } from "lodash";
import { Undo2, Redo2 } from "@kn/icon";
import { BubbleMenu as ReactBubble } from "../components";
import { useSafeState } from "ahooks";
import { TextSelection } from "@tiptap/pm/state";

interface MenuItem {
    menu: ElementType;
    tooltip?: string;
}

interface MenuRecord {
    block: MenuItem[];
    inline: MenuItem[];
    custom: MenuItem[];
    mark: MenuItem[];
}

export const EditorMenu: React.FC<{
    editor: Editor;
    extensionWrappers: ExtensionWrapper[];
    toolbar?: boolean;
}> = ({ editor, extensionWrappers, toolbar = true }) => {

    const { t } = useTranslation();
    const [bubbleMenu, setBubbleMenu] = useSafeState<ElementType[]>([]);
    const [flotMenu, setFloatMenu] = useSafeState<ElementType[]>([]);
    const [floatingUI, setFloatingUI] = useSafeState<ElementType[]>([]);
    const [record, setRecord] = useSafeState<MenuRecord>({
        block: [],
        inline: [],
        custom: [],
        mark: []
    });

    // Process extension wrappers and extract menu configurations
    useEffect(() => {
        if (!extensionWrappers || extensionWrappers.length === 0) {
            return;
        }

        const newRecord: MenuRecord = {
            block: [],
            inline: [],
            custom: [],
            mark: []
        };
        const newBubbleMenu: ElementType[] = [];
        const newFlotMenu: ElementType[] = [];
        const newFloatingUI: ElementType[] = [];

        extensionWrappers.forEach(wrapper => {
            // Process menu config
            if (wrapper.menuConfig) {
                if (isArray(wrapper.menuConfig)) {
                    wrapper.menuConfig.forEach((config: MenuConfigItem) => {
                        newRecord[config.group].push({ menu: config.menu, tooltip: config.tooltip });
                    });
                } else {
                    newRecord[wrapper.menuConfig.group].push({ menu: wrapper.menuConfig.menu, tooltip: wrapper.menuConfig.tooltip });
                }
            }

            // Process bubble menu
            if (wrapper.bubbleMenu) {
                if (isArray(wrapper.bubbleMenu)) {
                    newBubbleMenu.push(...wrapper.bubbleMenu);
                } else {
                    newBubbleMenu.push(wrapper.bubbleMenu);
                }
            }

            // Process float menu
            if (wrapper.flotMenuConfig) {
                newFlotMenu.push(...wrapper.flotMenuConfig);
            }

            // Process floating UI (standalone floating components like chat)
            if (wrapper.floatingUI) {
                newFloatingUI.push(wrapper.floatingUI);
            }
        });

        setRecord(newRecord);
        setBubbleMenu(newBubbleMenu);
        setFloatMenu(newFlotMenu);
        setFloatingUI(newFloatingUI);
    }, [extensionWrappers, setRecord, setBubbleMenu, setFloatMenu, setFloatingUI]);

    // Memoized render function for menu items — wraps in Tooltip when tooltip text is provided
    const renderItem = useCallback((items: MenuItem[], level: number) => (
        items.length > 0 && items.map(({ menu: Com, tooltip }, index) => {
            const node = <Com key={`${level}-${index}`} editor={editor} />;
            if (!tooltip) return node;
            return (
                <TooltipProvider key={`${level}-${index}`} delayDuration={400}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {node}
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {t(tooltip)}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        })
    ), [editor, t]);

    // Memoized shouldShow function for bubble menu
    const shouldShow = useCallback(() => {
        return editor.state.selection instanceof TextSelection &&
            !editor.state.selection.empty &&
            !editor.isActive('codeBlock');
    }, [editor]);

    // Check undo/redo availability
    const canUndo = editor.can().undo();
    const canRedo = editor.can().redo();

    // Memoized undo/redo handlers
    const handleUndo = useCallback(() => {
        editor.commands.undo();
    }, [editor]);

    const handleRedo = useCallback(() => {
        editor.commands.redo();
    }, [editor]);

    return (
        <>
            {toolbar && (
                <div className="flex flex-nowrap items-center gap-0.5 w-full px-1.5 py-1 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
                    {/* Undo / Redo group */}
                    <div className="flex items-center gap-0.5">
                        <TooltipProvider delayDuration={400}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Toggle
                                        onClick={handleUndo}
                                        size="sm"
                                        disabled={!canUndo}
                                        aria-label="Undo"
                                        className="h-7 w-7 p-0 rounded-md transition-colors hover:bg-muted data-[disabled=true]:opacity-40"
                                    >
                                        <Undo2 className="h-3.5 w-3.5" />
                                    </Toggle>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {t('editor.tooltip.undo')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider delayDuration={400}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Toggle
                                        onClick={handleRedo}
                                        size="sm"
                                        disabled={!canRedo}
                                        aria-label="Redo"
                                        className="h-7 w-7 p-0 rounded-md transition-colors hover:bg-muted data-[disabled=true]:opacity-40"
                                    >
                                        <Redo2 className="h-3.5 w-3.5" />
                                    </Toggle>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {t('editor.tooltip.redo')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>

                    {/* Separator between undo/redo and extension menus */}
                    {(record.mark.length > 0 || record.inline.length > 0 || record.block.length > 0) && (
                        <Separator orientation="vertical" className="mx-1 h-4" />
                    )}

                    {/* Mark menus */}
                    {record.mark.length > 0 && (
                        <div className="flex items-center gap-0.5">
                            {renderItem(record.mark, 1)}
                        </div>
                    )}

                    {/* Separator between mark and inline */}
                    {record.mark.length > 0 && record.inline.length > 0 && (
                        <Separator orientation="vertical" className="mx-1 h-4" />
                    )}

                    {/* Inline menus */}
                    {record.inline.length > 0 && (
                        <div className="flex items-center gap-0.5">
                            {renderItem(record.inline, 2)}
                        </div>
                    )}

                    {/* Separator between inline and block */}
                    {(record.mark.length > 0 || record.inline.length > 0) && record.block.length > 0 && (
                        <Separator orientation="vertical" className="mx-1 h-4" />
                    )}

                    {/* Block menus */}
                    {record.block.length > 0 && (
                        <div className="flex items-center gap-0.5">
                            {renderItem(record.block, 3)}
                        </div>
                    )}
                </div>
            )}
            {bubbleMenu.length > 0 && bubbleMenu.map((Com, index) => <Com key={`bubble-${index}`} editor={editor} />)}
            {flotMenu.length > 0 && (
                <ReactBubble
                    forNode
                    editor={editor}
                    shouldShow={shouldShow}
                    pluginKey="editor-menu"
                    options={{ placement: 'top' }}
                    // On narrow viewports the toolbar would overflow off-screen.
                    // Cap it to the viewport and let it scroll horizontally instead.
                    className="max-w-[calc(100vw-1rem)] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <div className="flex flex-nowrap items-center gap-0.5 [&>*]:shrink-0">
                        {flotMenu.map((Menu, index) => (
                            <Menu key={`float-menu-${index}`} editor={editor} />
                        ))}
                    </div>
                </ReactBubble>
            )}
            {/* Floating UI components (always mounted, independent of bubble menu) */}
            {floatingUI.length > 0 && floatingUI.map((FloatingComponent, index) => (
                <FloatingComponent key={`floating-ui-${index}`} editor={editor} />
            ))}

        </>
    );
};