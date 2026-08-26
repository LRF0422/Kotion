package com.knowledge.wiki.service.converter;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.dto.PluginDTO;
import com.knowledge.wiki.service.entity.vo.PluginVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface PluginConverter extends IConverter<Plugin, PluginDTO, PluginVO> {

    PluginConverter INSTANCE = Mappers.getMapper(PluginConverter.class);

    @Override
    @Mapping(target = "tags", ignore = true)
    PluginVO convertVO(Plugin entity);

}
