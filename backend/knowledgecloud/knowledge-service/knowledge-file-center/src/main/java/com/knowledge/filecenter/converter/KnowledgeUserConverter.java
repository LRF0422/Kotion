package com.knowledge.filecenter.converter;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.system.vo.UserVO;

@Mapper
public interface KnowledgeUserConverter {

    KnowledgeUserConverter INSTANCE = Mappers.getMapper(KnowledgeUserConverter.class);

    @Mapping(source = "id", target = "userId")
    KnowledgeUser convert(UserVO vo);

}
