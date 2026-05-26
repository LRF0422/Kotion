package com.knowledge.system.converter;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.UserGroup;
import com.knowledge.system.domain.dto.UserGroupDTO;
import com.knowledge.system.domain.vo.UserGroupVO;
import com.knowledge.system.vo.UserGroupFO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface UserGroupConverter extends IConverter<UserGroup, UserGroupDTO, UserGroupVO> {

    UserGroupConverter INSTANCE = Mappers.getMapper(UserGroupConverter.class);

    UserGroupFO converter(UserGroup userGroup);

    List<UserGroupFO> convertFO(List<UserGroup> userGroups);

}
