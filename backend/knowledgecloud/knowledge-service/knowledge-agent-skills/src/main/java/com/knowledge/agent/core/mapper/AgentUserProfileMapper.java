package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentUserProfileEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Owner-scoped SQL access for {@code agent_user_profile}. Every query carries
 * both {@code tenant_id} and {@code user_id}; callers must never pass a
 * client-supplied owner.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentUserProfileMapper extends BaseMapper<AgentUserProfileEntity> {

    @Select("SELECT * FROM agent_user_profile "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND status = 'active' "
            + "ORDER BY confidence DESC, last_seen DESC LIMIT #{limit}")
    List<AgentUserProfileEntity> selectActive(@Param("tenantId") Long tenantId,
                                              @Param("userId") Long userId,
                                              @Param("limit") int limit);

    @Select("SELECT * FROM agent_user_profile "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "ORDER BY dimension ASC, confidence DESC, last_seen DESC")
    List<AgentUserProfileEntity> selectAll(@Param("tenantId") Long tenantId,
                                           @Param("userId") Long userId);

    @Select("SELECT * FROM agent_user_profile "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND dimension = #{dimension} AND trait_value = #{traitValue}")
    AgentUserProfileEntity selectByKey(@Param("tenantId") Long tenantId,
                                       @Param("userId") Long userId,
                                       @Param("dimension") String dimension,
                                       @Param("traitValue") String traitValue);

    @Select("SELECT * FROM agent_user_profile "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId}")
    AgentUserProfileEntity selectByTraitId(@Param("tenantId") Long tenantId,
                                           @Param("userId") Long userId,
                                           @Param("traitId") String traitId);

    @Select("SELECT COUNT(*) FROM agent_user_profile "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND status = 'active'")
    int countActive(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    /**
     * Idempotent write of one computed trait state. The unique key makes
     * repeated extraction harmless; the caller has already resolved lock /
     * suppression semantics and passes the intended final row.
     */
    @Insert("INSERT INTO agent_user_profile (trait_id, tenant_id, user_id, dimension, trait_value, "
            + "confidence, source, status, locked, evidence_count, first_seen, last_seen, expires_at, "
            + "create_time, update_time) "
            + "VALUES (#{traitId}, #{tenantId}, #{userId}, #{dimension}, #{traitValue}, "
            + "#{confidence}, #{source}, #{status}, #{locked}, #{evidenceCount}, #{firstSeen}, #{lastSeen}, "
            + "#{expiresAt}, #{createTime}, #{updateTime}) "
            + "ON DUPLICATE KEY UPDATE "
            + "confidence = VALUES(confidence), source = VALUES(source), status = VALUES(status), "
            + "locked = VALUES(locked), evidence_count = VALUES(evidence_count), "
            + "last_seen = VALUES(last_seen), expires_at = VALUES(expires_at), "
            + "update_time = VALUES(update_time)")
    void upsertTrait(AgentUserProfileEntity entity);

    /** User edit: change the value and lock the trait so extraction cannot undo it. */
    @Update("UPDATE agent_user_profile SET trait_value = #{traitValue}, confidence = #{confidence}, "
            + "source = 'user', status = 'active', locked = 1, update_time = #{updateTime} "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId}")
    int updateUserTrait(AgentUserProfileEntity entity);

    /** User delete: keep a tombstone at the same unique key so it never comes back. */
    @Update("UPDATE agent_user_profile SET status = 'suppressed', locked = 1, confidence = 0, "
            + "update_time = #{updateTime} "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND trait_id = #{traitId}")
    int suppressByTraitId(@Param("tenantId") Long tenantId,
                          @Param("userId") Long userId,
                          @Param("traitId") String traitId,
                          @Param("updateTime") long updateTime);

    @Delete("DELETE FROM agent_user_profile "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int deleteByOwner(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    @Delete("DELETE FROM agent_user_profile WHERE expires_at > 0 AND expires_at <= #{now}")
    int deleteExpired(@Param("now") long now);
}
