import { ExtensionWrapper, getPageNavigationBridge, logger, resolveService } from "@kn/common";
import type { Editor } from "@kn/editor";
import { FilePlus2, Link2, SquareDashedBottom } from "@kn/icon";
import React from "react";
import { PageLink, PageLinkNode, BlockLink, LinkTrigger, PageFooter } from "../../bidirectional-link";
import { createT } from "../../i18n";

/** Create a child or sibling page and insert a canonical string-id link. */
const createAndLinkPage = (editor: Editor, kind: 'CHILD' | 'BROTHER') => {
    const bridge = getPageNavigationBridge();
    if (!bridge) return;
    const current = bridge.getCurrentPage();
    if (!current.spaceId || !current.pageId) return;

    const service = resolveService('spacePageService');
    const parentId = kind === 'CHILD' ? String(current.pageId) : current.parentId
        ? String(current.parentId)
        : undefined;

    service.pages.createPage({
        spaceId: String(current.spaceId),
        title: '未命名',
        parentId,
    }).then((page) => {
        editor.chain().focus().insertContent([
            { type: 'pageLinkNode', attrs: { pageId: String(page.id), title: page.title } },
            { type: 'text', text: ' ' },
        ]).run();
    }).catch((err) => {
        logger.error('[blockReference] createAndLinkPage failed', err);
    });
};

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
                createAndLinkPage(editor, 'BROTHER');
            }
        },
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: t('slashCommands.createSubPage'),
            slash: '/createSubPage',
            action: (editor) => {
                createAndLinkPage(editor, 'CHILD');
            }
        },
        {
            icon: <Link2 className="h-4 w-4" />,
            text: t('slashCommands.linkPage'),
            slash: '/linkPage',
            action: (editor) => {
                editor.chain().focus().insertContent('[[').run();
            }
        },
        {
            icon: <SquareDashedBottom className="h-4 w-4" />,
            text: t('slashCommands.linkBlock'),
            slash: '/linkBlock',
            action: (editor) => {
                editor.chain().focus().insertContent('((').run();
            }
        }
    ]
};
