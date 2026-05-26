package com.knowledge.system.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.DictType;
import com.knowledge.system.dto.DictTypeDTO;
import com.knowledge.system.vo.DictTypeVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DictTypeConverter extends IConverter<DictType, DictTypeDTO, DictTypeVO> {

    DictTypeConverter INSTANCE = Mappers.getMapper(DictTypeConverter.class);

}
