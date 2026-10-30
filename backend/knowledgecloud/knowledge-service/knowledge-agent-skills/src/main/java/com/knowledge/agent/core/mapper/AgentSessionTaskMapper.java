package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentSessionTaskEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Owner-scoped SQL access for {@code agent_session_task}.
 *
 * <p>The table is a whole-snapshot read model: a write is an upsert of the
 * snapshot's items followed by a delete of the session's rows that are no
 * longer in it (see {@code SessionTaskStore#replaceSnapshot}). Every statement
 * is keyed by {@code (tenant_id, user_id, session_id)} so a session id can never
 * leak across owners.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentSessionTaskMapper extends BaseMapper<AgentSessionTaskEntity> {

    /**
     * Insert one snapshot item, or update its mutable columns. {@code
     * create_time} is never moved by the duplicate branch.
     */
    @Insert("INSERT INTO agent_session_task (tenant_id, user_id, session_id, item_id, title, status, "
            + "sort_index, run_id, create_time, update_time) "
            + "VALUES (#{tenantId}, #{userId}, #{sessionId}, #{itemId}, #{title}, #{status}, "
            + "#{sortIndex}, #{runId}, #{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE "
            + "title = VALUES(title), "
            + "status = VALUES(status), "
            + "sort_index = VALUES(sort_index), "
            + "run_id = VALUES(run_id), "
            + "update_time = VALUES(update_time)")
    void upsert(AgentSessionTaskEntity entity);

    /**
     * Delete the session's rows whose item id is no longer part of the snapshot.
     * The caller must pass a non-empty id list (the empty snapshot is a plain
     * {@link #deleteSession}).
     */
    @Delete("<script>"
            + "DELETE FROM agent_session_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND session_id = #{sessionId} "
            + "AND item_id NOT IN "
            + "<foreach collection=\"itemIds\" item=\"itemId\" open=\"(\" separator=\",\" close=\")\">"
            + "#{itemId}"
            + "</foreach>"
            + "</script>")
    int deleteMissing(@Param("tenantId") Long tenantId,
                      @Param("userId") Long userId,
                      @Param("sessionId") String sessionId,
                      @Param("itemIds") List<String> itemIds);

    /** Delete every task row of one session (empty snapshot / session deletion). */
    @Delete("DELETE FROM agent_session_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND session_id = #{sessionId}")
    int deleteSession(@Param("tenantId") Long tenantId,
                      @Param("userId") Long userId,
                      @Param("sessionId") String sessionId);

    /**
     * The owner's unfinished tasks across sessions, most recently written first.
     * {@code id} breaks ties so paging/ordering stays stable.
     */
    @Select("SELECT id, tenant_id, user_id, session_id, item_id, title, status, sort_index, run_id, "
            + "create_time, update_time "
            + "FROM agent_session_task "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND status IN ('pending', 'in_progress') "
            + "ORDER BY update_time DESC, id ASC LIMIT #{limit}")
    List<AgentSessionTaskEntity> selectOpenByOwner(@Param("tenantId") Long tenantId,
                                                    @Param("userId") Long userId,
                                                    @Param("limit") int limit);
}
