import { ExtensionWrapper } from "@kn/common";
import { PageReference } from "./page-reference";
import { FilePlus2, Link2, SquareDashedBottom } from "@kn/icon";
import React from "react";
import { computePosition, flip, posToDOMRect, ReactRenderer } from "@kn/editor";
import { PageSelector } from "./PageSelector";
import { BlockSelector } from "./BlockSelector";
import { BlockReference } from "./block-references";

/**
 * Block Reference Extension
 * Provides slash commands for creating and linking page/block references
 */
export const BlockReferenceExtension: ExtensionWrapper = {
    name: "blockReference",
    extendsion: [PageReference, BlockReference],
    slashConfig: [
        {
            divider: true,
            title: "引用"
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: "新建同级页面并引用",
            slash: '/createPage',
            action: (editor) => {
                editor.commands.insertContent({
                    type: PageReference.name,
                    attrs: {
                        type: "BROTHER"
                    }
                })
            }
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: "新建子页面并引用",
            slash: '/createSubPage',
            action: (editor) => {
                editor.commands.insertContent({
                    type: PageReference.name,
                    attrs: {
                        type: "CHILD"
                    }
                })
            }
        },
        {
            icon: <Link2 className="h-4 w-4" />,
            text: "关联页面",
            slash: '/linkPage',
            action: (editor) => {
                const component = new ReactRenderer(PageSelector, {
                    editor: editor,
                    props: {
                        onCancel: () => {
                            editor.view.dom.parentElement?.removeChild(component.element)
                            component.destroy()
                        },
                        editor
                    }
                })
                component.render()
                editor.view.dom.parentElement?.appendChild(component.element)
                const { selection } = editor.state
                const { view } = editor
                const domRect = posToDOMRect(view, selection.from, selection.to)

                const virtualElement = {
                    getBoundingClientRect: () => domRect,
                    getClientRects: () => [domRect],
                }

                computePosition(virtualElement, component.element as HTMLElement, {
                    placement: "bottom-start",
                }).then(({ x, y, strategy }) => {
                    (component.element as HTMLElement).style.zIndex = '1000';
                    (component.element as HTMLElement).style.position = strategy;
                    (component.element as HTMLElement).style.left = `${x + 2}px`;
                    (component.element as HTMLElement).style.top = `${y}px`;
                })
            }
        },
        {
            icon: <SquareDashedBottom className="h-4 w-4" />,
            text: "关联块",
            slash: '/linkBlock',
            action: (editor) => {
                editor.view.dispatch(editor.state.tr.insertText("("))
                const component = new ReactRenderer(BlockSelector, {
                    editor: editor,
                    props: {
                        onCancel: () => {
                            editor.view.dom.parentElement?.removeChild(component.element)
                            component.destroy()
                        },
                        editor
                    }
                })
                component.render()
                editor.view.dom.parentElement?.appendChild(component.element)
                const { selection } = editor.state
                const { view } = editor
                const domRect = posToDOMRect(view, selection.from, selection.to)

                const virtualElement = {
                    getBoundingClientRect: () => domRect,
                    getClientRects: () => [domRect],
                }

                computePosition(virtualElement, component.element as HTMLElement, {
                    placement: "bottom-start",
                    middleware: [flip()],
                }).then(({ x, y, strategy }) => {
                    (component.element as HTMLElement).style.zIndex = '1000';
                    (component.element as HTMLElement).style.position = strategy;
                    (component.element as HTMLElement).style.left = `${x + 2}px`;
                    (component.element as HTMLElement).style.top = `${y}px`;
                })
            }
        }
    ]
}
