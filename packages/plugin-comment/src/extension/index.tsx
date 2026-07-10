import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";
import { MessageCircleMore } from "@kn/icon";
import CommentExt from "./comment";
import { BlockCommentExt } from "./block-comment";
import { CommentStaticMenu } from "./menu/static";
import { CommentMarginPanel } from "./menu/CommentMarginPanel";
import { commentReviewerSkill } from "./skills/comment-reviewer";

export const CommentExtension: ExtensionWrapper = {
    name: CommentExt.name,
    extendsion: [CommentExt, BlockCommentExt],
    flotMenuConfig: [CommentStaticMenu],
    floatingUI: CommentMarginPanel,
    blockMenuConfig: [
        {
            icon: <MessageCircleMore className="h-4 w-4" />,
            label: 'Comment',
            action: (editor: Editor, node: any, _pos: number) => {
                // Use block-level commenting: associate the thread with the
                // block's stable id rather than a text selection. This works
                // for ALL block types — including atom nodes (images, charts)
                // that have no text content to mark.
                const blockId = node.attrs?.id ?? node.attrs?.blockId;
                if (!blockId) return;
                editor.commands.addBlockComment(blockId);
            },
        },
    ],
    tools: [
        {
            name: 'addComment',
            description: '为文档中指定的文本添加批注/评论。通过搜索文本定位目标内容，然后在该文本上添加评论标记',
            inputSchema: z.object({
                searchText: z.string().describe("要添加评论的目标文本（精确匹配文档中的一段文字）"),
                comment: z.string().describe("评论内容"),
            }),
            execute: (editor: Editor) => async (params: { searchText: string; comment: string }) => {
                const { searchText, comment } = params;

                if (!searchText?.trim()) {
                    return { error: '搜索文本不能为空' };
                }
                if (!comment?.trim()) {
                    return { error: '评论内容不能为空' };
                }

                try {
                    const doc = editor.state.doc;
                    let from: number | null = null;
                    let to: number | null = null;

                    // Search within individual text nodes first
                    doc.descendants((node, pos) => {
                        if (from !== null) return false;
                        if (!node.isText) return;
                        const text = node.textContent;
                        const idx = text.indexOf(searchText);
                        if (idx !== -1) {
                            from = pos + idx;
                            to = from! + searchText.length;
                            return false;
                        }
                    });

                    // If not found in single node, try cross-node search
                    if (from === null || to === null) {
                        const fullText = doc.textContent;
                        const textIdx = fullText.indexOf(searchText);
                        if (textIdx === -1) {
                            return { error: `未找到文本: "${searchText}"` };
                        }

                        let charCount = 0;
                        doc.descendants((node, pos) => {
                            if (from !== null) return false;
                            if (!node.isText) return;
                            const nodeStart = charCount;
                            charCount += node.textContent.length;

                            if (textIdx >= nodeStart && textIdx < charCount) {
                                from = pos + (textIdx - nodeStart);
                            }
                        });

                        if (from !== null) {
                            to = from + searchText.length;
                        } else {
                            return { error: `无法定位文本位置: "${searchText}"` };
                        }
                    }

                    // Select text and add comment
                    editor.chain()
                        .focus()
                        .setTextSelection({ from, to: to! })
                        .run();

                    const result = editor.commands.addComment(comment);

                    if (!result) {
                        return { error: '添加评论失败' };
                    }

                    return {
                        success: true,
                        text: searchText,
                        comment,
                        message: `已在 "${searchText.substring(0, 30)}${searchText.length > 30 ? '...' : ''}" 上添加评论`,
                    };
                } catch (error) {
                    return { error: `添加评论失败: ${error instanceof Error ? error.message : '未知错误'}` };
                }
            },
        },
    ],
    skills: [
        commentReviewerSkill,
    ],
};
