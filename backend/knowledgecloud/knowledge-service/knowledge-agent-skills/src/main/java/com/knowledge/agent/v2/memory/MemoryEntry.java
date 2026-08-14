package com.knowledge.agent.v2.memory;

import java.util.List;

/**
 * A single long-term memory entry, scoped to a (user, tenant).
 *
 * <p>Round-trips through Jackson (Redis JSON value / MySQL row) with the field
 * names matching both tiers so no translation layer is needed.
 */
public class MemoryEntry {

    /** Unique id (UUID); null until persisted. */
    private String memoryId;

    /** Scope key, e.g. {@code u:<userId>:t:<tenantId>}. */
    private String scope;

    private Long userId;

    private Long tenantId;

    /** fact | preference | note */
    private String type;

    private String content;

    /** Importance 0-100 (higher = more salient, retrieved first). */
    private int importance;

    /** Optional tags for recall matching. */
    private List<String> tags;

    private long createTime;

    private long updateTime;

    private long lastAccessTime;

    public MemoryEntry() {
    }

    public String getMemoryId() {
        return memoryId;
    }

    public void setMemoryId(String memoryId) {
        this.memoryId = memoryId;
    }

    public String getScope() {
        return scope;
    }

    public void setScope(String scope) {
        this.scope = scope;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public int getImportance() {
        return importance;
    }

    public void setImportance(int importance) {
        this.importance = importance;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public long getCreateTime() {
        return createTime;
    }

    public void setCreateTime(long createTime) {
        this.createTime = createTime;
    }

    public long getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(long updateTime) {
        this.updateTime = updateTime;
    }

    public long getLastAccessTime() {
        return lastAccessTime;
    }

    public void setLastAccessTime(long lastAccessTime) {
        this.lastAccessTime = lastAccessTime;
    }
}
