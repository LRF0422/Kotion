package com.knowledge.agentcore.memory;

import com.knowledge.agentcore.entity.AgentLongMemoryEntity;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * One long-term memory entry (domain model).
 */
@Data
public class MemoryEntry {

    private String memoryId;

    /** Scope key: u:{userId} / u:{userId}:s:{spaceId} / u:{userId}:s:{spaceId}:p:{pageId} */
    private String scope;

    private Long userId;

    private Long tenantId;

    private String spaceId;

    private String pageId;

    /** fact | preference | note | episode */
    private String type = "note";

    private String content;

    /** Importance score (0-100). */
    private int importance;

    private List<String> tags = new ArrayList<>();

    /** Reserved: external embedding store reference. */
    private String embeddingRef;

    private long createTime;

    private long updateTime;

    private long lastAccessTime;

    public static MemoryEntry fromEntity(AgentLongMemoryEntity entity) {
        MemoryEntry entry = new MemoryEntry();
        entry.setMemoryId(entity.getMemoryId());
        entry.setScope(entity.getScope());
        entry.setUserId(entity.getUserId());
        entry.setTenantId(entity.getTenantId());
        entry.setSpaceId(entity.getSpaceId());
        entry.setPageId(entity.getPageId());
        entry.setType(entity.getType());
        entry.setContent(entity.getContent());
        entry.setImportance(entity.getImportance() != null ? entity.getImportance() : 0);
        entry.setEmbeddingRef(entity.getEmbeddingRef());
        if (entity.getTags() != null && !entity.getTags().isEmpty()) {
            for (String tag : entity.getTags().split(",")) {
                if (tag != null && !tag.trim().isEmpty()) {
                    entry.getTags().add(tag.trim());
                }
            }
        }
        entry.setCreateTime(entity.getCreateTime() != null ? entity.getCreateTime() : 0);
        entry.setUpdateTime(entity.getUpdateTime() != null ? entity.getUpdateTime() : 0);
        entry.setLastAccessTime(entity.getLastAccessTime() != null ? entity.getLastAccessTime() : 0);
        return entry;
    }

    public AgentLongMemoryEntity toEntity() {
        AgentLongMemoryEntity entity = new AgentLongMemoryEntity();
        entity.setMemoryId(memoryId);
        entity.setScope(scope);
        entity.setUserId(userId);
        entity.setTenantId(tenantId);
        entity.setSpaceId(spaceId);
        entity.setPageId(pageId);
        entity.setType(type);
        entity.setContent(content);
        entity.setImportance(importance);
        entity.setTags(tags.isEmpty() ? null : String.join(",", tags));
        entity.setEmbeddingRef(embeddingRef);
        entity.setCreateTime(createTime);
        entity.setUpdateTime(updateTime);
        entity.setLastAccessTime(lastAccessTime);
        return entity;
    }
}
