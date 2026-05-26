package com.knowledge.system.converter;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.permission.Resource;
import com.knowledge.system.domain.permission.dto.ResourceDTO;
import com.knowledge.system.domain.permission.vo.ResourceVO;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import java.util.List;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ResourceConverter extends IConverter<Resource, ResourceDTO, ResourceVO> {

	ResourceConverter INSTANCE = Mappers.getMapper(ResourceConverter.class);

}
