import type { PageTreeNode } from '@kn/common';

export interface PageBreadcrumbItem {
    id: string;
    title: string;
    parentId?: string;
}

/**
 * 从页面树中构建面包屑路径
 */
export const buildPageBreadcrumb = (currentPageId: string, pageTree: PageTreeNode[]): PageBreadcrumbItem[] => {
    if (!currentPageId || !pageTree || pageTree.length === 0) {
        return [];
    }

    return pageTree.map((node) => ({
        id: node.id,
        title: node.title,
        parentId: node.parentId ?? undefined,
    }));
};