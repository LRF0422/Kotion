import React, { useCallback, useRef, useState } from 'react'
import { Editor } from '@tiptap/core'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@kn/ui'
import { ArrowDown, ArrowUp, Plus, Trash2 } from '@kn/icon'
import { ActiveNode } from '../../utilities/select-node-by-dom'
import { findNodeByBlockId } from '../../utilities/node'
import { resolveBlockMove } from '../block-operations/block-operations'

export interface BlockMenuItem {
    icon?: React.ReactNode
    label: string
    action: (editor: Editor, node: any, pos: number) => void
}

/**
 * Open the slash menu by inserting a literal `/` at a fresh cursor position.
 * The `slash-/` Suggestion plugin reacts to the inserted character and opens
 * the command menu — no dedicated API is needed.
 *
 * Behaviour matches Notion's "+": insert a new empty block below the hovered
 * block and trigger the menu there. If the hovered block is already an empty
 * paragraph, reuse it in place instead of stacking another empty block.
 */
const openSlashMenu = (editor: Editor, activeNode: ActiveNode) => {
    const pos = activeNode.$pos.pos - activeNode.offset
    const node = activeNode.node
    const isEmptyParagraph = node.type.name === 'paragraph' && node.content.size === 0

    if (isEmptyParagraph) {
        editor.chain().focus().setTextSelection(pos + 1).insertContent('/').run()
        return
    }

    const after = pos + node.nodeSize
    editor
        .chain()
        .focus()
        .insertContentAt(after, { type: 'paragraph' })
        .setTextSelection(after + 1)
        .insertContent('/')
        .run()
}

export interface DragHandleProps {
    editor: Editor
    activeNode: ActiveNode | null
    items: BlockMenuItem[]
    onGripMouseDown?: () => void
    onGripMouseUp?: () => void
    onGripDragStart?: (event: DragEvent) => void
}

export const DragHandle: React.FC<DragHandleProps> = ({
    editor,
    activeNode,
    items,
    onGripMouseDown,
    onGripMouseUp,
    onGripDragStart,
}) => {
    const [open, setOpen] = useState(false)
    // Tracks whether the current pointer interaction turned into a drag, so a
    // drag doesn't also fire the click-to-open menu.
    const dragStartedRef = useRef(false)

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next)
        // Mark the container so mouseleave / mousemove won't hide or re-target it
        // while the menu is open.
        const container = document.querySelector('.drag-handle-container')
        if (container) {
            if (next) {
                container.setAttribute('data-menu-open', 'true')
                container.classList.add('show')
            } else {
                container.removeAttribute('data-menu-open')
            }
        }
    }, [])

    if (!activeNode) return null

    const pos = activeNode.$pos.pos - activeNode.offset
    const node = activeNode.node

    const handleDelete = () => {
        editor.commands.deleteRange({
            from: pos,
            to: pos + node.nodeSize,
        })
    }

    // Resolved against the live state so the items are greyed out for the
    // first / last block of a parent instead of failing silently on click.
    const canMoveUp = !!resolveBlockMove(editor.state, pos, 'up')
    const canMoveDown = !!resolveBlockMove(editor.state, pos, 'down')

    const handleMove = (direction: 'up' | 'down') => {
        // `pos` was captured when the handle was pinned to this block and goes
        // stale as soon as the document shifts — and the handle keeps pointing
        // at the old block until the next mousemove. Re-resolving by blockId
        // (only on click, never per render) keeps repeated moves on the same
        // block. Blocks without an id fall back to the captured position.
        const blockId = (node.attrs?.id ?? node.attrs?.blockId) as string | undefined
        const livePos = blockId ? findNodeByBlockId(editor.state, blockId)?.pos ?? pos : pos

        editor.commands.moveBlockAtPos(livePos, direction)
    }

    return (
        <>
            <div
                className="block-add-trigger"
                title="Add block"
                onClick={() => openSlashMenu(editor, activeNode)}
            >
                <Plus className="block-menu-plus-icon" />
            </div>

            <div className="dragable-wrapper">
                <DropdownMenu open={open} onOpenChange={handleOpenChange}>
                    {/* Invisible anchor: positions the menu next to the grip
                        without intercepting pointer/drag events. */}
                    <DropdownMenuTrigger asChild>
                        <span className="dragable-anchor" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="bottom" className="min-w-[160px]">
                        {items.map((item, index) => (
                            <DropdownMenuItem key={index} onClick={() => item.action(editor, node, pos)}>
                                {item.icon && <span className="mr-2">{item.icon}</span>}
                                {item.label}
                            </DropdownMenuItem>
                        ))}
                        {items.length > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuItem disabled={!canMoveUp} onClick={() => handleMove('up')}>
                            <ArrowUp className="h-4 w-4 mr-2" />
                            Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canMoveDown} onClick={() => handleMove('down')}>
                            <ArrowDown className="h-4 w-4 mr-2" />
                            Move down
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div
                    className="dragable"
                    data-drag-handle="true"
                    draggable
                    onMouseDown={() => {
                        dragStartedRef.current = false
                        onGripMouseDown?.()
                    }}
                    onMouseUp={() => onGripMouseUp?.()}
                    onDragStart={(e) => {
                        dragStartedRef.current = true
                        setOpen(false)
                        onGripDragStart?.(e.nativeEvent)
                    }}
                    onClick={() => {
                        if (!dragStartedRef.current) {
                            handleOpenChange(!open)
                        }
                    }}
                />
            </div>
        </>
    )
}
