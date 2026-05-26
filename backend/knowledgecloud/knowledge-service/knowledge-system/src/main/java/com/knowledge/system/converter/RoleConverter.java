package com.knowledge.system.converter;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.vo.RoleVO;
import com.knowledge.system.dto.RoleDTO;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface RoleConverter extends IConverter<Role, RoleDTO, RoleVO> {

	RoleConverter INSTANCE = Mappers.getMapper(RoleConverter.class);

	com.knowledge.system.vo.RoleFO convert2ClientVO(Role role);

	List<com.knowledge.system.vo.RoleFO> convert2ClientVO(List<Role> roles);
}
