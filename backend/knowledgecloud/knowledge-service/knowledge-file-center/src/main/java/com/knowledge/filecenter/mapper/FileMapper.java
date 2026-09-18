package com.knowledge.filecenter.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.github.yulichang.base.MPJBaseMapper;
import com.knowledge.filecenter.entity.KnowledgeFile;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface FileMapper extends MPJBaseMapper<KnowledgeFile> {

    /** 某拥有者未删除、未入回收站的文件总占用（存储配额信号）。 */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COALESCE(SUM(size), 0) FROM knowledge_file " +
            "WHERE tenant_id = #{tenantId} AND create_user = #{userId} AND is_deleted = 0 " +
            "AND (trashed IS NULL OR trashed = 0)")
    long sumActiveSize(@Param("tenantId") String tenantId, @Param("userId") Long userId);

    /** 某用户全上下文未删除文件的存储占用（运营用量）。 */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COALESCE(SUM(size), 0) FROM knowledge_file "
            + "WHERE create_user = #{userId} AND is_deleted = 0 AND (trashed IS NULL OR trashed = 0)")
    long sumActiveSizeByUser(@Param("userId") Long userId);
}
