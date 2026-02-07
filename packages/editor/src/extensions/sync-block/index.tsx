import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { SyncBlock } from "./sync-block";
import { BlocksIcon } from "@kn/icon";
import { uuidv4 } from "lib0/random";

export { SyncBlock, type SyncBlockOptions, type SyncBlockAttributes } from "./sync-block";
export { SyncBlockView } from "./SyncBlock";

/**
 * SyncBlock Extension
 *
 * Provides synchronized block functionality where content is shared
 * across multiple pages via real-time collaboration.
 */
export const SyncBlockExtension: ExtensionWrapper = {
    name: SyncBlock.name,
    extendsion: SyncBlock,
    slashConfig: [
        {
            icon: <BlocksIcon className="h-4 w-4" />,
            text: 'Sync Block',
            slash: '/sync',
            action: (editor) => {
                const blockId = uuidv4();
                editor.commands.insertSyncBlock({
                    id: blockId,
                    blockId: blockId,
                    init: true,
                });
            },
        },
    ],
};