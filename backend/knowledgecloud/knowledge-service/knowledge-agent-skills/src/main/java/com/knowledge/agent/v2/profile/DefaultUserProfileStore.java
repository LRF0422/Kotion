package com.knowledge.agent.v2.profile;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentUserProfileEntity;
import com.knowledge.agent.store.mapper.AgentUserProfileMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Redis-primary, JDBC-fallback implementation of {@link UserProfileStore}.
 */
@Slf4j
@Component
public class DefaultUserProfileStore implements UserProfileStore {

    private static final String KEY_PREFIX = "agent:profile:";
    private static final long TTL_DAYS = 7;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AgentUserProfileMapper profileMapper;

    public DefaultUserProfileStore(StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            AgentUserProfileMapper profileMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.profileMapper = profileMapper;
    }

    @Override
    public UserProfile load(Long userId, Long tenantId) {
        UserProfile profile = null;
        try {
            String key = key(userId, tenantId);
            String json = redisTemplate.opsForValue().get(key);
            if (json != null && !json.isEmpty()) {
                profile = objectMapper.readValue(json, UserProfile.class);
            }
        } catch (Exception e) {
            log.warn("UserProfileStore Redis read failed for u={}: {}", userId, e.getMessage());
        }

        if (profile != null) {
            return profile;
        }

        // Cold fallback: JDBC.
        try {
            AgentUserProfileEntity entity = profileMapper.selectOne(
                    new LambdaQueryWrapper<AgentUserProfileEntity>()
                            .eq(AgentUserProfileEntity::getUserId, userId)
                            .eq(AgentUserProfileEntity::getTenantId, tenantId));
            if (entity != null && entity.getProfileJson() != null && !entity.getProfileJson().isEmpty()) {
                profile = objectMapper.readValue(entity.getProfileJson(), UserProfile.class);
                if (profile != null) {
                    // Re-hydrate the Redis hot cache.
                    try {
                        redisTemplate.opsForValue().set(key(userId, tenantId),
                                objectMapper.writeValueAsString(profile), TTL_DAYS, TimeUnit.DAYS);
                    } catch (Exception ignore) {
                    }
                }
            }
        } catch (Exception e) {
            log.warn("UserProfileStore JDBC read failed for u={}: {}", userId, e.getMessage());
        }

        if (profile == null) {
            profile = new UserProfile();
            profile.setUserId(userId);
            profile.setTenantId(tenantId);
        }
        return profile;
    }

    @Override
    public void save(UserProfile profile) {
        if (profile == null || profile.getUserId() == null) {
            return;
        }
        profile.setUpdateTime(System.currentTimeMillis());

        try {
            String json = objectMapper.writeValueAsString(profile);
            redisTemplate.opsForValue().set(
                    key(profile.getUserId(), profile.getTenantId()), json, TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("UserProfileStore Redis write failed for u={}: {}", profile.getUserId(), e.getMessage());
        }

        try {
            profileMapper.upsertByUserTenant(toEntity(profile));
        } catch (Exception e) {
            log.warn("UserProfileStore JDBC write failed for u={}: {}", profile.getUserId(), e.getMessage());
        }
    }

    @Override
    public void addFact(Long userId, Long tenantId, String fact) {
        UserProfile profile = load(userId, tenantId);
        if (!profile.getFacts().contains(fact)) {
            profile.getFacts().add(fact);
            save(profile);
        }
    }

    @Override
    public void addPreference(Long userId, Long tenantId, String preference) {
        UserProfile profile = load(userId, tenantId);
        if (!profile.getPreferences().contains(preference)) {
            profile.getPreferences().add(preference);
            save(profile);
        }
    }

    private AgentUserProfileEntity toEntity(UserProfile profile) {
        AgentUserProfileEntity e = new AgentUserProfileEntity();
        e.setUserId(profile.getUserId());
        e.setTenantId(profile.getTenantId());
        try {
            e.setProfileJson(objectMapper.writeValueAsString(profile));
            e.setToolUsageJson(objectMapper.writeValueAsString(profile.getToolUsage()));
            e.setSkillUsageJson(objectMapper.writeValueAsString(profile.getSkillUsage()));
        } catch (Exception ex) {
            e.setProfileJson(null);
        }
        e.setLanguage(profile.getLanguage());
        e.setPreferredModel(profile.getPreferredModel());
        e.setInteractionCount(profile.getInteractionCount());
        e.setTotalTokens(profile.getTotalTokens());
        long now = System.currentTimeMillis();
        e.setCreateTime(now);
        e.setUpdateTime(now);
        return e;
    }

    private String key(Long userId, Long tenantId) {
        return KEY_PREFIX + "u:" + userId + ":t:" + tenantId;
    }
}
