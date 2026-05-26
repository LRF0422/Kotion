package com.knowledge.wiki.service.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.dto.QueryBlockVersionDTO;
import com.knowledge.wiki.service.entity.vo.BlockVersionVO;

public interface IBlockVersionService extends MPJBaseService<BlockVersion> {

    /**
     * Get all block snapshots at a specific page version by page version ID.
     * (Kept for backward compatibility - prefer getBlocksAtPageVersion)
     *
     * @param pageVersionId the page version ID
     * @return list of block snapshots
     */
    List<BlockVersion> getBlocksAtVersion(Long pageVersionId);

    /**
     * Get all block snapshots at a specific page version by page version number.
     *
     * @param pageId      the page ID
     * @param pageVersion the page version number (e.g., "1", "2")
     * @return list of block snapshots
     */
    List<BlockVersion> getBlocksAtPageVersion(Long pageId, String pageVersion);

    /**
     * Get version history for a specific block.
     *
     * @param blockId the block ID
     * @return list of block versions ordered by version desc
     */
    List<BlockVersion> getBlockHistory(String blockId);

    /**
     * Get paginated block version history with flexible filtering.
     * Supports filtering by blockId, pageId, pageVersionId, pageVersion, and type.
     *
     * @param dto query parameters with pagination
     * @return paginated block version VO list
     */
    IPage<BlockVersionVO> getBlockVersionHistory(QueryBlockVersionDTO dto);

}
