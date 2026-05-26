package com.knowledge.wiki.service.converter;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.dto.PageDTO;
import com.knowledge.wiki.service.entity.vo.PageVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface PageConverter extends IConverter<Page, PageDTO, PageVO> {

    PageConverter INSTANCE = Mappers.getMapper(PageConverter.class);

    @Mapping(source = "status", target = "status", ignore = true)
    @Mapping(source = "subjectId", target = "id")
    Page convert(PageVersion page);

}
