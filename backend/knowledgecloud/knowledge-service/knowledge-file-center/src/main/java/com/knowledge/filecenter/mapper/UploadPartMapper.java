package com.knowledge.filecenter.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.filecenter.entity.KnowledgeUploadPart;

@Mapper
public interface UploadPartMapper extends MPJBaseMapper<KnowledgeUploadPart> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM knowledge_upload_part WHERE upload_session_id = #{sessionId} "
            + "AND part_number = #{partNumber} AND tenant_id = #{tenantId} AND user_id = #{userId} "
            + "AND is_deleted = 0 FOR UPDATE")
    KnowledgeUploadPart selectOwnedForUpdate(@Param("sessionId") Long sessionId,
            @Param("partNumber") int partNumber, @Param("tenantId") String tenantId,
            @Param("userId") Long userId);
}
