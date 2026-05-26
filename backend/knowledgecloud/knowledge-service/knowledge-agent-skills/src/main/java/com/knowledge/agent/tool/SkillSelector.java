package com.knowledge.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * LLM-based skill pre-filter.
 *
 * <p>
 * Given the conversation and the list of skills the frontend is willing to
 * activate, pick only those skills that are relevant to the user's latest
 * request. The selected subset is then handed to
 * {@link ProgressiveDiscovery#resolveSkills} for tool resolution and prompt
 * splicing.
 *
 * <p>
 * <b>Optimizations over the original:</b>
 * <ul>
 * <li>For ≤ {@value #FAST_PATH_THRESHOLD} skills, skip the LLM call entirely
 *     — the cost outweighs the benefit for small sets</li>
 * <li>Keyword-based fast path: if the user's message contains skill-specific
 *     keywords, select matching skills without an LLM call</li>
 * <li>Configurable threshold via {@code agent.skill-selector.fast-path-threshold}</li>
 * </ul>
 *
 * <p>
 * Fallback: on any error (LLM failure, timeout, parse error, empty
 * selection) the original, un-filtered skill list is returned so the
 * downstream exact-match resolver still runs.
 */
@Slf4j
@Component
public class SkillSelector {

    /**
     * Default threshold: if the skill set has this many or fewer skills,
     * skip the LLM call entirely.
     */
    static final int FAST_PATH_THRESHOLD = 4;

    private final LlmClientFactory llmClientFactory;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${agent.skill-selector.fast-path-threshold:" + FAST_PATH_THRESHOLD + "}")
    private int fastPathThreshold;

    public SkillSelector(LlmClientFactory llmClientFactory) {
        this.llmClientFactory = llmClientFactory;
    }

    /**
     * Select the relevant subset of {@code skills} for this chat turn.
     *
     * @param messages conversation so far (uses the last user message as intent)
     * @param skills   skills the frontend declared as available
     * @param model    model name to use (same as the main chat)
     * @return the relevant subset, or all {@code skills} on failure
     */
    public List<SkillPayload> select(List<ChatMessage> messages,
            List<SkillPayload> skills,
            String model) {
        if (skills == null || skills.isEmpty()) {
            return skills;
        }
        // Single skill is always selected — no point paying for a discovery call.
        if (skills.size() == 1) {
            return skills;
        }

        // Fast path: for small skill sets, skip the LLM call entirely.
        // The latency and cost of an extra LLM call outweighs the benefit
        // when there are only a few skills to choose from.
        if (skills.size() <= fastPathThreshold) {
            // Try keyword matching first — it's free
            List<SkillPayload> keywordMatched = keywordMatch(messages, skills);
            if (!keywordMatched.isEmpty()) {
                log.info("SkillSelector: keyword fast-path selected {} of {} skill(s)",
                        keywordMatched.size(), skills.size());
                return keywordMatched;
            }
            // If keyword matching returns nothing, just keep all — with
            // only a few skills, the system prompt overhead is minimal.
            log.debug("SkillSelector: skill count {} ≤ threshold {}, keeping all (no keyword match)",
                    skills.size(), fastPathThreshold);
            return skills;
        }

        // Full LLM-based selection for larger skill sets
        List<ChatMessage> conversation = collectConversation(messages);
        if (conversation.isEmpty()) {
            log.debug("SkillSelector: no user message found, keeping all {} skill(s)", skills.size());
            return skills;
        }

        try {
            // Try keyword matching first even for large sets (free optimization)
            List<SkillPayload> keywordMatched = keywordMatch(messages, skills);
            if (keywordMatched.size() == skills.size() || keywordMatched.size() <= fastPathThreshold) {
                // Keyword matching covered everything or narrowed it enough
                log.info("SkillSelector: keyword pre-filter selected {} of {} skill(s), skipping LLM call",
                        keywordMatched.size(), skills.size());
                return keywordMatched.isEmpty() ? skills : keywordMatched;
            }

            String catalog = buildSkillCatalog(skills);
            String systemPrompt = "You are a skill router. Given the conversation so far and a catalog of\n"
                    + "available skills, return a JSON object with a single field `selected` whose value is\n"
                    + "an array of skill names that are relevant to the user's overall intent across the\n"
                    + "whole conversation (with extra weight on the most recent user message).\n"
                    + "Only include skills that are clearly useful. If none apply, return an empty array.\n\n"
                    + "Respond with raw JSON only. No explanation, no markdown fences.\n\n"
                    + "Example: {\"selected\": [\"translation\", \"wiki.search\"]}\n\n"
                    + "Skill catalog:\n" + catalog;

            ChatMessage sys = new ChatMessage();
            sys.setRole("system");
            sys.setContent(systemPrompt);

            List<ChatMessage> reqMessages = new ArrayList<>();
            reqMessages.add(sys);
            reqMessages.addAll(conversation);

            LlmRequest req = LlmRequest.builder()
                    .model(model)
                    .temperature(0)
                    .maxTokens(278)
                    .messages(reqMessages)
                    .toolChoice("none")
                    .stream(false)
                    .build();

            LlmClient client = llmClientFactory.getClientForModel(model);
            LlmResponse resp = client.chat(req);
            if (resp == null || resp.getContent() == null || resp.getContent().isEmpty()) {
                log.warn("SkillSelector: empty LLM response, keeping all skills");
                return skills;
            }

            Set<String> selectedNames = parseSelectedNames(resp.getContent());
            if (selectedNames == null) {
                log.warn("SkillSelector: could not parse LLM response, keeping all skills. raw={}",
                        truncate(resp.getContent(), 200));
                return skills;
            }

            List<SkillPayload> filtered = new ArrayList<>();
            for (SkillPayload s : skills) {
                if (s.getName() != null && selectedNames.contains(s.getName())) {
                    filtered.add(s);
                }
            }
            log.info("SkillSelector: LLM selected {} of {} skill(s): {}",
                    filtered.size(), skills.size(), selectedNames);

            // If nothing selected, fall back to the original list so the agent
            // is not left with zero capability when the router is wrong.
            if (filtered.isEmpty()) {
                log.info("SkillSelector: LLM returned empty selection, keeping all skills as fallback");
                return skills;
            }
            return filtered;
        } catch (Exception e) {
            log.warn("SkillSelector: LLM call failed, falling back to all skills — {}", e.toString());
            return skills;
        }
    }

    // ---- Keyword-based fast path ----

    /**
     * Match skills to the user's message using keywords from skill
     * name, description, and tags. This is a free (no LLM call)
     * heuristic that works well for unambiguous skill names.
     *
     * <p>
     * A skill matches if any of the following is a case-insensitive
     * substring of the user's latest message:
     * <ul>
     * <li>The skill name (split on dots and underscores)</li>
     * <li>Each tag</li>
     * <li>Each significant word in the description (>4 chars)</li>
     * </ul>
     *
     * @return matching skills, or empty list if no keyword matches found
     *         (caller should fall back to all skills)
     */
    private List<SkillPayload> keywordMatch(List<ChatMessage> messages,
            List<SkillPayload> skills) {
        // Get the latest user message text
        String userText = getLatestUserMessage(messages);
        if (userText == null || userText.isEmpty()) {
            return Collections.emptyList();
        }
        String lowerUserText = userText.toLowerCase();

        List<SkillPayload> matched = new ArrayList<>();
        for (SkillPayload skill : skills) {
            if (matchesKeywords(skill, lowerUserText)) {
                matched.add(skill);
            }
        }
        return matched;
    }

    /**
     * Check if a skill's keywords match the user's message.
     */
    private boolean matchesKeywords(SkillPayload skill, String lowerUserText) {
        // Match on skill name (split on dots, underscores, hyphens)
        if (skill.getName() != null) {
            String[] nameParts = skill.getName().split("[._-]");
            for (String part : nameParts) {
                if (part.length() >= 3 && lowerUserText.contains(part.toLowerCase())) {
                    return true;
                }
            }
        }

        // Match on tags
        if (skill.getTags() != null) {
            for (String tag : skill.getTags()) {
                if (tag.length() >= 3 && lowerUserText.contains(tag.toLowerCase())) {
                    return true;
                }
            }
        }

        // Match on significant description words
        if (skill.getDescription() != null) {
            String[] words = skill.getDescription().toLowerCase().split("\\W+");
            for (String word : words) {
                if (word.length() > 4 && lowerUserText.contains(word)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get the latest user message content.
     */
    private String getLatestUserMessage(List<ChatMessage> messages) {
        if (messages == null) {
            return null;
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessage m = messages.get(i);
            if ("user".equalsIgnoreCase(m.getRole()) && m.getContent() != null
                    && !m.getContent().isEmpty()) {
                return m.getContent();
            }
        }
        return null;
    }

    // ---- helpers ----

    /**
     * Collect a clean conversation slice for the selector LLM:
     * keep all {@code user} messages and any plain-text {@code assistant}
     * messages (no tool_calls / no tool results) so the model has the full
     * intent history without noisy tool plumbing.
     *
     * <p>
     * Guarantees the returned list contains at least one {@code user}
     * message; otherwise returns an empty list (caller falls back).
     */
    private List<ChatMessage> collectConversation(List<ChatMessage> messages) {
        List<ChatMessage> result = new ArrayList<>();
        if (messages == null || messages.isEmpty()) {
            return result;
        }
        boolean hasUser = false;
        for (ChatMessage m : messages) {
            if (m == null || m.getRole() == null) {
                continue;
            }
            String role = m.getRole().toLowerCase();
            String content = m.getContent();
            if ("user".equals(role) && content != null && !content.isEmpty()) {
                ChatMessage copy = new ChatMessage();
                copy.setRole("user");
                copy.setContent(content);
                result.add(copy);
                hasUser = true;
            } else if ("assistant".equals(role)
                    && content != null && !content.isEmpty()
                    && (m.getToolCalls() == null || m.getToolCalls().isEmpty())) {
                ChatMessage copy = new ChatMessage();
                copy.setRole("assistant");
                copy.setContent(content);
                result.add(copy);
            }
            // skip system / tool / assistant-with-tool_calls messages
        }
        if (!hasUser) {
            return Collections.emptyList();
        }
        // Ensure the last message is a user message so the LLM treats it as the
        // current turn. Trim any trailing assistant tail.
        while (!result.isEmpty()
                && !"user".equalsIgnoreCase(result.get(result.size() - 1).getRole())) {
            result.remove(result.size() - 1);
        }
        return result;
    }

    private String buildSkillCatalog(List<SkillPayload> skills) throws Exception {
        List<Map<String, Object>> items = new ArrayList<>();
        for (SkillPayload s : skills) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", s.getName());
            item.put("description", s.getDescription() != null ? s.getDescription() : "");
            if (s.getTags() != null && !s.getTags().isEmpty()) {
                item.put("tags", s.getTags());
            }
            items.add(item);
        }
        return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(items);
    }

    private Set<String> parseSelectedNames(String raw) {
        String trimmed = stripCodeFences(raw).trim();
        try {
            JsonNode node = objectMapper.readTree(trimmed);
            JsonNode arr = node.isArray() ? node : node.get("selected");
            if (arr == null || !arr.isArray()) {
                return null;
            }
            Set<String> names = new LinkedHashSet<>();
            for (JsonNode n : arr) {
                if (n.isTextual()) {
                    names.add(n.asText());
                }
            }
            return names;
        } catch (Exception e) {
            return null;
        }
    }

    private String stripCodeFences(String s) {
        if (s == null) {
            return "";
        }
        String trimmed = s.trim();
        if (trimmed.startsWith("```")) {
            int firstNewline = trimmed.indexOf('\n');
            if (firstNewline > 0) {
                trimmed = trimmed.substring(firstNewline + 1);
            }
            if (trimmed.endsWith("```")) {
                trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
        }
        return trimmed;
    }

    private String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
