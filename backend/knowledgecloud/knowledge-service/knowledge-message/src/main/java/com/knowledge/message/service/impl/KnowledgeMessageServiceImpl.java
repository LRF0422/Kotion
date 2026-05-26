package com.knowledge.message.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.message.domain.KnowledgeMessage;
import com.knowledge.message.domain.enums.MessageStatus;
import com.knowledge.message.domain.enums.MessageType;
import com.knowledge.message.mapper.KnowledgeMessageMapper;
import com.knowledge.message.service.IKnowledgeMessageService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class KnowledgeMessageServiceImpl extends ServiceImpl<KnowledgeMessageMapper, KnowledgeMessage>
        implements IKnowledgeMessageService {

}
