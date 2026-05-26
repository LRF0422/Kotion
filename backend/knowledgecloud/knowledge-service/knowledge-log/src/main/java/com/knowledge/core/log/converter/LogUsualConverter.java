package com.knowledge.core.log.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.core.log.entity.LogUsualDO;
import com.knowledge.core.log.model.LogUsual;
import com.knowledge.core.log.model.LogUsualVo;

@Mapper
public interface LogUsualConverter extends IConverter<LogUsualDO, LogUsual, LogUsualVo> {

    LogUsualConverter INSTANCE = Mappers.getMapper(LogUsualConverter.class);

}
