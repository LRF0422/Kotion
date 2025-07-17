import { ExtensionWrapper } from "@kn/common";
import { CodeBlock } from "./code-block";
import { CodeBlockStaticMenu } from "./menu";
import BuiltInCodeBlock, {
    // CodeBlockOptions
} from "@tiptap/extension-code-block";
import { CodeIcon } from "@kn/icon";
import React from "react";

export * from "./code-block";
export * from "./menu";


export const CodeblockExtension: ExtensionWrapper = {
    extendsion: CodeBlock,
    name: CodeBlock.name,
    menuConfig: {
        group: 'block',
        menu: CodeBlockStaticMenu
    },
    slashConfig: [
        {
            text: 'Code Block',
            slash: '/code-block',
            icon: <CodeIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.toggleCodeBlock()
            }
        }
    ]
}
