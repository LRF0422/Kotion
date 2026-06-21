import { useCallback, useRef } from 'react';
import type { FileItem, SelectionModifiers } from '../editor-extensions/component/FileContext';

/**
 * Finder / Explorer 风格的选择逻辑。
 *
 * - 单击           → 选中该项,清除其余
 * - Ctrl/Cmd+单击  → 切换该项的选中状态
 * - Shift+单击     → 以上一个锚点为起点,做范围选择
 *
 * 选中态本身由调用方持有的 `selectedFiles` 维护,本 hook 只负责计算下一份选择
 * 并通过 `setSelectFiles` 写回。范围选择以传入的 `orderedItems`(当前可见顺序)为准。
 */
export const useFileSelection = (
    selectedFiles: FileItem[],
    setSelectFiles: React.Dispatch<React.SetStateAction<FileItem[]>>,
) => {
    // 上一次「锚点」条目 —— Shift 范围选择的起点
    const anchorId = useRef<string | null>(null);

    const isSelected = useCallback(
        (id: string) => selectedFiles.some((f) => f.id === id),
        [selectedFiles],
    );

    const selectItem = useCallback(
        (item: FileItem, modifiers: SelectionModifiers, orderedItems: FileItem[]) => {
            const multi = !!(modifiers.ctrlKey || modifiers.metaKey);
            const range = !!modifiers.shiftKey;

            if (range && anchorId.current) {
                const from = orderedItems.findIndex((it) => it.id === anchorId.current);
                const to = orderedItems.findIndex((it) => it.id === item.id);
                if (from !== -1 && to !== -1) {
                    const [start, end] = from <= to ? [from, to] : [to, from];
                    setSelectFiles(orderedItems.slice(start, end + 1));
                    return;
                }
            }

            if (multi) {
                anchorId.current = item.id;
                setSelectFiles((prev) =>
                    prev.some((f) => f.id === item.id)
                        ? prev.filter((f) => f.id !== item.id)
                        : [...prev, item],
                );
                return;
            }

            // 普通单击:选中并替换
            anchorId.current = item.id;
            setSelectFiles([item]);
        },
        [setSelectFiles],
    );

    /** 复选框勾选 —— 始终为「累加/移除」语义,且更新锚点 */
    const toggleSelect = useCallback(
        (item: FileItem, checked: boolean) => {
            anchorId.current = item.id;
            setSelectFiles((prev) =>
                checked
                    ? prev.some((f) => f.id === item.id)
                        ? prev
                        : [...prev, item]
                    : prev.filter((f) => f.id !== item.id),
            );
        },
        [setSelectFiles],
    );

    const resetAnchor = useCallback(() => {
        anchorId.current = null;
    }, []);

    return { isSelected, selectItem, toggleSelect, resetAnchor };
};
