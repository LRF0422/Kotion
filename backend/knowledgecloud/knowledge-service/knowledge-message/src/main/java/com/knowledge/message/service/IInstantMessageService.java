package com.knowledge.message.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.message.domain.InstantMessage;
import com.knowledge.message.domain.vo.ConversationVO;

import java.util.List;

/**
 * Instant Message Service Interface
 */
public interface IInstantMessageService extends IService<InstantMessage> {

    /**
     * Send a new instant message
     *
     * @param senderId    Sender user ID
     * @param receiverId  Receiver user ID
     * @param content     Message content
     * @param contentType Content type (TEXT, IMAGE, FILE, etc.)
     * @return Saved message
     */
    InstantMessage sendMessage(Long senderId, Long receiverId, String content, String contentType);

    /**
     * Send a new instant message with extra data
     *
     * @param senderId         Sender user ID
     * @param receiverId       Receiver user ID
     * @param content          Message content
     * @param contentType      Content type
     * @param replyToMessageId Reply to message ID (optional)
     * @param extraData        Extra data in JSON format (optional)
     * @return Saved message
     */
    InstantMessage sendMessage(Long senderId, Long receiverId, String content, String contentType,
            Long replyToMessageId, String extraData);

    /**
     * Get unread messages for a user
     *
     * @param userId User ID
     * @return List of unread messages
     */
    List<InstantMessage> getUnreadMessages(Long userId);

    /**
     * Get unread message count for a user
     *
     * @param userId User ID
     * @return Unread count
     */
    int getUnreadCount(Long userId);

    /**
     * Mark a message as read
     *
     * @param messageId Message ID
     * @param userId    User ID (to verify receiver)
     */
    void markAsRead(Long messageId, Long userId);

    /**
     * Mark multiple messages as read
     *
     * @param messageIds List of message IDs
     * @param userId     User ID
     */
    void markAsRead(List<Long> messageIds, Long userId);

    /**
     * Mark all messages from a sender (or all messages) as read
     *
     * @param receiverId Receiver user ID
     * @param senderId   Sender user ID (null to mark all)
     * @return Number of messages marked as read
     */
    int markAllAsRead(Long receiverId, Long senderId);

    /**
     * Mark a message as delivered
     *
     * @param messageId Message ID
     */
    void markAsDelivered(Long messageId);

    /**
     * Get conversation messages (paginated)
     *
     * @param userId      Current user ID
     * @param otherUserId The other user ID in conversation
     * @param pageNum     Page number
     * @param pageSize    Page size
     * @return Paginated messages
     */
    IPage<InstantMessage> getConversationMessages(Long userId, Long otherUserId, int pageNum, int pageSize);

    /**
     * Get all conversations for a user
     *
     * @param userId User ID
     * @return List of conversations
     */
    List<ConversationVO> getConversations(Long userId);

    /**
     * Delete a message (soft delete)
     *
     * @param messageId Message ID
     * @param userId    User ID (must be sender or receiver)
     * @return true if deleted
     */
    boolean deleteMessage(Long messageId, Long userId);

    /**
     * Clear conversation history
     *
     * @param userId      Current user ID
     * @param otherUserId The other user ID
     * @return Number of messages deleted
     */
    int clearConversation(Long userId, Long otherUserId);
}
