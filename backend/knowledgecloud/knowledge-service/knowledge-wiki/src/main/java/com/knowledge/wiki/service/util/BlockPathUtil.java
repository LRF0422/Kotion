package com.knowledge.wiki.service.util;

import java.util.ArrayList;
import java.util.List;

import com.knowledge.wiki.service.entity.PageContent;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;

/**
 * 块路径工具类
 * 处理块在文档树中的路径表示和解析
 */
public class BlockPathUtil {

    private static final String PATH_SEPARATOR = ".";
    private static final String FULL_PATH_SEPARATOR = "/";

    /**
     * 构建块的路径
     * 
     * @param parentPath   父路径
     * @param currentIndex 当前索引
     * @return 完整路径
     */
    public static String buildPath(String parentPath, int currentIndex) {
        if (StrUtil.isBlank(parentPath)) {
            return String.valueOf(currentIndex);
        }
        return parentPath + PATH_SEPARATOR + currentIndex;
    }

    /**
     * 解析路径为索引数组
     * 
     * @param path 路径字符串
     * @return 索引数组
     */
    public static int[] parsePathToIndices(String path) {
        if (StrUtil.isBlank(path)) {
            return new int[0];
        }

        String[] parts = path.split("\\.");
        int[] indices = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            try {
                indices[i] = Integer.parseInt(parts[i]);
            } catch (NumberFormatException e) {
                indices[i] = 0;
            }
        }
        return indices;
    }

    /**
     * 根据路径在文档树中查找块
     * 
     * @param root 根节点
     * @param path 路径
     * @return 找到的块，未找到返回null
     */
    public static PageContent findBlockByPath(PageContent root, String path) {
        if (root == null || StrUtil.isBlank(path)) {
            return null;
        }

        int[] indices = parsePathToIndices(path);
        PageContent current = root;

        for (int i = 0; i < indices.length; i++) {
            int index = indices[i];

            if (CollUtil.isEmpty(current.getContent())) {
                return null;
            }

            if (index < 0 || index >= current.getContent().size()) {
                return null;
            }

            current = current.getContent().get(index);

            // 如果不是最后一个索引，继续向下查找
            if (i < indices.length - 1) {
                if (current.getContent() == null) {
                    return null;
                }
            }
        }

        return current;
    }

    /**
     * 根据块ID在文档树中查找路径
     * 
     * @param root    根节点
     * @param blockId 块ID
     * @return 路径字符串，未找到返回null
     */
    public static String findPathByBlockId(PageContent root, String blockId) {
        if (root == null || StrUtil.isBlank(blockId)) {
            return null;
        }

        PathFinder finder = new PathFinder(blockId);
        finder.findPath(root, "");
        return finder.getFoundPath();
    }

    /**
     * 内部路径查找器
     */
    private static class PathFinder {
        private final String targetBlockId;
        private String foundPath;

        public PathFinder(String targetBlockId) {
            this.targetBlockId = targetBlockId;
        }

        public boolean findPath(PageContent content, String currentPath) {
            if (content == null) {
                return false;
            }

            // 检查当前节点
            if (targetBlockId.equals(content.getId()) || targetBlockId.equals(content.getAttrId())) {
                this.foundPath = currentPath;
                return true;
            }

            // 递归检查子节点
            if (CollUtil.isNotEmpty(content.getContent())) {
                for (int i = 0; i < content.getContent().size(); i++) {
                    String newPath = buildPath(currentPath, i);
                    if (findPath(content.getContent().get(i), newPath)) {
                        return true;
                    }
                }
            }

            return false;
        }

        public String getFoundPath() {
            return foundPath;
        }
    }

    /**
     * 获取块的父级路径
     * 
     * @param path 完整路径
     * @return 父级路径
     */
    public static String getParentPath(String path) {
        if (StrUtil.isBlank(path)) {
            return null;
        }

        int lastSeparator = path.lastIndexOf(PATH_SEPARATOR);
        if (lastSeparator == -1) {
            return "";
        }

        return path.substring(0, lastSeparator);
    }

    /**
     * 获取路径的最后一级索引
     * 
     * @param path 路径
     * @return 最后一级索引
     */
    public static int getLastIndex(String path) {
        if (StrUtil.isBlank(path)) {
            return -1;
        }

        int lastSeparator = path.lastIndexOf(PATH_SEPARATOR);
        String lastIndexStr = lastSeparator == -1 ? path : path.substring(lastSeparator + 1);

        try {
            return Integer.parseInt(lastIndexStr);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /**
     * 构建完整路径（包含页面ID）
     * 
     * @param pageId 页面ID
     * @param path   块路径
     * @return 完整路径
     */
    public static String buildFullPath(Long pageId, String path) {
        return pageId + FULL_PATH_SEPARATOR + path;
    }

    /**
     * 解析完整路径
     * 
     * @param fullPath 完整路径
     * @return [pageId, blockPath] 数组
     */
    public static String[] parseFullPath(String fullPath) {
        if (StrUtil.isBlank(fullPath)) {
            return new String[] { "", "" };
        }

        int separatorIndex = fullPath.indexOf(FULL_PATH_SEPARATOR);
        if (separatorIndex == -1) {
            return new String[] { fullPath, "" };
        }

        String pageId = fullPath.substring(0, separatorIndex);
        String blockPath = fullPath.substring(separatorIndex + 1);
        return new String[] { pageId, blockPath };
    }

    /**
     * 获取路径深度
     * 
     * @param path 路径
     * @return 深度（层级数）
     */
    public static int getPathDepth(String path) {
        if (StrUtil.isBlank(path)) {
            return 0;
        }
        return path.split("\\.").length;
    }

}