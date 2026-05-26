package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.BlockIndex;

import java.util.List;

/**
 * 块索引服务接口
 */
public interface IBlockIndexService extends MPJBaseService<BlockIndex> {

    /**
     * 根据块ID查找索引信息
     * 
     * @param blockId 块ID
     * @return 块索引信息
     */
    BlockIndex findByBlockId(String blockId);

    /**
     * 根据页面ID查找所有块索引
     * 
     * @param pageId 页面ID
     * @return 块索引列表
     */
    List<BlockIndex> findByPageId(Long pageId);

    /**
     * 根据路径查找块索引
     * 
     * @param pageId 页面ID
     * @param path   路径
     * @return 块索引信息
     */
    BlockIndex findByPath(Long pageId, String path);

    /**
     * 批量保存块索引
     * 
     * @param indexes 块索引列表
     */
    void saveBatchIndexes(List<BlockIndex> indexes);

    /**
     * 删除指定页面的所有块索引
     * 
     * @param pageId 页面ID
     */
    void deleteByPageId(Long pageId);

    /**
     * 刷新指定页面的块索引
     * 
     * @param pageId        页面ID
     * @param pageVersionId 页面版本ID
     */
    void refreshPageIndex(Long pageId, Long pageVersionId);

}