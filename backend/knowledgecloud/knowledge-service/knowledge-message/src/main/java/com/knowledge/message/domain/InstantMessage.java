package com.knowledge.message.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.message.domain.enums.InstantMessageStatus;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * Instant Message Entity
 * For real-time WebSocket communication
 */
@EqualsAndHashCode(callSuper = true)
@Data
@TableName(value = "knowledge_instant_message", autoResultMap = true)
public class InstantMessage extends TenantItemImpl {

    /**
     * Primary key ID
     */
    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /**
     * Sender user ID
     */
    private Long senderId;

    /**
     * Sender username (denormalized for display)
     */
    private String senderName;

    /**
     * Receiver user ID
     */
    private Long receiverId;

    /**
     * Receiver username (denormalized for display)
     */
    private String receiverName;

    /**
     * Message content
     */
    private String content;

    /**
     * Content type: TEXT, IMAGE, FILE, LINK, etc.
     */
    private String contentType;

    /**
     * Message status: SENT, DELIVERED, READ
     */
    private InstantMessageStatus status;

    /**
     * Time when message was sent
     */
    private LocalDateTime sentTime;

    /**
     * Time when message was delivered to client
     */
    private LocalDateTime deliveredTime;

    /**
     * Time when message was read
     */
    private LocalDateTime readTime;

    /**
     * Conversation ID (for grouping messages between two users)
     * Format: min(senderId, receiverId)_max(senderId, receiverId)
     */
    private String conversationId;

    /**
     * Reference message ID (for reply functionality)
     */
    private Long replyToMessageId;

    /**
     * Extra data in JSON format (for attachments, etc.)
     */
    @TableField(typeHandler = com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler.class)
    private cn.hutool.json.JSONObject extraData;

    /**
     * Generate conversation ID for two users
     */
    public static String generateConversationId(Long userId1, Long userId2) {
        long min = Math.min(userId1, userId2);
        long max = Math.max(userId1, userId2);
        return min + "_" + max;
    }
}
