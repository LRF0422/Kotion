package com.knowledge.message.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.message.domain.InstantMessage;
import com.knowledge.message.domain.vo.ConversationVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Instant Message Mapper
 */
@Mapper
public interface InstantMessageMapper extends BaseMapper<InstantMessage> {

    /**
     * Get unread message count for a user
     */
    @Select("SELECT COUNT(*) FROM knowledge_instant_message " +
            "WHERE receiver_id = #{userId} AND status != 'READ' AND is_deleted = 0")
    int getUnreadCount(@Param("userId") Long userId);

    /**
     * Get unread message count for a specific conversation
     */
    @Select("SELECT COUNT(*) FROM knowledge_instant_message " +
            "WHERE receiver_id = #{userId} AND sender_id = #{senderId} AND status != 'READ' AND is_deleted = 0")
    int getUnreadCountBySender(@Param("userId") Long userId, @Param("senderId") Long senderId);

    /**
     * Mark all messages from a sender as read
     */
    @Update("UPDATE knowledge_instant_message SET status = 'READ', read_time = NOW() " +
            "WHERE receiver_id = #{receiverId} AND sender_id = #{senderId} AND status != 'READ' AND is_deleted = 0")
    int markAllAsReadBySender(@Param("receiverId") Long receiverId, @Param("senderId") Long senderId);

    /**
     * Mark all messages as read for a user
     */
    @Update("UPDATE knowledge_instant_message SET status = 'READ', read_time = NOW() " +
            "WHERE receiver_id = #{receiverId} AND status != 'READ' AND is_deleted = 0")
    int markAllAsRead(@Param("receiverId") Long receiverId);

    /**
     * Get conversations list for a user
     */
    @Select("<script>" +
            "SELECT " +
            "  conversation_id as conversationId, " +
            "  CASE " +
            "    WHEN sender_id = #{userId} THEN receiver_id " +
            "    ELSE sender_id " +
            "  END as userId, " +
            "  CASE " +
            "    WHEN sender_id = #{userId} THEN receiver_name " +
            "    ELSE sender_name " +
            "  END as userName, " +
            "  content as lastMessageContent, " +
            "  content_type as lastMessageContentType, " +
            "  sent_time as lastMessageTime " +
            "FROM knowledge_instant_message m1 " +
            "WHERE is_deleted = 0 " +
            "  AND (sender_id = #{userId} OR receiver_id = #{userId}) " +
            "  AND sent_time = (" +
            "    SELECT MAX(sent_time) " +
            "    FROM knowledge_instant_message m2 " +
            "    WHERE m2.conversation_id = m1.conversation_id " +
            "      AND m2.is_deleted = 0" +
            "  ) " +
            "ORDER BY sent_time DESC" +
            "</script>")
    List<ConversationVO> getConversations(@Param("userId") Long userId);

    /**
     * Get unread counts grouped by conversation
     */
    @Select("SELECT conversation_id, COUNT(*) as count " +
            "FROM knowledge_instant_message " +
            "WHERE receiver_id = #{userId} AND status != 'READ' AND is_deleted = 0 " +
            "GROUP BY conversation_id")
    List<java.util.Map<String, Object>> getUnreadCountsByConversation(@Param("userId") Long userId);
}
