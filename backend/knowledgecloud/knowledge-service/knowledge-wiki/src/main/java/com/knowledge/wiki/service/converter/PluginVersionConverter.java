package com.knowledge.wiki.service.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.dto.PluginVersionDTO;
import com.knowledge.wiki.service.entity.vo.PluginVersionVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface PluginVersionConverter extends IConverter<PluginVersion, PluginVersionDTO, PluginVersionVO> {

    PluginVersionConverter INSTANCE = Mappers.getMapper(PluginVersionConverter.class);

}
