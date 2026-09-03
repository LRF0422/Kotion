package com.knowledge.filecenter.mapper;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.filecenter.entity.KnowledgeUploadSession;

@Mapper
public interface UploadSessionMapper extends MPJBaseMapper<KnowledgeUploadSession> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT id FROM knowledge_user WHERE id = #{userId} AND is_deleted = 0 FOR UPDATE")
    Long lockUserForUploadQuota(@Param("userId") Long userId);

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM knowledge_upload_session WHERE id = #{id} AND tenant_id = #{tenantId} "
            + "AND user_id = #{userId} AND is_deleted = 0 FOR UPDATE")
    KnowledgeUploadSession selectOwnedForUpdate(@Param("id") Long id, @Param("tenantId") String tenantId,
            @Param("userId") Long userId);

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM knowledge_upload_session WHERE is_deleted = 0 "
            + "AND status IN ('CREATED','UPLOADING','COMPLETING','FAILED','ABORTING') "
            + "AND (expires_at <= #{now} OR max_expires_at <= #{now}) "
            + "ORDER BY expires_at ASC LIMIT #{limit}")
    List<KnowledgeUploadSession> selectExpired(@Param("now") LocalDateTime now, @Param("limit") int limit);

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM knowledge_upload_session WHERE is_deleted = 0 AND status = 'UPLOADING' "
            + "AND last_activity_time <= #{cutoff} ORDER BY last_activity_time ASC LIMIT #{limit}")
    List<KnowledgeUploadSession> selectStaleUploading(@Param("cutoff") LocalDateTime cutoff,
            @Param("limit") int limit);
}
