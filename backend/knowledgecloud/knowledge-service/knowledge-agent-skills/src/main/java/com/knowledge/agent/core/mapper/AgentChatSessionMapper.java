package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Owner-scoped SQL access for {@code agent_chat_session}.
 *
 * <p>The list query deliberately omits the (potentially large)
 * {@code messages_json} so the session index stays cheap; the detail query
 * selects it.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentChatSessionMapper extends BaseMapper<AgentChatSessionEntity> {

    @Select("SELECT id, session_id, tenant_id, user_id, title, target_page_json, bound_page_json, "
            + "message_count, schema_version, source_run_id, as_of_seq, create_time, update_time "
            + "FROM agent_chat_session "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "ORDER BY update_time DESC, session_id ASC LIMIT #{limit}")
    List<AgentChatSessionEntity> selectOwnedIndex(@Param("tenantId") Long tenantId,
                                                   @Param("userId") Long userId,
                                                   @Param("limit") int limit);

    @Select("SELECT * FROM agent_chat_session "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND session_id = #{sessionId}")
    AgentChatSessionEntity selectOwned(@Param("tenantId") Long tenantId,
                                       @Param("userId") Long userId,
                                       @Param("sessionId") String sessionId);

    /**
     * Insert a session row, or update only its UI metadata (title / @-page
     * bindings / update_time). Existing projected messages are preserved.
     */
    @Insert("INSERT INTO agent_chat_session (session_id, tenant_id, user_id, title, target_page_json, "
            + "bound_page_json, messages_json, message_count, schema_version, source_run_id, as_of_seq, "
            + "create_time, update_time) "
            + "VALUES (#{sessionId}, #{tenantId}, #{userId}, #{title}, #{targetPageJson}, #{boundPageJson}, "
            + "#{messagesJson}, #{messageCount}, 1, #{sourceRunId}, 0, #{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE "
            + "title = VALUES(title), "
            + "target_page_json = VALUES(target_page_json), "
            + "bound_page_json = VALUES(bound_page_json), "
            + "update_time = VALUES(update_time)")
    void upsertMeta(AgentChatSessionEntity entity);

    /**
     * Engine write path: replace the projected transcript (+ its provenance)
     * while preserving the client-owned UI metadata. Inserts the row when the
     * engine produces a session before the client ever opened it.
     */
    @Insert("INSERT INTO agent_chat_session (session_id, tenant_id, user_id, title, target_page_json, "
            + "bound_page_json, messages_json, model_messages_json, message_count, schema_version, "
            + "source_run_id, as_of_seq, create_time, update_time) "
            + "VALUES (#{sessionId}, #{tenantId}, #{userId}, #{title}, #{targetPageJson}, #{boundPageJson}, "
            + "#{messagesJson}, #{modelMessagesJson}, #{messageCount}, #{schemaVersion}, #{sourceRunId}, "
            + "#{asOfSeq}, #{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE "
            + "messages_json = VALUES(messages_json), "
            + "model_messages_json = VALUES(model_messages_json), "
            + "message_count = VALUES(message_count), "
            + "schema_version = VALUES(schema_version), "
            + "source_run_id = VALUES(source_run_id), "
            + "as_of_seq = VALUES(as_of_seq), "
            + "update_time = VALUES(update_time)")
    void upsertTranscript(AgentChatSessionEntity entity);

    /** Explicit user "clear chat": reset the projected transcript. */
    @Update("UPDATE agent_chat_session SET messages_json = '[]', model_messages_json = NULL, "
            + "message_count = 0, source_run_id = NULL, as_of_seq = 0, update_time = #{updateTime} "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND session_id = #{sessionId}")
    int clearTranscript(@Param("tenantId") Long tenantId,
                        @Param("userId") Long userId,
                        @Param("sessionId") String sessionId,
                        @Param("updateTime") long updateTime);

    @Delete("DELETE FROM agent_chat_session "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND session_id = #{sessionId}")
    int deleteOwned(@Param("tenantId") Long tenantId,
                    @Param("userId") Long userId,
                    @Param("sessionId") String sessionId);
}
