package com.knowledge.wiki.service.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.vo.BlockVersionVO;

/**
 * Converter between BlockVersion entity and BlockVersionVO.
 * Uses MapStruct for automatic mapping.
 */
@Mapper
public interface BlockVersionConverter {

    BlockVersionConverter INSTANCE = Mappers.getMapper(BlockVersionConverter.class);

    BlockVersionVO convertVO(BlockVersion entity);

    java.util.List<BlockVersionVO> convertVO(java.util.List<BlockVersion> entities);

    /**
     * Convert paginated BlockVersion result to paginated BlockVersionVO.
     */
    default com.baomidou.mybatisplus.extension.plugins.pagination.Page<BlockVersionVO> convertVO(
            com.baomidou.mybatisplus.core.metadata.IPage<BlockVersion> page) {
        if (page == null) {
            return null;
        }
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<BlockVersionVO> voPage = new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        voPage.setRecords(convertVO(page.getRecords()));
        voPage.setTotal(page.getTotal());
        voPage.setSize(page.getSize());
        voPage.setCurrent(page.getCurrent());
        voPage.setPages(page.getPages());
        return voPage;
    }

}
