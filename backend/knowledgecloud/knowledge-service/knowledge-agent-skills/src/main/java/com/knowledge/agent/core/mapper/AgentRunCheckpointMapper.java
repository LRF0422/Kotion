package com.knowledge.agentcore.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agentcore.entity.AgentRunCheckpointEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * MyBatis-Plus mapper for the {@code agent_run_checkpoint} table. Only the
 * latest snapshot per run is kept (recovery needs just one).
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentRunCheckpointMapper extends BaseMapper<AgentRunCheckpointEntity> {

    @Insert("INSERT INTO agent_run_checkpoint (run_id, seq, state_json, create_time) " +
            "VALUES (#{runId}, #{seq}, #{stateJson}, #{createTime}) " +
            "ON DUPLICATE KEY UPDATE seq = VALUES(seq), state_json = VALUES(state_json), " +
            "create_time = VALUES(create_time)")
    void upsertByRunId(AgentRunCheckpointEntity entity);

    @Select("SELECT * FROM agent_run_checkpoint WHERE run_id = #{runId}")
    AgentRunCheckpointEntity selectByRunId(@Param("runId") String runId);
}
