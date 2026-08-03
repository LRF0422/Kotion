import { ExtensionWrapper } from "@kn/common";
import { BlockOperations } from "./block-operations";

export { BlockOperations, resolveBlockMove } from "./block-operations";
export type { MoveBlockDirection, MoveBlockPosition, BlockMoveTarget } from "./block-operations";

export const BlockOperationsExtension: ExtensionWrapper = {
    extendsion: [BlockOperations],
    name: BlockOperations.name,
};
