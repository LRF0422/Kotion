package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentThreadEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * MyBatis-Plus mapper for the {@code agent_thread} table.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentThreadMapper extends BaseMapper<AgentThreadEntity> {

    // title/summary survive an upsert that only carries a fresh active-run
    // pointer: a null incoming value means "keep the current one", so creating
    // a new run in an existing conversation no longer erases the session memory.
    @Insert("INSERT INTO agent_thread (thread_id, user_id, tenant_id, title, summary, active_run_id, " +
            "create_time, update_time) " +
            "VALUES (#{threadId}, #{userId}, #{tenantId}, #{title}, #{summary}, #{activeRunId}, " +
            "#{createTime}, #{updateTime}) " +
            "ON DUPLICATE KEY UPDATE " +
            "title = IF(VALUES(title) IS NULL, title, VALUES(title)), " +
            "summary = IF(VALUES(summary) IS NULL, summary, VALUES(summary)), " +
            "active_run_id = VALUES(active_run_id), " +
            "update_time = VALUES(update_time)")
    void upsertByThreadId(AgentThreadEntity entity);

    @Select("SELECT * FROM agent_thread WHERE thread_id = #{threadId}")
    AgentThreadEntity selectByThreadId(@Param("threadId") String threadId);
}
