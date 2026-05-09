import { ExtensionWrapper } from "@kn/common";
import { BlockOperations } from "./block-operations";

export { BlockOperations } from "./block-operations";

export const BlockOperationsExtension: ExtensionWrapper = {
    extendsion: [BlockOperations],
    name: BlockOperations.name,
};
