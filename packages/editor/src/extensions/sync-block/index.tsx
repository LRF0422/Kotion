import React from "react";
import { ExtensionWrapper } from "../../editor";
import { SyncBlock } from "./sync-block";
import { BlocksIcon } from "@repo/icon";
import { Node, NodeType } from "@tiptap/pm/model";

export const SyncBlockExtension: ExtensionWrapper = {
    name: SyncBlock.name,
    extendsion: SyncBlock,
    slashConfig: [
        {
            icon: <BlocksIcon className="h-4 w-4" />,
            text: '同步块',
            slash: '/sync',
            action: (editor) => {
                editor.commands.insertContent({
                    type: SyncBlock.name,
                    attrs: {
                        id: '88888888'
                    }
                })
            }
        }
    ],
    dragMenuConfig: [
        {
            name: '转换成同步块',
            icon: <div></div>,
            action: (node, editor) => {
                const json = node.node.toJSON()
                const tr = editor.state.tr.replaceWith(node.$pos.pos, node.node.nodeSize, (editor.schema.nodes[SyncBlock.name] as NodeType).createChecked({
                    content: json,
                }))
                editor.view.dispatch(tr)
            }
        }
    ]
}