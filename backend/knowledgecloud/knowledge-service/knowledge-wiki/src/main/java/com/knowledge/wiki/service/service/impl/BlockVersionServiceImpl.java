package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.converter.BlockVersionConverter;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.dto.QueryBlockVersionDTO;
import com.knowledge.wiki.service.entity.vo.BlockVersionVO;
import com.knowledge.wiki.service.mapper.BlockVersionMapper;
import com.knowledge.wiki.service.service.IBlockVersionService;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class BlockVersionServiceImpl extends MPJBaseServiceImpl<BlockVersionMapper, BlockVersion>
        implements IBlockVersionService {

    @Override
    public List<BlockVersion> getBlocksAtVersion(Long pageVersionId) {
        if (pageVersionId == null) {
            return new ArrayList<>();
        }
        return this.lambdaQuery()
                .eq(BlockVersion::getPageVersionId, pageVersionId)
                .orderByAsc(BlockVersion::getSortOrder)
                .list();
    }

    @Override
    public List<BlockVersion> getBlocksAtPageVersion(Long pageId, String pageVersion) {
        if (pageId == null || StrUtil.isBlank(pageVersion)) {
            return new ArrayList<>();
        }
        return this.lambdaQuery()
                .eq(BlockVersion::getPageId, pageId)
                .eq(BlockVersion::getPageVersion, pageVersion)
                .orderByAsc(BlockVersion::getSortOrder)
                .list();
    }

    @Override
    public List<BlockVersion> getBlockHistory(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            return new ArrayList<>();
        }
        return this.lambdaQuery()
                .eq(BlockVersion::getBlockId, blockId)
                .orderByDesc(BlockVersion::getVersion)
                .list();
    }

    @Override
    public IPage<BlockVersionVO> getBlockVersionHistory(QueryBlockVersionDTO dto) {
        IPage<BlockVersion> page = this.lambdaQuery()
                .select(BlockVersion::getId, BlockVersion::getBlockId, BlockVersion::getPageId,
                        BlockVersion::getPageVersionId, BlockVersion::getPageVersion,
                        BlockVersion::getVersion, BlockVersion::getType,
                        BlockVersion::getText, BlockVersion::getParentId,
                        BlockVersion::getPath, BlockVersion::getSortOrder,
                        BlockVersion::getAttrs,
                        BlockVersion::getCreateTime, BlockVersion::getCreateUser)
                .eq(StrUtil.isNotBlank(dto.getBlockId()), BlockVersion::getBlockId, dto.getBlockId())
                .eq(dto.getPageId() != null, BlockVersion::getPageId, dto.getPageId())
                .eq(dto.getPageVersionId() != null, BlockVersion::getPageVersionId, dto.getPageVersionId())
                .eq(StrUtil.isNotBlank(dto.getPageVersion()), BlockVersion::getPageVersion, dto.getPageVersion())
                .eq(StrUtil.isNotBlank(dto.getType()), BlockVersion::getType, dto.getType())
                .orderByDesc(BlockVersion::getCreateTime)
                .page(dto.page());
        return BlockVersionConverter.INSTANCE.convertVO(page);
    }

}
