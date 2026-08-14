package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentTaskEventEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for {@link AgentTaskEventEntity} — cold-tier mirror of a
 * task's durable event log.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentTaskEventMapper extends BaseMapper<AgentTaskEventEntity> {

    @Insert("INSERT INTO agent_task_event (task_id, seq, event_type, payload, create_time) " +
            "VALUES (#{taskId}, #{seq}, #{eventType}, #{payload}, #{createTime}) " +
            "ON DUPLICATE KEY UPDATE payload = VALUES(payload)")
    void upsertByTaskSeq(AgentTaskEventEntity entity);

    @Select("SELECT * FROM agent_task_event WHERE task_id = #{taskId} AND seq > #{afterSeq} " +
            "ORDER BY seq ASC LIMIT #{limit}")
    List<AgentTaskEventEntity> replay(@Param("taskId") String taskId,
                                      @Param("afterSeq") long afterSeq,
                                      @Param("limit") int limit);

    @Select("SELECT MAX(seq) FROM agent_task_event WHERE task_id = #{taskId}")
    Long maxSeq(@Param("taskId") String taskId);

    /** Purge cold-tier rows older than the retention cutoff (epoch millis). */
    @Delete("DELETE FROM agent_task_event WHERE create_time < #{cutoff}")
    int deleteOlderThan(@Param("cutoff") long cutoff);
}
