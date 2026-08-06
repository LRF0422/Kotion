import React, { useEffect, useState } from "react";
import { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { useTranslation } from "@kn/common";

/**
 * CJK Unicode ranges (Han, CJK Extensions A, Compatibility, Hiragana,
 * Katakana, Hangul). Characters in these ranges are counted individually as
 * words — matching how word-count tools handle mixed CJK / Latin text.
 */
const CJK_REGEX =
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;

interface DocStats {
    characters: number;
    words: number;
    blocks: number;
}

function computeStats(editor: Editor): DocStats {
    const text = editor.getText();
    const characters = text.length;

    // Words: count CJK characters individually + Latin / number words.
    const cjkChars = (text.match(CJK_REGEX) || []).length;
    const latinWords = (
        text.replace(CJK_REGEX, " ").match(/[a-zA-Z0-9]+/g) || []
    ).length;
    const words = cjkChars + latinWords;

    // Blocks: count top-level content nodes. The custom Doc schema has
    // 'title block*', so subtract the title node when present; the standard
    // Document schema ('block+') has no title to exclude.
    const doc = editor.state.doc;
    let blocks = doc.content.childCount;
    if (blocks > 0 && doc.content.firstChild?.type.name === "title") {
        blocks -= 1;
    }

    return { characters, words, blocks };
}

/**
 * Bottom status bar showing live document statistics: character count, word
 * count, and block count. Mirrors the layout of the reference screenshot
 * (`Characters 11231 | Words 1659 | Blocks 162`).
 *
 * Updates only on doc-affecting transactions — selection / focus / blur
 * metas are skipped to avoid needless re-renders.
 */
export const EditorStatusBar: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<DocStats>(() => computeStats(editor));

    useEffect(() => {
        const onTx = ({ transaction }: { transaction: Transaction }) => {
            if (!transaction.docChanged) return;
            setStats(computeStats(editor));
        };
        editor.on("transaction", onTx);
        return () => {
            editor.off("transaction", onTx);
        };
    }, [editor]);

    return (
        <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-3 py-1 text-xs text-muted-foreground select-none">
            <span>
                {t("editor.statusBar.characters")}{" "}
                {stats.characters.toLocaleString()}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span>
                {t("editor.statusBar.words")} {stats.words.toLocaleString()}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span>
                {t("editor.statusBar.blocks")} {stats.blocks.toLocaleString()}
            </span>
        </div>
    );
};

export default EditorStatusBar;
