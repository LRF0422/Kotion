import React from "react";
import {
    EyeIcon, Pencil, FolderInput, Copy, Files, Download, Info,
    Trash2, StarIcon, ArrowLeft,
} from "@kn/icon";
import type { FileItem, FileManagerState } from "./FileContext";
import { isPreviewable } from "../../utils/fileUtils";

export interface FileAction {
    key: string;
    label: string;
    icon: React.ReactNode;
    run: () => void;
    destructive?: boolean;
    /** 在该项前插入分隔线(用于下拉/右键菜单分组) */
    separatorBefore?: boolean;
    /** 是否为常用操作 —— 选择栏优先以图标按钮平铺展示 */
    primary?: boolean;
}

/** 构建作用于 `files` 的操作列表 —— 卡片 / 列表 / 右键菜单 / 选择栏 共用此唯一来源 */
export const getFileActions = (files: FileItem[], ctx: FileManagerState): FileAction[] => {
    if (files.length === 0) return [];

    const single = files.length === 1 ? files[0] : null;
    const isTrash = ctx.view === 'trash';
    const ids = files.map((f) => f.id);

    if (isTrash) {
        return [
            {
                key: 'restore',
                label: 'Restore',
                icon: <ArrowLeft className="h-4 w-4" />,
                primary: true,
                run: () => ctx.restoreFiles(ids),
            },
            {
                key: 'purge',
                label: 'Delete forever',
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                separatorBefore: true,
                run: () => ctx.requestPurge(files),
            },
        ];
    }

    const actions: FileAction[] = [];
    const canPreview = !!single && !single.isFolder && isPreviewable(single.name);
    const hasFile = files.some((f) => !f.isFolder);
    const allFavorited = files.every((f) => f.favorite === 1);

    if (canPreview && single) {
        actions.push({
            key: 'preview',
            label: 'Preview',
            icon: <EyeIcon className="h-4 w-4" />,
            primary: true,
            run: () => ctx.requestPreview(single),
        });
    }

    if (single) {
        actions.push({
            key: 'rename',
            label: 'Rename',
            icon: <Pencil className="h-4 w-4" />,
            separatorBefore: canPreview,
            run: () => ctx.requestRename(single),
        });
    }

    actions.push(
        {
            key: 'move',
            label: 'Move to…',
            icon: <FolderInput className="h-4 w-4" />,
            primary: true,
            separatorBefore: !single,
            run: () => ctx.requestMove(files),
        },
        {
            key: 'copy',
            label: 'Copy',
            icon: <Copy className="h-4 w-4" />,
            run: () => ctx.handleCopy(files),
        },
        {
            key: 'duplicate',
            label: 'Duplicate',
            icon: <Files className="h-4 w-4" />,
            run: () => ctx.handleDuplicate(files),
        },
    );

    actions.push({
        key: 'favorite',
        label: allFavorited ? 'Remove from favorites' : 'Add to favorites',
        icon: <StarIcon className={allFavorited ? "h-4 w-4 fill-yellow-400 text-yellow-400" : "h-4 w-4"} />,
        separatorBefore: true,
        run: () => files.forEach((f) => ctx.toggleFavorite(f)),
    });

    if (hasFile) {
        actions.push({
            key: 'download',
            label: 'Download',
            icon: <Download className="h-4 w-4" />,
            primary: true,
            run: () => files.filter((f) => !f.isFolder).forEach((f) => ctx.downloadFile(f)),
        });
    }

    if (single) {
        actions.push({
            key: 'details',
            label: 'Properties',
            icon: <Info className="h-4 w-4" />,
            run: () => ctx.requestDetails(single),
        });
    }

    actions.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        destructive: true,
        primary: true,
        separatorBefore: true,
        run: () => ctx.requestDelete(files),
    });

    return actions;
};
