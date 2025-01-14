import { Empty } from '@repo/ui'
import { ScrollArea } from '@repo/ui'
import { cn } from '@repo/ui'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import React from 'react'

export const ToCItem: React.FC<{ item: any, onItemClick: any, index: number }> = ({ item, onItemClick, index }) => {
    return (
        <div className={cn("hover:bg-muted rounded-sm m-1 p-1 text-sm transition-all duration-300 w-full overflow-hidden text-ellipsis text-wrap")} style={{
            paddingLeft: `${10 * item.level}px`
        }}>
            <a className={`before:[content:attr(data-item-index)"."] flex gap-1`} href={`#${item.id}`} onClick={e => onItemClick(e, item.id)} data-item-index={item.itemIndex}>{item.textContent}</a>
        </div>
    )
}

export const ToCEmptyState = () => {
    return (
        <Empty className=' h-full items-center border-none' title='Empty Content' desc='123' />
    )
}

export const ToC: React.FC<{ items: any[], editor: Editor, className?: string }> = ({
    items = [],
    editor,
    className
}) => {
    if (items.length === 0) {
        return <ToCEmptyState />
    }

    const onItemClick = (e: Event, id: any) => {
        e.preventDefault()

        if (editor) {
            const element = editor.view.dom.querySelector(`[data-toc-id="${id}"`) as Element
            const pos = editor.view.posAtDOM(element, 0)
            const tr = editor.view.state.tr
            tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
            editor.view.dispatch(tr)
            editor.view.focus()
            if (history.pushState) {
                // @ts-ignore
                history.pushState(null, null, `#${id}`)
            }
            const container = document.querySelector("#editor-container")
            container?.scrollTo({
                top: element.getBoundingClientRect().top + container.scrollTop - 50,
                behavior: 'smooth',
            })
        }
    }

    return (
        <ScrollArea className={cn("h-full w-full p-3 overflow-auto", className)}>
            <div className=' font-bold'>Table of contents</div>
            {items.map((item: any, i) => (
                <ToCItem onItemClick={onItemClick} key={item.id} item={item} index={i + 1} />
            ))}
        </ScrollArea>
    )
}