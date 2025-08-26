import { ReactRenderer, posToDOMRect } from "@tiptap/react";
import { CompactEmoji } from "emojibase";
import { fetchEmojis } from "emojibase";

// import tippy from "tippy.js";
import emojiList from "./emoji-list";
import { computePosition, flip } from "@floating-ui/dom";

interface QueryProps {
    query: string;
}

export default {
    items: async ({ query }: QueryProps) => {
        const compactEmojis = await fetchEmojis("zh", { compact: true });
        if (query !== "") {
            const results = compactEmojis.filter((emoji: CompactEmoji) => {
                if (emoji.label.includes(query)) {
                    return true;
                } else if (emoji.tags) {
                    return emoji.tags!.some((tag) => {
                        /* check if the query is contained in the tag */
                        return tag.includes(query);
                    });
                }
            });
            return results.slice(0, 20);
        } else {
            const localEmojis = localStorage.getItem("emojis");
            if (localEmojis) {
                return JSON.parse(localEmojis);
            } else {
                return [];
            }
        }
    },

    char: ":",

    render: () => {
        let component: any;
        let popup: any;
        let rect: any

        const updatePostition = () => {
            if (rect) {
                let virtualElement = {
                    getBoundingClientRect: () => rect,
                    getClientRects: () => [rect],
                }
                computePosition(virtualElement, component.element as HTMLElement, {
                    placement: 'bottom-start',
                    middleware: [flip()],
                }).then(({ x, y, strategy }) => {
                    console.log("finished", component.element);
                    (component.element as HTMLElement).style.zIndex = '1000';
                    (component.element as HTMLElement).style.position = strategy;
                    (component.element as HTMLElement).style.left = `${x}px`;
                    (component.element as HTMLElement).style.top = `${y}px`;
                })
            }
        };

        return {
            onStart: (props: any) => {
                if (!component || component.element.children.length === 0) {
                    component = new ReactRenderer(emojiList, {
                        props,
                        editor: props.editor
                    });
                    component.render()
                    document.body.appendChild(component.element);
                }

                const { selection } = props.editor.state
                const { view } = props.editor
                const domRect = posToDOMRect(view, selection.from, selection.to)
                rect = domRect
                updatePostition()
            },

            onUpdate(props: any) {
                component.updateProps(props);
                if (!props.clientRect) {
                    return;
                }
                rect = props.clientRect();
                updatePostition();
            },

            onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                    document.body.removeChild(component.element);
                    return true;
                }

                return component.ref?.onKeyDown(props);
            },

            onExit() {
                setTimeout(() => {
                    component.destroy();
                    document.body.removeChild(component.element);
                });
            },
        };
    },
};