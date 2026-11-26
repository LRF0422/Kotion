package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentBgTaskLogEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * SQL for {@code agent_bg_task_log}.
 *
 * <p>Sequence allocation is done by the store while holding the task row lock;
 * the mapper only inserts already-numbered rows. The
 * {@code (task_id, batch_id, batch_seq)} unique key makes a retried batch
 * idempotent at the storage layer as well.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentBgTaskLogMapper extends BaseMapper<AgentBgTaskLogEntity> {

    @Insert("<script>"
            + "INSERT INTO agent_bg_task_log "
            + "(task_id, seq, batch_id, batch_seq, kind, level, message, at, create_time) VALUES "
            + "<foreach collection='rows' item='row' separator=','>"
            + "(#{row.taskId}, #{row.seq}, #{row.batchId}, #{row.batchSeq}, "
            + "#{row.kind}, #{row.level}, #{row.message}, #{row.at}, #{row.createTime})"
            + "</foreach>"
            + "</script>")
    int insertBatch(@Param("rows") List<AgentBgTaskLogEntity> rows);

    /** Retry guard: does this client batch already exist? */
    @Select("SELECT COUNT(*) FROM agent_bg_task_log "
            + "WHERE task_id = #{taskId} AND batch_id = #{batchId}")
    int countBatch(@Param("taskId") String taskId, @Param("batchId") String batchId);

    @Select("SELECT * FROM agent_bg_task_log "
            + "WHERE task_id = #{taskId} AND seq > #{sinceSeq} "
            + "ORDER BY seq ASC LIMIT #{limit}")
    List<AgentBgTaskLogEntity> selectSince(@Param("taskId") String taskId,
                                           @Param("sinceSeq") long sinceSeq,
                                           @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM agent_bg_task_log WHERE task_id = #{taskId}")
    long countByTask(@Param("taskId") String taskId);

    /** Ring retention: drop the oldest rows once the task is over its line cap. */
    @Delete("DELETE FROM agent_bg_task_log WHERE task_id = #{taskId} AND seq < #{seq}")
    int deleteBelowSeq(@Param("taskId") String taskId, @Param("seq") long seq);
}