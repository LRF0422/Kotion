package com.knowledge.message.converter;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.message.api.dto.CreateMessageDTO;
import com.knowledge.message.domain.KnowledgeMessage;
import com.knowledge.message.domain.vo.MessageVO;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import java.util.List;

@Mapper
public interface MessageConverter {

    MessageConverter INSTANCE = Mappers.getMapper(MessageConverter.class);

    MessageVO convert(KnowledgeMessage message);

    List<MessageVO> convert(List<KnowledgeMessage> messages);

    Page<MessageVO> convert(IPage<KnowledgeMessage> page);

    List<KnowledgeMessage> convertList(List<CreateMessageDTO.CreateMessageDetail> message);
}
