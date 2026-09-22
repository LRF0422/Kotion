package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentUserProfileEvidenceEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** Owner-scoped SQL access for {@code agent_user_profile_evidence}. */
@InterceptorIgnore(tenantLine = "true")
public interface AgentUserProfileEvidenceMapper extends BaseMapper<AgentUserProfileEvidenceEntity> {

    @Select("SELECT * FROM agent_user_profile_evidence "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId} "
            + "ORDER BY observed_at DESC LIMIT #{limit}")
    List<AgentUserProfileEvidenceEntity> selectByTrait(@Param("tenantId") Long tenantId,
                                                       @Param("userId") Long userId,
                                                       @Param("traitId") String traitId,
                                                       @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM agent_user_profile_evidence "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId}")
    int countByTrait(@Param("tenantId") Long tenantId,
                     @Param("userId") Long userId,
                     @Param("traitId") String traitId);

    @Delete("DELETE FROM agent_user_profile_evidence "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId}")
    int deleteByTrait(@Param("tenantId") Long tenantId,
                      @Param("userId") Long userId,
                      @Param("traitId") String traitId);

    /**
     * Keep at most {@code keep} newest evidence rows for one trait. MySQL
     * cannot LIMIT inside a DELETE with a subquery on the same table, so the
     * nested derived table forces materialization first.
     */
    @Delete("DELETE FROM agent_user_profile_evidence WHERE tenant_id = #{tenantId} "
            + "AND user_id = #{userId} AND trait_id = #{traitId} AND id NOT IN ("
            + "  SELECT id FROM ("
            + "    SELECT id FROM agent_user_profile_evidence "
            + "    WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId} "
            + "    ORDER BY observed_at DESC, id DESC LIMIT #{keep}"
            + "  ) kept)")
    int trimByTrait(@Param("tenantId") Long tenantId,
                    @Param("userId") Long userId,
                    @Param("traitId") String traitId,
                    @Param("keep") int keep);

    @Delete("DELETE FROM agent_user_profile_evidence "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int deleteByOwner(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    @Delete("DELETE FROM agent_user_profile_evidence WHERE create_time > 0 AND create_time < #{cutoff}")
    int deleteOlderThan(@Param("cutoff") long cutoff);
}
