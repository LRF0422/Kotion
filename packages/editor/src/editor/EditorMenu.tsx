import React, { ElementType, useCallback, useEffect, useMemo } from "react";
import { ExtensionWrapper, Group } from "@kn/common";
import { Editor } from "@tiptap/core";
import { Toggle } from "@kn/ui";
import { Separator } from "@kn/ui";
import { isArray } from "lodash";
import { Undo2, Redo2 } from "@kn/icon";
import { BubbleMenu as ReactBubble } from "../components";
import { useSafeState } from "ahooks";
import { TextSelection } from "@tiptap/pm/state";

interface MenuRecord {
    block: ElementType[];
    inline: ElementType[];
    custom: ElementType[];
    mark: ElementType[];
}

interface MenuConfigItem {
    group: Group;
    menu: ElementType;
}

export const EditorMenu: React.FC<{
    editor: Editor;
    extensionWrappers: ExtensionWrapper[];
    toolbar?: boolean;
}> = ({ editor, extensionWrappers, toolbar = true }) => {

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
                        newRecord[config.group].push(config.menu);
                    });
                } else {
                    newRecord[wrapper.menuConfig.group].push(wrapper.menuConfig.menu);
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

    // Memoized render function for menu items
    const renderItem = useCallback((items: ElementType[], level: number) => (
        items.length > 0 && items.map((Com, index) => <Com key={`${level}-${index}`} editor={editor} />)
    ), [editor]);

    // Memoized shouldShow function for bubble menu
    const shouldShow = useCallback(() => {
        return editor.state.selection instanceof TextSelection &&
            !editor.state.selection.empty &&
            !editor.isActive('codeBlock');
    }, [editor]);

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
                <div className="flex flex-row gap-0 w-full items-center z-20 shadow-sm border-b flex-wrap">
                    <Toggle onClick={handleUndo} size="sm">
                        <Undo2 className="h-4 w-4" />
                    </Toggle>
                    <Toggle onClick={handleRedo} size="sm">
                        <Redo2 className="h-4 w-4" />
                    </Toggle>
                    <Separator orientation="vertical" />
                    {renderItem(record.mark, 1)}
                    {renderItem(record.inline, 2)}
                    {renderItem(record.block, 3)}
                </div>
            )}
            {renderItem(bubbleMenu, 4)}
            {flotMenu.length > 0 && (
                <ReactBubble
                    forNode
                    editor={editor}
                    shouldShow={shouldShow}
                    pluginKey="editor-menu"
                    options={{ placement: 'top' }}
                >
                    <div className="flex flex-row gap-0 items-center flex-wrap">
                        {flotMenu.map((Menu, index) => (
                            <Menu key={`float-menu-${index}`} editor={editor} />
                        ))}
                    </div>
                </ReactBubble>
            )}
            {/* Floating UI components (rendered outside of toolbar) */}
            {/* {floatingUI.map((FloatingComponent, index) => (
                <FloatingComponent key={`floating-ui-${index}`} editor={editor} />
            ))} */}
        </>
    );
};