package com.knowledge.wiki.service.converter;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.SpaceDTO;
import com.knowledge.wiki.service.entity.vo.SpaceVO;

@Mapper
public interface SpaceConverter extends IConverter<Space, SpaceDTO, SpaceVO> {

    SpaceConverter INSTANCE = Mappers.getMapper(SpaceConverter.class);

}
