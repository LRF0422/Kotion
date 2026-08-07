import { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import EmojiList from "./emoji-list";
import { EmojiItem, pushRecentEmoji, searchEmojis } from "./emoji-data";

type EmojiSuggestionProps = SuggestionProps<EmojiItem, EmojiItem>;

/**
 * ":" 触发的 emoji 联想配置。选中后插入纯文本 unicode，
 * 由 emojiSuggestion extension 注册为 ProseMirror 插件。
 */
const emojiSuggestion: Omit<SuggestionOptions<EmojiItem, EmojiItem>, "editor"> = {
    char: ":",

    items: ({ query }) => searchEmojis(query),

    command: ({ editor, range, props }) => {
        pushRecentEmoji(props);
        editor.chain().focus().deleteRange(range).insertContent(props.unicode).run();
    },

    // 代码块等 code mark 容器内不触发联想
    allow: ({ state, range }) => {
        const $from = state.doc.resolve(range.from);
        return !$from.parent.type.spec.code;
    },

    render: () => {
        let component: ReactRenderer | null = null;
        let stopAutoUpdate: (() => void) | null = null;
        let currentRect: DOMRect | null = null;

        const virtualElement = {
            getBoundingClientRect: () => currentRect ?? new DOMRect(),
            getClientRects: () => (currentRect ? [currentRect] : []),
        };

        const updatePosition = () => {
            if (!component || !currentRect) return;
            const element = component.element as HTMLElement;
            computePosition(virtualElement, element, {
                placement: "bottom-start",
                strategy: "fixed",
                middleware: [offset(4), flip(), shift({ padding: 8 })],
            }).then(({ x, y, strategy }) => {
                if (!component) return;
                element.style.position = strategy;
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
            });
        };

        /** 幂等清理：Escape 关闭与 onExit 都会走到，重复调用安全 */
        const teardown = () => {
            stopAutoUpdate?.();
            stopAutoUpdate = null;
            if (component) {
                const element = component.element as HTMLElement;
                if (element.isConnected) {
                    document.body.removeChild(element);
                }
                component.destroy();
                component = null;
            }
            currentRect = null;
        };

        const syncRect = (props: EmojiSuggestionProps) => {
            currentRect = props.clientRect?.() ?? null;
        };

        return {
            onStart: (props: EmojiSuggestionProps) => {
                if (!props.editor.isEditable) return;

                // 防御：快速重开时确保上一个实例已销毁
                teardown();

                component = new ReactRenderer(EmojiList, {
                    props,
                    editor: props.editor,
                });
                component.render();

                const element = component.element as HTMLElement;
                element.style.zIndex = "1000";
                // ReactRenderer 默认块级容器会撑满宽度，导致 flip/shift 误判漂移；
                // 收缩为内容宽度并先给出临时位置再计算
                element.style.width = "max-content";
                element.style.position = "fixed";
                element.style.left = "0px";
                element.style.top = "0px";
                document.body.appendChild(element);

                syncRect(props);
                updatePosition();

                // 页面滚动/缩放时跟随光标位置
                stopAutoUpdate = autoUpdate(virtualElement, element, updatePosition);
            },

            onUpdate: (props: EmojiSuggestionProps) => {
                if (!component) return;
                component.updateProps(props);
                syncRect(props);
                updatePosition();
            },

            onKeyDown: (props: SuggestionKeyDownProps) => {
                // Escape 由 suggestion 插件原生处理（关闭并回调 onExit），无需拦截
                if (props.event.key === "Escape") return false;
                return (component?.ref as any)?.onKeyDown?.(props) ?? false;
            },

            onExit: () => {
                teardown();
            },
        };
    },
};

export default emojiSuggestion;
