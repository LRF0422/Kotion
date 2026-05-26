package com.knowledge.core.log.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.core.log.entity.LogErrorDO;
import com.knowledge.core.log.model.LogError;
import com.knowledge.core.log.model.LogErrorVo;

@Mapper
public interface LogErrorConverter extends IConverter<LogErrorDO, LogError, LogErrorVo> {

    LogErrorConverter INSTANCE = Mappers.getMapper(LogErrorConverter.class);

}
