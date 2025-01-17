import { ExtensionWrapper } from "@repo/common";
import { CodeBlock } from "./code-block";
import { CodeBlockStaticMenu } from "./menu";
import BuiltInCodeBlock, {
    // CodeBlockOptions
} from "@tiptap/extension-code-block";

export * from "./code-block";
export * from "./menu";


export const CodeblockExtension: ExtensionWrapper = {
    extendsion: CodeBlock,
    name: CodeBlock.name,
    menuConfig: {
        group: 'block',
        menu: CodeBlockStaticMenu
    }
}
