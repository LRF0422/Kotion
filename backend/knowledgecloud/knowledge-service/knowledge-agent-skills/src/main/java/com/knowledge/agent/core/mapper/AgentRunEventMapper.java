package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentRunEventEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis-Plus mapper for the {@code agent_run_event} cold-tier event log.
 * Append-only; replay reads by (run_id, seq) ascending.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentRunEventMapper extends BaseMapper<AgentRunEventEntity> {

    @Insert("INSERT INTO agent_run_event (run_id, seq, event_type, payload, create_time) " +
            "VALUES (#{runId}, #{seq}, #{eventType}, #{payload}, #{createTime})")
    void insertEvent(AgentRunEventEntity entity);

    @Select("SELECT * FROM agent_run_event WHERE run_id = #{runId} AND seq > #{afterSeq} " +
            "ORDER BY seq ASC LIMIT #{limit}")
    List<AgentRunEventEntity> selectAfterSeq(@Param("runId") String runId,
                                             @Param("afterSeq") long afterSeq,
                                             @Param("limit") int limit);

    @Select("SELECT COALESCE(MAX(seq), 0) FROM agent_run_event WHERE run_id = #{runId}")
    long selectMaxSeq(@Param("runId") String runId);

    /** Retain the most recent {@code keep} events per run (cold-tier trim). */
    @org.apache.ibatis.annotations.Delete("DELETE FROM agent_run_event WHERE run_id = #{runId} " +
            "AND seq <= (SELECT m FROM (SELECT COALESCE(MAX(seq), 0) - #{keep} AS m " +
            "FROM agent_run_event WHERE run_id = #{runId}) t)")
    int trimTail(@Param("runId") String runId, @Param("keep") int keep);
}
