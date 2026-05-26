package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-request catalog of ALL available skills — both the ones the
 * frontend sends and any remote skills registered via SkillController.
 *
 * <p>
 * Unlike the static {@link ToolRegistry}, this catalog is request-scoped:
 * each chat request seeds it with the frontend's {@link SkillPayload}s,
 * and the {@link SearchSkillsTool} queries it to discover and activate
 * skills on demand.
 *
 * <p>
 * The catalog stores the <b>full</b> skill definitions (including
 * {@code tools} and {@code systemPromptFragment}) so that when a skill
 * is activated mid-loop, its tool definitions can be injected into the
 * next LLM iteration's {@code toolsJson}.
 *
 * <h3>Lifecycle</h3>
 * <ol>
 * <li>At the start of each request, {@link #seed(List)} is called with
 *     the frontend's skill list</li>
 * <li>During the agentic loop, {@link SearchSkillsTool} calls
 *     {@link #search(String)} and {@link #activate(String)}</li>
 * <li>At the end of the request, the catalog is cleared</li>
 * </ol>
 */
@Slf4j
@Component
public class SkillCatalog {

    /** All skills, keyed by name. */
    private final Map<String, SkillPayload> skills = new ConcurrentHashMap<>();

    /** Skills that have been activated (their tools injected into the loop). */
    private final Set<String> activatedSkills = new LinkedHashSet<>();

    // ---- Lifecycle ----

    /**
     * Seed the catalog with the frontend's skill list.
     * Called once per request.
     */
    public void seed(List<SkillPayload> frontendSkills) {
        clear();
        if (frontendSkills != null) {
            for (SkillPayload skill : frontendSkills) {
                if (skill.getName() != null) {
                    skills.put(skill.getName(), skill);
                }
            }
        }
        log.debug("SkillCatalog seeded with {} skill(s)", skills.size());
    }

    /**
     * Clear the catalog (end of request).
     */
    public void clear() {
        skills.clear();
        activatedSkills.clear();
    }

    // ---- Search ----

    /**
     * Search the catalog for skills matching the query.
     *
     * <p>
     * Matching strategy (layered, cheapest first):
     * <ol>
     * <li><b>Domain match</b>: if the query contains a known domain keyword,
     *     return all skills in that domain</li>
     * <li><b>Keyword match</b>: match against skill name, tags, and
     *     description words</li>
     * </ol>
     *
     * <p>
     * Already-activated skills are excluded from results (no point
     * activating them again).
     *
     * @param query natural-language description of what the user needs
     * @return matching skills (not yet activated), sorted by relevance
     */
    public List<SkillPayload> search(String query) {
        if (query == null || query.isEmpty() || skills.isEmpty()) {
            return Collections.emptyList();
        }

        String lowerQuery = query.toLowerCase();

        // Score each skill by relevance
        List<ScoredSkill> scored = new ArrayList<>();
        for (SkillPayload skill : skills.values()) {
            if (activatedSkills.contains(skill.getName())) {
                continue; // already active
            }
            int score = scoreSkill(skill, lowerQuery);
            if (score > 0) {
                scored.add(new ScoredSkill(skill, score));
            }
        }

        // Sort by score descending
        scored.sort((a, b) -> Integer.compare(b.score, a.score));

        List<SkillPayload> results = new ArrayList<>();
        for (ScoredSkill ss : scored) {
            results.add(ss.skill);
        }

        log.debug("SkillCatalog.search('{}'): found {} match(es) out of {} available",
                query, results.size(), skills.size() - activatedSkills.size());
        return results;
    }

    /**
     * Score a skill's relevance to the query.
     * Higher score = more relevant.
     */
    private int scoreSkill(SkillPayload skill, String lowerQuery) {
        int score = 0;

        // Domain match (highest weight — deterministic)
        if (skill.getDomain() != null && lowerQuery.contains(skill.getDomain().toLowerCase())) {
            score += 100;
        }

        // Name match (high weight)
        if (skill.getName() != null) {
            String lowerName = skill.getName().toLowerCase();
            // Exact name match
            if (lowerQuery.contains(lowerName)) {
                score += 50;
            }
            // Name part match (split on dots, underscores, hyphens)
            String[] nameParts = lowerName.split("[._-]");
            for (String part : nameParts) {
                if (part.length() >= 3 && lowerQuery.contains(part)) {
                    score += 20;
                }
            }
        }

        // Tag match (medium weight)
        if (skill.getTags() != null) {
            for (String tag : skill.getTags()) {
                if (tag.length() >= 3 && lowerQuery.contains(tag.toLowerCase())) {
                    score += 15;
                }
            }
        }

        // Description keyword match (low weight)
        if (skill.getDescription() != null) {
            String[] descWords = skill.getDescription().toLowerCase().split("\\W+");
            for (String word : descWords) {
                if (word.length() > 4 && lowerQuery.contains(word)) {
                    score += 5;
                }
            }
        }

        return score;
    }

    // ---- Activation ----

    /**
     * Activate a skill by name.
     *
     * @return the activated skill's payload (including tools and
     *         systemPromptFragment), or null if not found
     */
    public SkillPayload activate(String skillName) {
        SkillPayload skill = skills.get(skillName);
        if (skill == null) {
            return null;
        }
        if (activatedSkills.contains(skillName)) {
            return null; // already activated
        }
        activatedSkills.add(skillName);
        log.info("SkillCatalog: activated skill '{}'", skillName);
        return skill;
    }

    /**
     * Get the set of skill names that have been activated so far.
     */
    public Set<String> getActivatedSkillNames() {
        return Collections.unmodifiableSet(activatedSkills);
    }

    /**
     * Check if a skill has been activated.
     */
    public boolean isActivated(String skillName) {
        return activatedSkills.contains(skillName);
    }

    /**
     * Get all skill names in the catalog (activated or not).
     */
    public Set<String> getAllSkillNames() {
        return Collections.unmodifiableSet(skills.keySet());
    }

    /**
     * Get a skill by name.
     */
    public SkillPayload get(String skillName) {
        return skills.get(skillName);
    }

    // ---- Inner class ----

    private static class ScoredSkill {
        final SkillPayload skill;
        final int score;

        ScoredSkill(SkillPayload skill, int score) {
            this.skill = skill;
            this.score = score;
        }
    }
}
