package com.knowledge.message.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.message.domain.InstantMessage;
import com.knowledge.message.domain.enums.InstantMessageStatus;
import com.knowledge.message.domain.vo.ConversationVO;
import com.knowledge.message.mapper.InstantMessageMapper;
import com.knowledge.message.service.IInstantMessageService;
import com.knowledge.message.websocket.WebSocketSessionManager;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.system.vo.UserVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Instant Message Service Implementation
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InstantMessageServiceImpl extends ServiceImpl<InstantMessageMapper, InstantMessage>
        implements IInstantMessageService {

    private final WebSocketSessionManager sessionManager;
    private final IUserClient userClient;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public InstantMessage sendMessage(Long senderId, Long receiverId, String content, String contentType) {
        return sendMessage(senderId, receiverId, content, contentType, null, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public InstantMessage sendMessage(Long senderId, Long receiverId, String content, String contentType,
            Long replyToMessageId, String extraData) {
        InstantMessage message = new InstantMessage();
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setContent(content);
        message.setContentType(contentType != null ? contentType : "TEXT");
        message.setStatus(InstantMessageStatus.SENT);
        message.setSentTime(LocalDateTime.now());
        message.setConversationId(InstantMessage.generateConversationId(senderId, receiverId));
        message.setReplyToMessageId(replyToMessageId);

        // Set sender and receiver names from feign client
        try {
            KnowledgeUser sender = userClient.getUserById(senderId).getData();
            KnowledgeUser receiver = userClient.getUserById(receiverId).getData();
            if (sender != null) {
                message.setSenderName(sender.getUserName());
            }
            if (receiver != null) {
                message.setReceiverName(receiver.getUserName());
            }
        } catch (Exception e) {
            log.warn("Failed to get user info: {}", e.getMessage());
        }

        // Parse extra data if provided
        if (StrUtil.isNotBlank(extraData)) {
            try {
                message.setExtraData(JSONUtil.parseObj(extraData));
            } catch (Exception e) {
                log.warn("Failed to parse extraData: {}", extraData);
            }
        }

        save(message);
        log.info("Message saved: id={}, from={} to={}", message.getId(), senderId, receiverId);
        return message;
    }

    @Override
    public List<InstantMessage> getUnreadMessages(Long userId) {
        return list(new LambdaQueryWrapper<InstantMessage>()
                .eq(InstantMessage::getReceiverId, userId)
                .ne(InstantMessage::getStatus, InstantMessageStatus.READ)
                .orderByAsc(InstantMessage::getSentTime));
    }

    @Override
    public int getUnreadCount(Long userId) {
        return baseMapper.getUnreadCount(userId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markAsRead(Long messageId, Long userId) {
        LambdaUpdateWrapper<InstantMessage> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(InstantMessage::getId, messageId)
                .eq(InstantMessage::getReceiverId, userId)
                .ne(InstantMessage::getStatus, InstantMessageStatus.READ)
                .set(InstantMessage::getStatus, InstantMessageStatus.READ)
                .set(InstantMessage::getReadTime, LocalDateTime.now());
        update(updateWrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markAsRead(List<Long> messageIds, Long userId) {
        if (messageIds == null || messageIds.isEmpty()) {
            return;
        }
        LambdaUpdateWrapper<InstantMessage> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.in(InstantMessage::getId, messageIds)
                .eq(InstantMessage::getReceiverId, userId)
                .ne(InstantMessage::getStatus, InstantMessageStatus.READ)
                .set(InstantMessage::getStatus, InstantMessageStatus.READ)
                .set(InstantMessage::getReadTime, LocalDateTime.now());
        update(updateWrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int markAllAsRead(Long receiverId, Long senderId) {
        if (senderId != null) {
            return baseMapper.markAllAsReadBySender(receiverId, senderId);
        } else {
            return baseMapper.markAllAsRead(receiverId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markAsDelivered(Long messageId) {
        LambdaUpdateWrapper<InstantMessage> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(InstantMessage::getId, messageId)
                .eq(InstantMessage::getStatus, InstantMessageStatus.SENT)
                .set(InstantMessage::getStatus, InstantMessageStatus.DELIVERED)
                .set(InstantMessage::getDeliveredTime, LocalDateTime.now());
        update(updateWrapper);
    }

    @Override
    public IPage<InstantMessage> getConversationMessages(Long userId, Long otherUserId, int pageNum, int pageSize) {
        String conversationId = InstantMessage.generateConversationId(userId, otherUserId);
        Page<InstantMessage> page = new Page<>(pageNum, pageSize);

        return page(page, new LambdaQueryWrapper<InstantMessage>()
                .eq(InstantMessage::getConversationId, conversationId)
                .orderByDesc(InstantMessage::getSentTime));
    }

    @Override
    public List<ConversationVO> getConversations(Long userId) {
        List<ConversationVO> conversations = baseMapper.getConversations(userId);

        // Get unread counts for each conversation
        List<Map<String, Object>> unreadCounts = baseMapper.getUnreadCountsByConversation(userId);
        Map<String, Integer> unreadCountMap = unreadCounts.stream()
                .collect(Collectors.toMap(
                        m -> String.valueOf(m.get("conversation_id")),
                        m -> ((Number) m.get("count")).intValue()));

        // Set unread counts and online status
        for (ConversationVO conversation : conversations) {
            conversation.setUnreadCount(unreadCountMap.getOrDefault(conversation.getConversationId(), 0));
            conversation.setIsOnline(sessionManager.isUserOnline(conversation.getUserId()));
        }

        return conversations;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteMessage(Long messageId, Long userId) {
        InstantMessage message = getById(messageId);
        if (message == null) {
            return false;
        }

        // Only sender or receiver can delete
        if (!message.getSenderId().equals(userId) && !message.getReceiverId().equals(userId)) {
            return false;
        }

        return removeById(messageId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int clearConversation(Long userId, Long otherUserId) {
        String conversationId = InstantMessage.generateConversationId(userId, otherUserId);

        LambdaQueryWrapper<InstantMessage> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(InstantMessage::getConversationId, conversationId)
                .and(w -> w.eq(InstantMessage::getSenderId, userId)
                        .or()
                        .eq(InstantMessage::getReceiverId, userId));

        // Use logical delete
        List<InstantMessage> messages = list(queryWrapper);
        if (!messages.isEmpty()) {
            List<Long> ids = messages.stream()
                    .map(InstantMessage::getId)
                    .collect(Collectors.toList());
            removeByIds(ids);
            return ids.size();
        }
        return 0;
    }
}
