package com.knowledge.agent.core.profile;

import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Builds the optional 【用户画像】 block injected into the volatile context
 * tail (never the cacheable system prefix). This is an enhancement only: any
 * failure or missing consent yields no lines rather than failing a run.
 */
@Slf4j
@Component
public class ProfileInjector {

    private final ProfileStore store;
    private final ProfileMerger merger;
    private final AgentCoreProperties properties;

    public ProfileInjector(ProfileStore store, ProfileMerger merger, AgentCoreProperties properties) {
        this.store = store;
        this.merger = merger;
        this.properties = properties;
    }

    /** Injection lines, e.g. {@code "职业: 后端工程师 (82)"}; empty when disabled. */
    public List<String> buildLines(Long tenantId, Long userId) {
        AgentCoreProperties.Profile config = properties.getProfile();
        if (!config.isEnabled() || tenantId == null || userId == null) {
            return Collections.emptyList();
        }
        try {
            if (!store.isConsentGiven(tenantId, userId)) {
                return Collections.emptyList();
            }
            long now = System.currentTimeMillis();
            List<ProfileTrait> usable = new ArrayList<>();
            for (ProfileTrait trait : store.listActive(tenantId, userId, 100)) {
                if (merger.isUsable(trait, now, config.getInjectMinConfidence())) {
                    usable.add(trait);
                }
            }
            usable.sort(Comparator.comparingInt(ProfileTrait::getConfidence).reversed());

            int maxChars = Math.max(80, config.getInjectMaxChars());
            List<String> lines = new ArrayList<>();
            int used = 0;
            int limit = Math.min(usable.size(), Math.max(1, config.getInjectTopK()));
            for (int i = 0; i < limit; i++) {
                ProfileTrait trait = usable.get(i);
                ProfileDimension dimension = ProfileDimension.fromKey(trait.getDimension());
                String label = dimension != null ? dimension.getLabel() : trait.getDimension();
                String line = label + ": " + trait.getTraitValue() + " (" + trait.getConfidence() + ")";
                if (used + line.length() > maxChars) {
                    break;
                }
                lines.add(line);
                used += line.length();
            }
            return lines;
        } catch (Exception e) {
            log.warn("profile injection failed for {}:{}: {}", tenantId, userId, e.getMessage());
            return Collections.emptyList();
        }
    }
}
