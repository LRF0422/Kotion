package com.knowledge.agent.v2.profile;

import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Auto-records user-profile signals at the end of each agent session.
 *
 * <p>Updates deterministic, cheap signals: interaction count, token totals,
 * preferred model (most-used), detected language, tool usage and skill usage.
 * Declared facts/preferences are handled separately via the {@code remember}
 * tool → {@link UserProfileStore#addFact}/{@code addPreference}.
 */
@Slf4j
@Component
public class ProfileRecorder {

    private final UserProfileStore profileStore;

    public ProfileRecorder(UserProfileStore profileStore) {
        this.profileStore = profileStore;
    }

    /**
     * Record the signals of a finished (or suspended) session. Best-effort:
     * never throws.
     */
    public void record(AgentSession session, String finishReason) {
        AgentIdentity identity = session.getIdentity();
        if (identity == null || identity.getUserId() == null) {
            return;
        }
        try {
            UserProfile profile = profileStore.load(identity.getUserId(), identity.getTenantId());
            profile.setUserId(identity.getUserId());
            profile.setTenantId(identity.getTenantId());
            profile.setInteractionCount(profile.getInteractionCount() + 1);
            profile.setTotalTokens(profile.getTotalTokens()
                    + session.getExecution().getTotalPromptTokens()
                    + session.getExecution().getTotalCompletionTokens());

            // Model usage → most-used model.
            String model = session.getModelName();
            if (model != null && !model.isEmpty()) {
                profile.getModelUsage().merge(model, 1, Integer::sum);
                profile.setPreferredModel(mostUsed(profile.getModelUsage()));
            }

            // Language from the last user message.
            String detected = detectLanguage(session.getExecution().getMessages());
            if (detected != null) {
                profile.setLanguage(detected);
            }

            // Tool usage from assistant tool_calls in the message history.
            for (ConversationMessage msg : session.getExecution().getMessages()) {
                if (!"assistant".equals(msg.getRole()) || msg.getToolCalls() == null) {
                    continue;
                }
                for (ConversationMessage.ToolCallInfo tc : msg.getToolCalls()) {
                    if (tc.getFunctionName() != null) {
                        profile.getToolUsage().merge(tc.getFunctionName(), 1, Integer::sum);
                    }
                }
            }

            // Skill usage from activated skills.
            for (String skill : session.getExecution().getActivatedSkillNames()) {
                profile.getSkillUsage().merge(skill, 1, Integer::sum);
            }

            profileStore.save(profile);
        } catch (Exception e) {
            log.warn("ProfileRecorder failed for session {}: {}",
                    session.getSessionId(), e.getMessage());
        }
    }

    private String mostUsed(Map<String, Integer> usage) {
        return usage.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    /** Heuristic: CJK characters → zh, otherwise en; null when no text. */
    private String detectLanguage(List<ConversationMessage> messages) {
        String lastUser = null;
        for (int i = messages.size() - 1; i >= 0; i--) {
            ConversationMessage m = messages.get(i);
            if ("user".equals(m.getRole()) && m.getContent() != null && !m.getContent().trim().isEmpty()) {
                lastUser = m.getContent();
                break;
            }
        }
        if (lastUser == null) {
            return null;
        }
        int cjk = 0;
        for (int i = 0; i < lastUser.length(); i++) {
            char c = lastUser.charAt(i);
            if (Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN) {
                cjk++;
            }
        }
        return cjk > 0 ? "zh" : "en";
    }
}
