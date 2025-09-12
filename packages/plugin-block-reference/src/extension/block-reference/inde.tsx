import { ExtensionWrapper } from "@kn/common";
import { BlockReference } from "./block-reference";
import { FilePlus2 } from "@kn/icon";
import React from "react";


export const BlockReferenceExtension: ExtensionWrapper = {
    name: "blockReference",
    extendsion: BlockReference,
    slashConfig: [
        {
            icon: <FilePlus2 className="h-4 w-4" />,
            text: "新建页面并引用",
            slash: '/createPage',
            action: (editor) => {
                editor.commands.insertContent({
                    type: BlockReference.name,
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
                    type: BlockReference.name,
                    attrs: {
                        type: "CHILD"
                    }
                })
            }
        }
    ]
}