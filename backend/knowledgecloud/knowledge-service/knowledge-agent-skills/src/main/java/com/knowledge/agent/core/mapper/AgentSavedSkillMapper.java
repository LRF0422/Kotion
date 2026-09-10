package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.knowledge.agent.core.entity.AgentSavedSkillEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** Owner-scoped SQL access for {@code agent_saved_skill}. */
@InterceptorIgnore(tenantLine = "true")
public interface AgentSavedSkillMapper {

    @Select("SELECT * FROM agent_saved_skill "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND skill_id = #{skillId}")
    AgentSavedSkillEntity selectOwnedBySkillId(@Param("tenantId") Long tenantId,
                                                @Param("userId") Long userId,
                                                @Param("skillId") String skillId);

    @Select("SELECT * FROM agent_saved_skill "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND source_fingerprint = #{sourceFingerprint}")
    AgentSavedSkillEntity selectOwnedByFingerprint(@Param("tenantId") Long tenantId,
                                                    @Param("userId") Long userId,
                                                    @Param("sourceFingerprint") String sourceFingerprint);

    @Select({"<script>",
            "SELECT * FROM agent_saved_skill",
            "WHERE tenant_id = #{tenantId} AND user_id = #{userId}",
            "<if test='enabled != null'>AND enabled = #{enabled}</if>",
            "ORDER BY create_time DESC, skill_id ASC",
            "LIMIT #{limit} OFFSET #{offset}",
            "</script>"})
    List<AgentSavedSkillEntity> selectOwnedPage(@Param("tenantId") Long tenantId,
                                                 @Param("userId") Long userId,
                                                 @Param("enabled") Boolean enabled,
                                                 @Param("offset") int offset,
                                                 @Param("limit") int limit);

    @Select("SELECT * FROM agent_saved_skill "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND enabled = 1 "
            + "ORDER BY last_used_time DESC, update_time DESC, skill_id ASC LIMIT #{limit}")
    List<AgentSavedSkillEntity> selectEnabledCandidates(@Param("tenantId") Long tenantId,
                                                        @Param("userId") Long userId,
                                                        @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM agent_saved_skill "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int countOwned(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    @Insert("INSERT IGNORE INTO agent_saved_skill_owner_lock (tenant_id, user_id, create_time) "
            + "VALUES (#{tenantId}, #{userId}, #{createTime})")
    int ensureOwnerLock(@Param("tenantId") Long tenantId,
                        @Param("userId") Long userId,
                        @Param("createTime") long createTime);

    @Select("SELECT create_time FROM agent_saved_skill_owner_lock "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} FOR UPDATE")
    Long lockOwner(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    @Insert("INSERT INTO agent_saved_skill (skill_id, tenant_id, user_id, name, description, trigger_text, "
            + "example_intents_json, tags_json, system_prompt_fragment, required_tool_names_json, "
            + "optional_tool_names_json, source_conversation_id, source_run_id, source_schema_version, "
            + "source_fingerprint, enabled, version, use_count, last_used_time, embedding_ref, "
            + "create_time, update_time) VALUES (#{skillId}, #{tenantId}, #{userId}, #{name}, #{description}, "
            + "#{triggerText}, #{exampleIntentsJson}, #{tagsJson}, #{systemPromptFragment}, "
            + "#{requiredToolNamesJson}, #{optionalToolNamesJson}, #{sourceConversationId}, #{sourceRunId}, "
            + "#{sourceSchemaVersion}, #{sourceFingerprint}, #{enabled}, #{version}, #{useCount}, "
            + "#{lastUsedTime}, #{embeddingRef}, #{createTime}, #{updateTime})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(AgentSavedSkillEntity entity);

    @Update("UPDATE agent_saved_skill SET enabled = #{enabled}, update_time = #{updateTime} "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND skill_id = #{skillId}")
    int updateOwnedEnabled(@Param("tenantId") Long tenantId,
                           @Param("userId") Long userId,
                           @Param("skillId") String skillId,
                           @Param("enabled") boolean enabled,
                           @Param("updateTime") long updateTime);

    @Update("UPDATE agent_saved_skill SET use_count = use_count + 1, "
            + "last_used_time = #{usedAt}, update_time = #{usedAt} "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND skill_id = #{skillId}")
    int incrementOwnedUse(@Param("tenantId") Long tenantId,
                          @Param("userId") Long userId,
                          @Param("skillId") String skillId,
                          @Param("usedAt") long usedAt);

    @Delete("DELETE FROM agent_saved_skill "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND skill_id = #{skillId}")
    int deleteOwned(@Param("tenantId") Long tenantId,
                    @Param("userId") Long userId,
                    @Param("skillId") String skillId);
}
