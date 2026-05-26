package com.knowledge.message.converter;

import com.knowledge.message.api.vo.MailServerConfigVO;
import com.knowledge.message.domain.KnowledgeMailServerConfig;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface MailServerConfigConverter {

    MailServerConfigConverter INSTANCE = Mappers.getMapper(MailServerConfigConverter.class);

    MailServerConfigVO converter(KnowledgeMailServerConfig mailServerConfig);
}
