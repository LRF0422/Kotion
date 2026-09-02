import { ExtensionWrapper } from "@kn/common";
import { UnknownInlineNode } from "./unknown-inline-node";
import { UnknownNode } from "./unknown-node";

export const UnknownNodeExtension: ExtensionWrapper = {
    extendsion: [UnknownNode, UnknownInlineNode],
    name: UnknownNode.name,
};
