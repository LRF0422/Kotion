import { Empty } from '@kn/ui'
import { ScrollArea } from '@kn/ui'
import { cn } from '@kn/ui'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { useSafeState } from 'ahooks'
import React, { useEffect } from 'react'


export const ToCItem: React.FC<{ item: any, onItemClick: any, index: number }> = ({ item, onItemClick, index }) => {
    return (
        <div className={cn("hover:bg-muted rounded-sm m-1 p-1 text-sm transition-all duration-300 w-[200px]")} style={{
            paddingLeft: `${10 * item.level}px`
        }}>
            <a className={`before:[content:attr(data-item-index)"."] text-ellipsis overflow-hidden text-nowrap flex gap-1`} href={`#${item.id}`} onClick={e => onItemClick(e, item)} data-item-index={index}>{item.text}</a>
        </div>
    )
}

export const ToCEmptyState = () => {
    return (
        <Empty className=' h-full items-center border-none' title='Empty Content' desc='123' />
    )
}

export const ToC: React.FC<{ editor: Editor, className?: string }> = ({
    editor,
    className
}) => {

    const [items, setItems] = useSafeState<any[]>([])

    useEffect(() => {
        const toc = editor.storage.tableOfContent.toc
        setItems(toc)
    }, [editor.state])

    if (items.length === 0) {
        return <ToCEmptyState />
    }

    const onItemClick = (e: Event, item: any) => {
        e.preventDefault()

        if (editor) {
            const pos = item.pos
            const tr = editor.view.state.tr
            tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
                .scrollIntoView()
            editor.view.dispatch(tr)
        }
    }

    return (
        <ScrollArea className={cn("h-full w-full p-3 overflow-auto", className)}>
            <div className=' font-bold'>Table of contents</div>
            {items.map((item: any, i: number) => (
                <ToCItem onItemClick={onItemClick} key={item.id} item={item} index={i + 1} />
            ))}
        </ScrollArea>
    )
}