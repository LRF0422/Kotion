import { TextSelection } from "@tiptap/pm/state"
import React, { CSSProperties } from "react"
import { Editor } from "@tiptap/core"
import { Card } from "@kn/ui"
import scrollIntoView from 'scroll-into-view-if-needed'

export const ToCItem = (props: any) => {
	return (
		<a
			style={{
				display: 'block',
				padding: '5px',
				width: '250px',
				color: props.item.isScrolledOver && !props.item.isActive ? '#888' : '#000',
				borderRadius: '4px',
				marginLeft: `${props.item.level * 10}px`
			}} onClick={e => props.onItemClick(e, props.item.id)}>{props.item.itemIndex}. {props.item.textContent}</a>
	)
}

export const ToCEmptyState = () => {
	return (
		<div className="toc--empty_state">
			<p>Start editing your document to see the outline.</p>
		</div>
	)
}

export const ToC: React.FC<{ items?: any[], editor: Editor }> = ({
	items = [],
	editor
}) => {
	if (items.length === 0) {
		return <ToCEmptyState />
	}

	const onItemClick = (e: any, id: any) => {
		e.preventDefault()

		if (editor) {
			const element = editor.view.dom.querySelector(`[data-toc-id="${id}"]`) as HTMLElement
			if (!element) return

			// Use scroll-into-view-if-needed for smooth scrolling in nested containers
			scrollIntoView(element, {
				behavior: 'smooth',
				scrollMode: 'always',
				block: 'start',
				inline: 'nearest'
			})

			// Set selection and add highlight effect after scroll completes
			setTimeout(() => {
				const pos = editor.view.posAtDOM(element, 0)
				const tr = editor.view.state.tr
				tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
				editor.view.dispatch(tr)
				editor.view.focus()

				// Add flash highlight effect using class
				element.classList.remove('toc-highlight-flash')
				// Force reflow to restart animation
				void element.offsetWidth
				element.classList.add('toc-highlight-flash')

				// Remove class after animation completes
				setTimeout(() => {
					element.classList.remove('toc-highlight-flash')
				}, 1000)
			}, 300)
		}
	}

	return (
		<Card style={{ borderRadius: '5px', width: '300px', border: 'none' }}>
			{(items).map((item, i) => (
				<ToCItem onItemClick={onItemClick} key={item.id} item={item} />
			))}
		</Card>
	)
}
