import { event, ExtensionWrapper } from "@kn/common";
import { PageReference } from "./page-reference";
import { FilePlus2 } from "@kn/icon";
import React from "react";
import { computePosition, posToDOMRect, ReactRenderer } from "@kn/editor";
import { PageSelector } from "./PageSelector";


export const BlockReferenceExtension: ExtensionWrapper = {
    name: "blockReference",
    extendsion: PageReference,
    slashConfig: [
        {
            divider: true,
            title: "引用"
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: "新建页面并引用",
            slash: '/createPage',
            action: (editor) => {
                editor.commands.insertContent({
                    type: PageReference.name,
                    attrs: {
                        type: "BORTHER"
                    }
                })
            }
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: "新建页面并引用",
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
            icon: <FilePlus2 className="h-4 w-4" />,
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
        }
    ]
}