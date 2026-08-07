import { ExtensionWrapper, getPageBridge, event } from "@kn/common";
import type { Editor } from "@kn/editor";
import { FilePlus2, Link2, SquareDashedBottom } from "@kn/icon";
import React from "react";
import { PageLink, PageLinkNode, BlockLink, LinkTrigger, PageFooter } from "../../bidirectional-link";
import { createT } from "../../i18n";

/**
 * Create a new page (child or sibling of the current one) and insert a
 * `pageLinkNode` referencing it. Reuses the same `[[page link]]` pill as the
 * `关联页面` command so both flows share one surface: hover card, in-place
 * PageEditWindow editing, jump and backlinks.
 *
 * @param kind 'CHILD' creates a sub-page; 'BROTHER' a sibling of the current page.
 */
const createAndLinkPage = (editor: Editor, kind: 'CHILD' | 'BROTHER') => {
    const bridge = getPageBridge()
    if (!bridge) return
    const current = bridge.getCurrentPage()
    if (!current.spaceId || !current.pageId) return

    const parentId = kind === 'CHILD' ? current.pageId : current.parentId
    bridge.createPage({
        spaceId: current.spaceId,
        title: '未命名',
        parentId,
    }).then((page) => {
        // Refresh the sidebar page tree so the new page shows up immediately.
        event.emit("ON_PAGE_REFRESH")
        editor.chain().focus().insertContent([
            { type: 'pageLinkNode', attrs: { pageId: String(page.id), title: page.title } },
            { type: 'text', text: ' ' },
        ]).run()
    }).catch((err) => {
        console.error('[blockReference] createAndLinkPage failed:', err)
    })
}

/**
 * Block Reference Extension
 * Provides slash commands for creating and linking page/block references
 * Also provides bidirectional linking with [[ and (( syntax
 */
const t = createT();

export const BlockReferenceExtension: ExtensionWrapper = {
    name: "blockReference",
    extendsion: [PageLink, PageLinkNode, BlockLink, LinkTrigger],
    pageFooter: PageFooter,
    slashConfig: [
        {
            divider: true,
            title: t('slashCommands.referenceGroup')
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: t('slashCommands.createPage'),
            slash: '/createPage',
            action: (editor) => {
                createAndLinkPage(editor, 'BROTHER')
            }
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: t('slashCommands.createSubPage'),
            slash: '/createSubPage',
            action: (editor) => {
                createAndLinkPage(editor, 'CHILD')
            }
        },
        {
            icon: <Link2 className="h-4 w-4" />,
            text: t('slashCommands.linkPage'),
            slash: '/linkPage',
            action: (editor) => {
                // Insert the [[ trigger text so the inline suggestion flow
                // (PageLinkPicker → pageLinkNode) takes over — identical to
                // typing [[ by hand, keeping both entries consistent.
                editor.chain().focus().insertContent('[[').run()
            }
        },
        {
            icon: <SquareDashedBottom className="h-4 w-4" />,
            text: t('slashCommands.linkBlock'),
            slash: '/linkBlock',
            action: (editor) => {
                // Insert the (( trigger text so the inline suggestion flow
                // (BlockLinkPicker → blockLink embed) takes over — identical
                // to typing (( by hand, keeping both entries consistent.
                editor.chain().focus().insertContent('((').run()
            }
        }
    ]
}
