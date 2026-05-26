package com.knowledge.wiki.service.converter;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.wiki.service.entity.PluginConfig;
import com.knowledge.wiki.service.entity.dto.PluginConfigDTO;
import com.knowledge.wiki.service.entity.vo.PluginConfigVO;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.factory.Mappers;

@Mapper
public interface PluginConfigConverter extends IConverter<PluginConfig, PluginConfigDTO, PluginConfigVO> {

    PluginConfigConverter INSTANCE = Mappers.getMapper(PluginConfigConverter.class);

    @Mapping(source = "createTime", target = "createdAt")
    @Mapping(source = "updateTime", target = "updatedAt")
    PluginConfigVO convertVO(PluginConfig entity);
}
