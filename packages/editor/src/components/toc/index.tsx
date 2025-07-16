import { TextSelection } from "@tiptap/pm/state"
import React, { CSSProperties } from "react"
import { Editor } from "@tiptap/core"
import { Card } from "@repo/ui"
// import { Card, Link, Typography } from "@knowledge/component"

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
		// e.preventDefault()

		if (editor) {
			const element = editor.view.dom.querySelector(`[data-toc-id="${id}"`)
			const pos = editor.view.posAtDOM(element!, 0)
			const tr = editor.view.state.tr

			tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
				.scrollIntoView()

			editor.view.dispatch(tr)
			editor.view.focus()


			// if (history.pushState) { // eslint-disable-line
			//   history.pushState(null, null, `#${id}`) // eslint-disable-line
			// }

			// setTimeout(() => {
			// 	editor.options.element.scrollTo({
			// 		top: element.getBoundingClientRect().top + window.scrollY,
			// 		behavior: 'smooth',
			// 	})
			// }, 500);
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
