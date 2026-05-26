package com.knowledge.wiki.service.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.BlockIndex;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.mapper.BlockIndexMapper;
import com.knowledge.wiki.service.service.IBlockIndexService;
import com.knowledge.wiki.service.service.IPageVersionService;
import com.knowledge.wiki.service.service.impl.BlockStorageService;
import com.knowledge.wiki.service.util.BlockPathUtil;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 块索引服务实现类
 */
@Service
public class BlockIndexServiceImpl extends MPJBaseServiceImpl<BlockIndexMapper, BlockIndex>
        implements IBlockIndexService {

    @Autowired
    private IPageVersionService pageVersionService;

    @Autowired
    private BlockStorageService blockStorageService;

    @Override
    public BlockIndex findByBlockId(String blockId) {
        return this.getOne(new LambdaQueryWrapper<BlockIndex>()
                .eq(BlockIndex::getBlockId, blockId));
    }

    @Override
    public List<BlockIndex> findByPageId(Long pageId) {
        return this.list(new LambdaQueryWrapper<BlockIndex>()
                .eq(BlockIndex::getPageId, pageId)
                .orderByAsc(BlockIndex::getPath));
    }

    @Override
    public BlockIndex findByPath(Long pageId, String path) {
        return this.getOne(new LambdaQueryWrapper<BlockIndex>()
                .eq(BlockIndex::getPageId, pageId)
                .eq(BlockIndex::getPath, path));
    }

    @Override
    public void saveBatchIndexes(List<BlockIndex> indexes) {
        if (indexes != null && !indexes.isEmpty()) {
            this.saveBatch(indexes);
        }
    }

    @Override
    public void deleteByPageId(Long pageId) {
        this.remove(new LambdaQueryWrapper<BlockIndex>()
                .eq(BlockIndex::getPageId, pageId));
    }

    @Override
    public void refreshPageIndex(Long pageId, Long pageVersionId) {
        // 先删除旧的索引
        this.deleteByPageId(pageId);

        // 构建新的索引
        buildPageIndex(pageId, pageVersionId);
    }

    /**
     * 构建页面块索引
     * 
     * @param pageId        页面ID
     * @param pageVersionId 页面版本ID
     */
    private void buildPageIndex(Long pageId, Long pageVersionId) {
        // Get content from block storage instead of PageVersion
        String contentJson = blockStorageService.assembleTreeJson(pageId);
        if (StrUtil.isBlank(contentJson)) {
            return;
        }

        // Parse content
        PageContent rootContent = JSONUtil.toBean(contentJson, PageContent.class);
        if (rootContent == null || CollUtil.isEmpty(rootContent.getContent())) {
            return;
        }

        // Collect all block info
        List<BlockIndex> indexes = new ArrayList<>();
        collectBlockIndexes(rootContent, pageId, pageVersionId, "", null, indexes);

        // Batch save indexes
        if (CollUtil.isNotEmpty(indexes)) {
            this.saveBatch(indexes);
        }
    }

    /**
     * 递归收集块索引信息
     */
    private void collectBlockIndexes(PageContent content, Long pageId, Long pageVersionId,
            String currentPath, String parentId, List<BlockIndex> indexes) {
        if (content == null) {
            return;
        }

        // 创建块索引
        BlockIndex index = new BlockIndex();
        index.setBlockId(content.getId() != null ? content.getId() : content.getAttrId());
        index.setPageId(pageId);
        index.setPageVersionId(pageVersionId);
        index.setType(content.getType());
        index.setPath(currentPath);
        index.setParentId(parentId);
        index.setIsLeaf(CollUtil.isEmpty(content.getContent()));

        // 生成内容摘要
        StringBuilder summary = new StringBuilder();
        if (StrUtil.isNotBlank(content.getText())) {
            summary.append(content.getText());
        } else if (content.getAttrs() != null) {
            summary.append(content.getAttrs().toString());
        }
        index.setContentSummary(StrUtil.maxLength(summary.toString(), 200));

        indexes.add(index);

        // 递归处理子块
        if (CollUtil.isNotEmpty(content.getContent())) {
            String blockId = content.getId() != null ? content.getId() : content.getAttrId();
            for (int i = 0; i < content.getContent().size(); i++) {
                PageContent child = content.getContent().get(i);
                String childPath = BlockPathUtil.buildPath(currentPath, i);
                collectBlockIndexes(child, pageId, pageVersionId, childPath, blockId, indexes);
            }
        }
    }

}