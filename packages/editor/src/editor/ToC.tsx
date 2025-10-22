import { useTranslation } from '@kn/common'
import { Empty } from '@kn/ui'
import { ScrollArea } from '@kn/ui'
import { cn } from '@kn/ui'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import React from 'react'


export const ToCItem: React.FC<{ item: any, onItemClick: any, index: number }> = ({ item, onItemClick, index }) => {
    return (
        <div className={cn("hover:bg-muted rounded-sm m-1 p-1 text-sm  transition-all duration-300 w-[200px]")} style={{
            paddingLeft: `${10 * item.level}px`
        }}>
            <a className={`before:[content:attr(data-item-index)"."] w-full overflow-ellipsis overflow-hidden text-nowrap flex gap-1`} href={`#${item.id}`} onClick={e => onItemClick(e, item)} data-item-index={item.itemIndex}>{item.textContent}</a>
        </div>
    )
}

export const ToCEmptyState = () => {

    const { t } = useTranslation()

    return (
        <Empty className=' h-full items-center border-none' title={t('toc.empty', "No Content")} desc='' />
    )
}

export const ToC: React.FC<{ editor: Editor, className?: string, items: any[] }> = ({
    editor,
    className,
    items
}) => {

    if (items.length === 0) {
        return <ToCEmptyState />
    }

    const { t } = useTranslation()

    const onItemClick = (e: Event, item: any) => {
        e.preventDefault()

        if (editor) {
            const element = editor.view.dom.querySelector(`[data-toc-id="${item.id}"`)
            const pos = editor.view.posAtDOM(element as Element, 0)

            const tr = editor.view.state.tr
            tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
                .scrollIntoView()
            editor.view.dispatch(tr)
            editor.view.focus()
            console.log('element', element);

            window.scrollTo({
                top: element!.getBoundingClientRect().top + window.scrollY,
                behavior: 'smooth',
            })
        }
    }

    return (
        <ScrollArea className={cn("h-full w-full p-3 overflow-auto", className)}>
            <div className='font-bold'>{t("toc.title", "Table of contents")}</div>
            {items.map((item: any, i: number) => (
                <ToCItem onItemClick={onItemClick} key={item.id} item={item} index={i + 1} />
            ))}
        </ScrollArea>
    )
}