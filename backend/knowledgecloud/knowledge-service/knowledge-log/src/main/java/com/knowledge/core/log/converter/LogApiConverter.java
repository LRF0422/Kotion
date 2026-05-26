package com.knowledge.core.log.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.core.log.entity.LogApiDO;
import com.knowledge.core.log.model.LogApi;
import com.knowledge.core.log.model.LogApiVo;

@Mapper
public interface LogApiConverter extends IConverter<LogApiDO, LogApi, LogApiVo> {

    LogApiConverter INSTANCE = Mappers.getMapper(LogApiConverter.class);

}