package com.knowledge.system.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface ClientUserCmdConverter {

	ClientUserCmdConverter INSTANCE = Mappers.getMapper(ClientUserCmdConverter.class);
}
