import React, { ElementType, useEffect, useMemo, useState } from "react";
import { ExtensionWrapper } from "@kn/common";
import { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Toggle, Separator, useVirtualKeyboard } from "@kn/ui";
import { Undo2, Redo2 } from "@kn/icon";
import { isArray } from "lodash";

interface MenuRecord {
    block: ElementType[];
    inline: ElementType[];
    custom: ElementType[];
    mark: ElementType[];
}

/**
 * Mobile formatting toolbar that docks just above the on-screen keyboard.
 *
 * It reuses the very same extension menu components the desktop `EditorMenu`
 * renders (bold / heading / list / etc.), so formatting behaviour stays in one
 * place. Visible only while the keyboard is open; the Layout hides the bottom
 * tab bar during that time so the two never overlap.
 */
export const MobileEditorToolbar: React.FC<{
    editor: Editor;
    extensionWrappers: ExtensionWrapper[];
}> = ({ editor, extensionWrappers }) => {
    const { keyboardHeight, isOpen } = useVirtualKeyboard();

    // Re-render on editor transactions so undo/redo enabled state stays fresh.
    // Undo/redo availability only changes on doc-affecting transactions, so
    // gate on `docChanged` — this skips Tiptap's focus/blur metas (which fire
    // every time a Radix Dialog / Sheet / DropdownMenu opens or closes) and
    // selection-only transactions, both of which can't move history state.
    const [, force] = useState(0);
    useEffect(() => {
        const onTx = ({ transaction }: { transaction: Transaction }) => {
            if (!transaction.docChanged) return;
            force((n) => n + 1);
        };
        editor.on("transaction", onTx);
        return () => {
            editor.off("transaction", onTx);
        };
    }, [editor]);

    // Extract menu components grouped the same way EditorMenu does.
    const record = useMemo<MenuRecord>(() => {
        const r: MenuRecord = { block: [], inline: [], custom: [], mark: [] };
        (extensionWrappers || []).forEach((wrapper) => {
            if (!wrapper.menuConfig) return;
            const configs = isArray(wrapper.menuConfig) ? wrapper.menuConfig : [wrapper.menuConfig];
            configs.forEach((config: any) => r[config.group as keyof MenuRecord].push(config.menu));
        });
        return r;
    }, [extensionWrappers]);

    if (!isOpen) return null;

    const renderItems = (items: ElementType[], level: number) =>
        items.map((Com, index) => <Com key={`${level}-${index}`} editor={editor} />);

    const hasExtensions =
        record.mark.length > 0 || record.inline.length > 0 || record.block.length > 0;

    return (
        <div
            // Keep the editor focused/selected when tapping the toolbar.
            onPointerDown={(e) => e.preventDefault()}
            className="fixed inset-x-0 z-50 flex items-center gap-0.5 overflow-x-auto border-t bg-background/95 px-1 py-1 backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ bottom: keyboardHeight }}
        >
            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5">
                <Toggle
                    onClick={() => editor.commands.undo()}
                    size="sm"
                    disabled={!editor.can().undo()}
                    aria-label="Undo"
                    className="h-9 w-9 shrink-0 p-0 data-[disabled=true]:opacity-40"
                >
                    <Undo2 className="h-4 w-4" />
                </Toggle>
                <Toggle
                    onClick={() => editor.commands.redo()}
                    size="sm"
                    disabled={!editor.can().redo()}
                    aria-label="Redo"
                    className="h-9 w-9 shrink-0 p-0 data-[disabled=true]:opacity-40"
                >
                    <Redo2 className="h-4 w-4" />
                </Toggle>
            </div>

            {hasExtensions && <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />}

            {record.mark.length > 0 && (
                <div className="flex shrink-0 items-center gap-0.5">{renderItems(record.mark, 1)}</div>
            )}
            {record.inline.length > 0 && (
                <div className="flex shrink-0 items-center gap-0.5">{renderItems(record.inline, 2)}</div>
            )}
            {record.block.length > 0 && (
                <div className="flex shrink-0 items-center gap-0.5">{renderItems(record.block, 3)}</div>
            )}
        </div>
    );
};

export default MobileEditorToolbar;
