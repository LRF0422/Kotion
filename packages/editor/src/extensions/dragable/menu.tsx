import React from "react";
import { ActiveNode } from "./utilities";
import { Trash2 } from "@repo/icon";
import { Editor } from "..";
import { useEditorExtension } from "../../editor/use-extension";
import { useSafeState } from "ahooks";


export const DragableMenu: React.FC<{ activeNode: ActiveNode, editor: Editor, callBack: () => void }> = ({ activeNode, editor, callBack }) => {

    const [_, extensions] = useEditorExtension()
    const [actions, setActions] = useSafeState([
        {
            name: 'Delete',
            icon: <Trash2 className="h-4 w-4" />,
            action: (node: ActiveNode, editor: Editor) => {
                editor.commands.deleteRange(
                    {
                        from: node.$pos.pos,
                        to: node.$pos.pos + node.node.nodeSize
                    }
                )
            }
        }
    ])

    return <div className="w-[160px] border bg-popover text-popover-foreground rounded-sm shadow-lg p-1 flex flex-col ">
        {
            actions.map((it, index) => (
                <div key={index} className="w-full flex flex-row gap-1 cursor-pointer hover:bg-muted p-1 rounded-sm" onClick={() => {
                    it.action(activeNode, editor)
                    callBack()
                }}>
                    <div>
                        {it.icon}
                    </div>{it.name}
                </div>
            ))
        }
    </div>
}