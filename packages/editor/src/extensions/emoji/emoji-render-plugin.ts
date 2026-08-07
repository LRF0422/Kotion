import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { flatEmojiUrl } from "@kn/ui";

/**
 * 文档内 emoji 扁平化渲染：
 * 扫描文本节点中的 emoji，用行内 decoration 把 Twemoji SVG 作为背景贴到原字符上
 * （原生字形以 color: transparent 隐藏）。纯视图层处理 —— 文档模型仍是纯文本
 * unicode，复制/搜索/导出/协作同步均不受影响。
 *
 * 图片按 URL 预加载门控：加载成功才应用 decoration；失败（如离线）保持原生字形，
 * 与 FlatEmoji 组件的 native fallback 行为一致。
 */

/**
 * 覆盖：Extended_Pictographic（含 VS16/VS15、肤色修饰、ZWJ 序列）、
 * keycap（#*0-9 + U+20E3）、区域指示符旗帜。
 */
const EMOJI_REGEX =
    /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}]|(?:\u{E0020}-\u{E007F})+)?)*)/gu;

const REFRESH_META = "emojiRenderRefresh";
const pluginKey = new PluginKey<DecorationSet>("emojiRendering");

type ImageStatus = "loading" | "ok" | "fail";
/** 全局共享：同一 URL 只预加载一次，多编辑器实例复用结果 */
const imageStatus = new Map<string, ImageStatus>();
const readyListeners = new Set<() => void>();

const ensureImage = (url: string) => {
    if (imageStatus.has(url)) return;
    imageStatus.set(url, "loading");
    const img = new Image();
    img.onload = () => {
        imageStatus.set(url, "ok");
        readyListeners.forEach((notify) => notify());
    };
    img.onerror = () => {
        imageStatus.set(url, "fail");
    };
    img.src = url;
};

/** 扫描 [from, to] 范围内的文本节点，为图片已就绪的 emoji 生成 decoration */
const scanRange = (doc: ProseMirrorNode, from: number, to: number): Decoration[] => {
    const decorations: Decoration[] = [];
    doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText || !node.text) return true;

        EMOJI_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = EMOJI_REGEX.exec(node.text))) {
            const url = flatEmojiUrl(match[0]);
            const status = imageStatus.get(url);
            // 加载失败：保持原生字形
            if (status === "fail") continue;
            if (status !== "ok") {
                // 未就绪：先显示原生字形并预加载，完成后通过 refresh 事务重扫
                ensureImage(url);
                continue;
            }
            const start = pos + match.index;
            decorations.push(
                Decoration.inline(start, start + match[0].length, {
                    class: "kn-flat-emoji",
                    style:
                        "color: transparent;" +
                        `background-image: url("${url}");` +
                        "background-repeat: no-repeat;" +
                        "background-position: center;" +
                        "background-size: 1em 1em;",
                })
            );
        }
        return false;
    });
    return decorations;
};

const scanDoc = (doc: ProseMirrorNode): DecorationSet =>
    DecorationSet.create(doc, scanRange(doc, 0, doc.content.size));

export const EmojiRenderExtension = Extension.create({
    name: "emojiRendering",

    addProseMirrorPlugins() {
        return [
            new Plugin<DecorationSet>({
                key: pluginKey,
                state: {
                    init: (_, { doc }) => scanDoc(doc),
                    apply: (tr, old) => {
                        // 图片加载完成：全量重扫（批量 debounce 后触发，频率低）
                        if (tr.getMeta(REFRESH_META)) return scanDoc(tr.doc);
                        if (!tr.docChanged) return old;

                        // 增量更新：旧 decoration 走位置映射，仅重扫受影响的 textblock
                        let next = old.map(tr.mapping, tr.doc);

                        const blocks = new Map<number, { from: number; to: number }>();
                        tr.mapping.maps.forEach((stepMap) => {
                            stepMap.forEach((_from, _to, newFrom, newTo) => {
                                const from = Math.max(0, newFrom - 1);
                                const to = Math.min(tr.doc.content.size, newTo + 1);
                                tr.doc.nodesBetween(from, to, (node, pos) => {
                                    if (node.isTextblock) {
                                        blocks.set(pos, {
                                            from: pos + 1,
                                            to: pos + 1 + node.content.size,
                                        });
                                        return false;
                                    }
                                    return true;
                                });
                            });
                        });

                        blocks.forEach(({ from, to }) => {
                            next = next.remove(next.find(from, to));
                            next = next.add(tr.doc, scanRange(tr.doc, from, to));
                        });

                        return next;
                    },
                },
                props: {
                    decorations(state) {
                        return pluginKey.getState(state);
                    },
                },
                view: (view) => {
                    // 图片加载完成后合帧触发一次重扫，将原生字形切换为扁平图标
                    let scheduled = false;
                    const onImageReady = () => {
                        if (scheduled) return;
                        scheduled = true;
                        setTimeout(() => {
                            scheduled = false;
                            try {
                                view.dispatch(view.state.tr.setMeta(REFRESH_META, true));
                            } catch {
                                /* 视图已销毁 */
                            }
                        }, 50);
                    };
                    readyListeners.add(onImageReady);
                    return {
                        destroy: () => {
                            readyListeners.delete(onImageReady);
                        },
                    };
                },
            }),
        ];
    },
});
