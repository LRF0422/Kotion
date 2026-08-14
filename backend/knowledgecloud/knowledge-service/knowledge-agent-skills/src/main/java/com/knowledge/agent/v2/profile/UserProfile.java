package com.knowledge.agent.v2.profile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A user's agent profile (画像) — structured, per (user, tenant).
 *
 * <p>Two kinds of content:
 * <ul>
 *   <li><b>Auto-recorded signals</b>: language, preferred model, tool/skill
 *       usage counters, interaction/token totals. Updated by
 *       {@link ProfileRecorder} at session end.</li>
 *   <li><b>Declared facts/preferences</b>: appended by the agent via the
 *       {@code remember} tool (type=facts/preference). These are user-curated
 *       and injected verbatim into the system prompt.</li>
 * </ul>
 *
 * <p>Serializes to JSON for the Redis hot cache and the {@code profile_json}
 * MySQL column; the indexed columns mirror the hottest fields.
 */
public class UserProfile {

    private Long userId;
    private Long tenantId;
    private String language;
    private String preferredModel;
    private Map<String, Integer> modelUsage = new LinkedHashMap<>();
    private Map<String, Integer> toolUsage = new LinkedHashMap<>();
    private Map<String, Integer> skillUsage = new LinkedHashMap<>();
    private List<String> facts = new ArrayList<>();
    private List<String> preferences = new ArrayList<>();
    private int interactionCount;
    private int totalTokens;
    private long updateTime;

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

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getPreferredModel() {
        return preferredModel;
    }

    public void setPreferredModel(String preferredModel) {
        this.preferredModel = preferredModel;
    }

    public Map<String, Integer> getModelUsage() {
        return modelUsage;
    }

    public void setModelUsage(Map<String, Integer> modelUsage) {
        this.modelUsage = modelUsage;
    }

    public Map<String, Integer> getToolUsage() {
        return toolUsage;
    }

    public void setToolUsage(Map<String, Integer> toolUsage) {
        this.toolUsage = toolUsage;
    }

    public Map<String, Integer> getSkillUsage() {
        return skillUsage;
    }

    public void setSkillUsage(Map<String, Integer> skillUsage) {
        this.skillUsage = skillUsage;
    }

    public List<String> getFacts() {
        return facts;
    }

    public void setFacts(List<String> facts) {
        this.facts = facts;
    }

    public List<String> getPreferences() {
        return preferences;
    }

    public void setPreferences(List<String> preferences) {
        this.preferences = preferences;
    }

    public int getInteractionCount() {
        return interactionCount;
    }

    public void setInteractionCount(int interactionCount) {
        this.interactionCount = interactionCount;
    }

    public int getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(int totalTokens) {
        this.totalTokens = totalTokens;
    }

    public long getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(long updateTime) {
        this.updateTime = updateTime;
    }
}
