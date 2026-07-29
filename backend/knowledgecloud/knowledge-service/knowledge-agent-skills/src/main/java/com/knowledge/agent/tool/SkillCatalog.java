package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import lombok.extern.slf4j.Slf4j;

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
 * <p>
 * <b>Per-request lifecycle:</b> This class is NOT a Spring bean. A fresh
 * instance is created at the start of each request by
 * {@code AgentHarness.run()}
 * and passed through {@code ToolContext} to all components that need it.
 * This eliminates the race condition where concurrent requests would corrupt
 * each other's state on a shared singleton.
 *
 * <h3>Lifecycle</h3>
 * <ol>
 * <li>At the start of each request, {@link #seed(List)} is called with
 * the frontend's skill list</li>
 * <li>During the agentic loop, {@link SearchSkillsTool} calls
 * {@link #search(String)} and {@link #activate(String)}</li>
 * </ol>
 */
@Slf4j
public class SkillCatalog {

    /** All skills, keyed by name. */
    private final Map<String, SkillPayload> skills = new ConcurrentHashMap<>();

    /** Skills that have been activated (their tools injected into the loop). */
    private final Set<String> activatedSkills = ConcurrentHashMap.newKeySet();

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
     * return all skills in that domain</li>
     * <li><b>Keyword match</b>: match against skill name, tags, and
     * description words</li>
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
     * Check if any skill in the catalog (activated or not) references the
     * given tool name via its embedded {@code tools} list.
     *
     * <p>
     * Used by the execution loop to produce a helpful
     * error message when the LLM calls a skill tool that hasn't been loaded
     * into {@code frontendToolNames} yet (e.g. same-response as
     * {@code search_skills(activate: ...)}).
     *
     * @param toolName function name of the tool
     * @return {@code true} if any skill's {@code tools} list contains the tool
     */
    public boolean containsTool(String toolName) {
        if (toolName == null || toolName.isEmpty()) {
            return false;
        }
        for (SkillPayload skill : skills.values()) {
            if (skill.getTools() != null) {
                for (ChatTool t : skill.getTools()) {
                    if (t != null && t.getFunction() != null
                            && toolName.equals(t.getFunction().getName())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Find the name of the first skill that references the given tool.
     *
     * @param toolName function name of the tool
     * @return skill name, or {@code null} if no skill references the tool
     */
    public String findSkillNameForTool(String toolName) {
        if (toolName == null || toolName.isEmpty()) {
            return null;
        }
        for (Map.Entry<String, SkillPayload> entry : skills.entrySet()) {
            SkillPayload skill = entry.getValue();
            if (skill.getTools() != null) {
                for (ChatTool t : skill.getTools()) {
                    if (t != null && t.getFunction() != null
                            && toolName.equals(t.getFunction().getName())) {
                        return entry.getKey();
                    }
                }
            }
        }
        return null;
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
