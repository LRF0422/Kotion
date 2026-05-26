package com.knowledge.system.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.DictData;
import com.knowledge.system.dto.DictDataDTO;
import com.knowledge.system.vo.DictDataVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DictDataConverter extends IConverter<DictData, DictDataDTO, DictDataVO> {

    DictDataConverter INSTANCE = Mappers.getMapper(DictDataConverter.class);

}
