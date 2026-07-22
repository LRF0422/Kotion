import { ExtensionWrapper } from "@kn/common";
import { PageReference } from "./page-reference";
import { FilePlus2, Link2, SquareDashedBottom } from "@kn/icon";
import React from "react";
import { BlockReference } from "./block-references";
import { PageLink, PageLinkNode, BlockLink, LinkTrigger, PageFooter } from "../../bidirectional-link";

/**
 * Block Reference Extension
 * Provides slash commands for creating and linking page/block references
 * Also provides bidirectional linking with [[ and (( syntax
 */
export const BlockReferenceExtension: ExtensionWrapper = {
    name: "blockReference",
    extendsion: [PageReference, BlockReference, PageLink, PageLinkNode, BlockLink, LinkTrigger],
    pageFooter: PageFooter,
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
                // Insert the [[ trigger text so the inline suggestion flow
                // (PageLinkPicker → pageLinkNode) takes over — identical to
                // typing [[ by hand, keeping both entries consistent.
                editor.chain().focus().insertContent('[[').run()
            }
        },
        {
            icon: <SquareDashedBottom className="h-4 w-4" />,
            text: "关联块",
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
