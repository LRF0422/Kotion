package com.knowledge.message.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.message.domain.InstantMessage;
import com.knowledge.message.domain.dto.MarkAsReadDTO;
import com.knowledge.message.domain.dto.SendInstantMessageDTO;
import com.knowledge.message.domain.vo.ConversationVO;
import com.knowledge.message.service.IInstantMessageService;
import com.knowledge.message.websocket.WebSocketMessage;
import com.knowledge.message.websocket.WebSocketMessageType;
import com.knowledge.message.websocket.WebSocketSessionManager;
import cn.hutool.json.JSONUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

/**
 * Instant Message REST Controller
 * Provides REST API endpoints for messaging functionality
 */
@RestController
@RequestMapping("/instant-message")
@Api(tags = "Instant Message API")
@RequiredArgsConstructor
public class InstantMessageController {

    private final IInstantMessageService instantMessageService;
    private final WebSocketSessionManager sessionManager;

    /**
     * Send a new instant message (REST endpoint)
     */
    @PostMapping("/send")
    @ApiOperation("Send instant message")
    public R<InstantMessage> sendMessage(@Validated @RequestBody SendInstantMessageDTO dto) {
        Long senderId = SecurityContextUtil.getUserId();
        InstantMessage message = instantMessageService.sendMessage(
                senderId,
                dto.getReceiverId(),
                dto.getContent(),
                dto.getContentType(),
                dto.getReplyToMessageId(),
                dto.getExtraData());

        // Send via WebSocket if receiver is online
        WebSocketMessage<InstantMessage> wsMessage = new WebSocketMessage<>();
        wsMessage.setType(WebSocketMessageType.NEW_MESSAGE);
        wsMessage.setData(message);
        boolean delivered = sessionManager.sendMessageToUser(dto.getReceiverId(),
                JSONUtil.toJsonStr(R.data(wsMessage)));

        if (delivered) {
            instantMessageService.markAsDelivered(message.getId());
        }

        return R.data(message);
    }

    /**
     * Get conversation messages
     */
    @GetMapping("/conversation/{userId}")
    @ApiOperation("Get conversation messages with a specific user")
    public R<IPage<InstantMessage>> getConversation(
            @ApiParam("The other user's ID") @PathVariable Long userId,
            @ApiParam("Page number") @RequestParam(defaultValue = "1") Integer pageNum,
            @ApiParam("Page size") @RequestParam(defaultValue = "20") Integer pageSize) {
        Long currentUserId = SecurityContextUtil.getUserId();
        IPage<InstantMessage> page = instantMessageService.getConversationMessages(currentUserId, userId, pageNum,
                pageSize);
        return R.data(page);
    }

    /**
     * Get all conversations
     */
    @GetMapping("/conversations")
    @ApiOperation("Get all conversations for current user")
    public R<List<ConversationVO>> getConversations() {
        Long userId = SecurityContextUtil.getUserId();
        return R.data(instantMessageService.getConversations(userId));
    }

    /**
     * Get unread message count
     */
    @GetMapping("/unread-count")
    @ApiOperation("Get unread message count")
    public R<Integer> getUnreadCount() {
        Long userId = SecurityContextUtil.getUserId();
        return R.data(instantMessageService.getUnreadCount(userId));
    }

    /**
     * Get unread messages
     */
    @GetMapping("/unread")
    @ApiOperation("Get all unread messages")
    public R<List<InstantMessage>> getUnreadMessages() {
        Long userId = SecurityContextUtil.getUserId();
        return R.data(instantMessageService.getUnreadMessages(userId));
    }

    /**
     * Mark messages as read
     */
    @PostMapping("/read")
    @ApiOperation("Mark messages as read")
    public R<Boolean> markAsRead(@RequestBody MarkAsReadDTO dto) {
        Long userId = SecurityContextUtil.getUserId();

        if (dto.getMessageId() != null) {
            instantMessageService.markAsRead(dto.getMessageId(), userId);

            // Notify sender about read status
            InstantMessage message = instantMessageService.getById(dto.getMessageId());
            if (message != null) {
                notifyMessageRead(message.getSenderId(), dto.getMessageId());
            }
        } else if (dto.getMessageIds() != null && !dto.getMessageIds().isEmpty()) {
            instantMessageService.markAsRead(dto.getMessageIds(), userId);

            // Notify senders about read status
            dto.getMessageIds().forEach(msgId -> {
                InstantMessage message = instantMessageService.getById(msgId);
                if (message != null) {
                    notifyMessageRead(message.getSenderId(), msgId);
                }
            });
        } else if (dto.getSenderId() != null) {
            instantMessageService.markAllAsRead(userId, dto.getSenderId());
        } else if (dto.getConversationId() != null) {
            // Parse conversation ID to get sender ID
            String[] parts = dto.getConversationId().split("_");
            if (parts.length == 2) {
                Long userId1 = Long.parseLong(parts[0]);
                Long userId2 = Long.parseLong(parts[1]);
                Long senderId = userId.equals(userId1) ? userId2 : userId1;
                instantMessageService.markAllAsRead(userId, senderId);
            }
        }

        return R.data(true);
    }

    /**
     * Mark all messages as read
     */
    @PostMapping("/read-all")
    @ApiOperation("Mark all messages as read")
    public R<Integer> markAllAsRead() {
        Long userId = SecurityContextUtil.getUserId();
        int count = instantMessageService.markAllAsRead(userId, null);
        return R.data(count);
    }

    /**
     * Delete a message
     */
    @DeleteMapping("/{messageId}")
    @ApiOperation("Delete a message")
    public R<Boolean> deleteMessage(@PathVariable Long messageId) {
        Long userId = SecurityContextUtil.getUserId();
        return R.data(instantMessageService.deleteMessage(messageId, userId));
    }

    /**
     * Clear conversation history
     */
    @DeleteMapping("/conversation/{userId}")
    @ApiOperation("Clear conversation history with a user")
    public R<Integer> clearConversation(@PathVariable Long userId) {
        Long currentUserId = SecurityContextUtil.getUserId();
        return R.data(instantMessageService.clearConversation(currentUserId, userId));
    }

    /**
     * Get online users
     */
    @GetMapping("/online-users")
    @ApiOperation("Get online user IDs")
    public R<Set<Long>> getOnlineUsers() {
        return R.data(sessionManager.getOnlineUserIds());
    }

    /**
     * Check if a user is online
     */
    @GetMapping("/online/{userId}")
    @ApiOperation("Check if a specific user is online")
    public R<Boolean> isUserOnline(@PathVariable Long userId) {
        return R.data(sessionManager.isUserOnline(userId));
    }

    /**
     * Get online user count
     */
    @GetMapping("/online-count")
    @ApiOperation("Get online user count")
    public R<Integer> getOnlineCount() {
        return R.data(sessionManager.getOnlineUserCount());
    }

    /**
     * Helper method to notify sender about message read
     */
    private void notifyMessageRead(Long senderId, Long messageId) {
        WebSocketMessage<Long> readNotification = new WebSocketMessage<>();
        readNotification.setType(WebSocketMessageType.MESSAGE_READ);
        readNotification.setData(messageId);
        sessionManager.sendMessageToUser(senderId, JSONUtil.toJsonStr(R.data(readNotification)));
    }
}
