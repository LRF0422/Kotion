import { useCallback, useMemo, useRef } from 'react';
import type { FileItem, SelectionModifiers } from '../editor-extensions/component/FileContext';
import { resolveNextSelection } from '../utils/file-selection';

interface UseFileSelectionOptions {
    multiple?: boolean;
    isItemSelectable?: (item: FileItem) => boolean;
}

/**
 * Finder / Explorer 风格的选择逻辑。
 *
 * 普通文件管理默认支持 Ctrl/Cmd 与 Shift 多选；选择器可通过 `multiple=false`
 * 强制单选，并通过 `isItemSelectable` 阻止不符合 target/accept 的条目进入状态。
 */
export const useFileSelection = (
    selectedFiles: FileItem[],
    setSelectFiles: React.Dispatch<React.SetStateAction<FileItem[]>>,
    options: UseFileSelectionOptions = {},
) => {
    const { multiple = true, isItemSelectable = () => true } = options;
    const anchorId = useRef<string | null>(null);
    const selectedIds = useMemo(
        () => new Set(selectedFiles.map((file) => file.id)),
        [selectedFiles],
    );

    const isSelected = useCallback(
        (id: string) => selectedIds.has(id),
        [selectedIds],
    );

    const selectItem = useCallback(
        (item: FileItem, modifiers: SelectionModifiers, orderedItems: FileItem[]) => {
            if (!isItemSelectable(item)) return;

            setSelectFiles((current) => resolveNextSelection({
                selectedFiles: current,
                item,
                modifiers,
                orderedItems,
                anchorId: anchorId.current,
                multiple,
                selectable: isItemSelectable,
            }));

            if (!modifiers.shiftKey || !anchorId.current) {
                anchorId.current = item.id;
            }
        },
        [isItemSelectable, multiple, setSelectFiles],
    );

    const toggleSelect = useCallback(
        (item: FileItem, checked: boolean) => {
            if (!isItemSelectable(item)) return;
            anchorId.current = item.id;
            setSelectFiles((current) => {
                if (!checked) return current.filter((file) => file.id !== item.id);
                if (!multiple) return [item];
                return current.some((file) => file.id === item.id)
                    ? current
                    : [...current, item];
            });
        },
        [isItemSelectable, multiple, setSelectFiles],
    );

    const resetAnchor = useCallback(() => {
        anchorId.current = null;
    }, []);

    return { isSelected, selectItem, toggleSelect, resetAnchor };
};
