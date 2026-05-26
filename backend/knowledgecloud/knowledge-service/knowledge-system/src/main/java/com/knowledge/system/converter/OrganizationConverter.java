package com.knowledge.system.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.Organization;
import com.knowledge.system.domain.dto.OrganizationDTO;
import com.knowledge.system.domain.vo.OrganizationVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface OrganizationConverter extends IConverter<Organization, OrganizationDTO, OrganizationVO> {

    OrganizationConverter INSTANCE = Mappers.getMapper(OrganizationConverter.class);
    
}
