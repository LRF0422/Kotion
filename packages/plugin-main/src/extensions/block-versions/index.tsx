import React from 'react'
import { ExtensionWrapper } from '@kn/common'
import { Extension } from '@kn/editor'
import { History } from '@kn/icon'
import { BlockVersionsFloatingUI, openBlockVersionsDialog } from '../../components/BlockVersions'

/**
 * A minimal Tiptap extension that acts as a placeholder so the
 * ExtensionWrapper has a valid `extendsion` field.
 */
const BlockVersions = Extension.create({
    name: 'blockVersions',
})

/**
 * ExtensionWrapper that wires the "Version History" feature into the editor:
 *
 * - `blockMenuConfig`: adds a "Version History" item to the "+" dropdown
 *   on each block. When clicked, it calls `openBlockVersionsDialog(blockId)`.
 *
 * - `floatingUI`: renders `BlockVersionsFloatingUI` which is always mounted
 *   and listens for `openBlockVersionsDialog` calls to show the dialog.
 */
export const BlockVersionsExtension: ExtensionWrapper = {
    name: BlockVersions.name,
    extendsion: BlockVersions,
    blockMenuConfig: [
        {
            icon: <History className="h-4 w-4" />,
            label: 'Version History',
            action: (_editor, node) => {
                const blockId = node.attrs?.id as string | undefined
                if (blockId) {
                    openBlockVersionsDialog(blockId)
                }
            },
        },
    ],
    floatingUI: BlockVersionsFloatingUI,
}
