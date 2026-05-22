import React, { useCallback } from 'react'
import { Editor } from '@tiptap/core'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@kn/ui'
import { Plus, Trash2 } from '@kn/icon'
import { ActiveNode } from '../../utilities/select-node-by-dom'

export interface BlockMenuItem {
    icon?: React.ReactNode
    label: string
    action: (editor: Editor, node: any, pos: number) => void
}

export const BlockMenu: React.FC<{
    editor: Editor
    activeNode: ActiveNode | null
    items: BlockMenuItem[]
}> = ({ editor, activeNode, items }) => {
    if (!activeNode) return null

    const pos = activeNode.$pos.pos - activeNode.offset
    const node = activeNode.node

    const handleDelete = () => {
        editor.commands.deleteRange({
            from: pos,
            to: pos + node.nodeSize
        })
    }

    const handleOpenChange = useCallback((open: boolean) => {
        // Find the parent container and mark it so mouseleave won't hide it
        const container = document.querySelector('.drag-handle-container')
        if (container) {
            if (open) {
                container.setAttribute('data-menu-open', 'true')
                container.classList.add('show')
            } else {
                container.removeAttribute('data-menu-open')
            }
        }
    }, [])

    return (
        <DropdownMenu onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <div className="block-menu-trigger" title="More actions">
                    <Plus className="block-menu-plus-icon" />
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="min-w-[160px]">
                {items.map((item, index) => (
                    <DropdownMenuItem key={index} onClick={() => item.action(editor, node, pos)}>
                        {item.icon && <span className="mr-2">{item.icon}</span>}
                        {item.label}
                    </DropdownMenuItem>
                ))}
                {items.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
