import React, { ElementType, memo, useCallback, useEffect } from "react";
import { ExtensionWrapper, Group } from "@kn/common";
import { Editor } from "@tiptap/core";
import { Toggle } from "@kn/ui";
import { Separator } from "@kn/ui";
import { isArray } from "lodash";
import { Undo2, Redo2 } from "@kn/icon";
import { BubbleMenu as ReactBubble } from "../components";
import { useSafeState } from "ahooks";
import { TextSelection } from "@tiptap/pm/state";



export const EditorMenu: React.FC<{ editor: Editor, extensionWrappers: ExtensionWrapper[], toolbar?: boolean }> = ({ editor, extensionWrappers, toolbar = true }) => {

    const [bubbleMenu, setBubbleMenu] = useSafeState<ElementType[]>([])
    const [flotMenu, setFloatMenu] = useSafeState<ElementType[]>([])
    const [record, setRecord] = useSafeState<any>(
        {
            block: [],
            inline: [],
            custom: [],
            mark: []
        }
    );

    const renderItem = useCallback((items: ElementType[], level: number, e: Editor) => (
        items && items.map((Com, index) => <Com key={level + '-' + index} editor={e} />)
    ), [])

    useEffect(() => {
        (extensionWrappers || []).forEach(e => {
            if (e.menuConfig) {
                if (!isArray(e.menuConfig)) {
                    record[e.menuConfig.group].push(e.menuConfig.menu)
                    setRecord({ ...record })
                } else {
                    e.menuConfig.forEach((it: any) => {
                        record[it.group as Group].push(it.menu);
                    })
                    setRecord({ ...record })
                }
            }
            if (e.bubbleMenu) {
                if (isArray(e.bubbleMenu)) {
                    setBubbleMenu([...bubbleMenu, ...e.bubbleMenu])
                } else {
                    setBubbleMenu(b => [...b, e.bubbleMenu] as ElementType[])
                }
            }
            if (e.flotMenuConfig) {
                setFloatMenu(f => [...f, ...(e.flotMenuConfig || [])])
            }
        });
    }, [])
    const shouldShow = useCallback(() => {
        return editor.state.selection instanceof TextSelection && !editor.state.selection.empty && !editor.isActive('codeBlock')
    }, [])

    return <>
        {
            toolbar && <div className="flex flex-row gap-0 w-full items-center z-20 shadow-sm border-b flex-wrap">
                <Toggle onClick={() => editor.commands.undo()} size="sm"><Undo2 className="h-4 w-4" /></Toggle>
                <Toggle onClick={() => editor.commands.redo()} size="sm"><Redo2 className="h-4 w-4" /></Toggle>
                <Separator orientation="vertical" />
                {renderItem(record.mark, 1, editor)}
                {renderItem(record.inline, 2, editor)}
                {renderItem(record.block, 3, editor)}
            </div>
        }
        {renderItem(bubbleMenu, 4, editor)}
        {
            flotMenu.length > 0 && <ReactBubble
                forNode
                editor={editor}
                shouldShow={shouldShow}
                pluginKey="editor-menu"
                options={{ placement: 'top' }}>
                <div className="flex flex-row gap-0 items-center">
                    {flotMenu.map((Menu, index) => (
                        <Menu key={index} editor={editor} />
                    ))}
                </div>
            </ReactBubble>
        }
    </>


}