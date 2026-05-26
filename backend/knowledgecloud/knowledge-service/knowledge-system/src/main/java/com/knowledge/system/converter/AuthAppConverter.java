package com.knowledge.system.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.AuthApp;
import com.knowledge.system.domain.dto.AuthAppDTO;
import com.knowledge.system.domain.vo.AuthAppVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface AuthAppConverter extends IConverter<AuthApp, AuthAppDTO, AuthAppVO> {
    
    AuthAppConverter INSTANCE = Mappers.getMapper(AuthAppConverter.class);
}
