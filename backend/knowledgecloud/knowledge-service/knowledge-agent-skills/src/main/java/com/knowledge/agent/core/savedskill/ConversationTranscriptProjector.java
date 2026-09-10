package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Builds the bounded, sanitized transcript supplied to the skill compiler. */
@Component
public class ConversationTranscriptProjector {

    private static final String FINGERPRINT_VERSION = "saved-skill-transcript:v1\n";
    private static final String OMITTED = "[... earlier conversation items omitted ...]";
    private static final String SAVE_TOOL = "save_conversation_as_skill";

    private final AgentCoreProperties properties;
    private final SecretRedactor redactor;
    private final ExplicitSkillSaveIntentPolicy intentPolicy;

    public ConversationTranscriptProjector(AgentCoreProperties properties,
                                           SecretRedactor redactor,
                                           ExplicitSkillSaveIntentPolicy intentPolicy) {
        this.properties = properties;
        this.redactor = redactor;
        this.intentPolicy = intentPolicy;
    }

    public Projection projectForTool(Checkpoint checkpoint) {
        List<ChatMessage> messages = messages(checkpoint);
        if (!intentPolicy.isExplicit(messages)) {
            throw new IllegalArgumentException("EXPLICIT_SKILL_SAVE_REQUIRED");
        }
        return project(messages);
    }

    public Projection projectCompletedRun(Checkpoint checkpoint) {
        return project(messages(checkpoint));
    }

    private Projection project(List<ChatMessage> messages) {
        List<String> items = new ArrayList<>();
        for (ChatMessage message : messages) {
            if (message == null || message.getRole() == null
                    || "system".equalsIgnoreCase(message.getRole())) {
                continue;
            }
            String role = message.getRole().toLowerCase(java.util.Locale.ROOT);
            if ("assistant".equals(role)) {
                appendAssistant(items, message);
            } else if ("tool".equals(role)) {
                appendTool(items, message);
            } else if ("user".equals(role)) {
                appendText(items, "user", message.getContent(), maxMessageChars());
            }
        }
        if (items.isEmpty()) {
            throw new IllegalArgumentException("EMPTY_SKILL_TRANSCRIPT");
        }
        String transcript = fitBudget(items, maxTranscriptChars());
        return new Projection(transcript, sha256(FINGERPRINT_VERSION + transcript));
    }

    private void appendAssistant(List<String> items, ChatMessage message) {
        boolean saveCall = hasSaveCall(message.getToolCalls());
        if (!saveCall) {
            appendText(items, "assistant", message.getContent(), maxMessageChars());
        }
        if (message.getToolCalls() == null) {
            return;
        }
        for (ChatMessage.ToolCallInfo call : message.getToolCalls()) {
            if (call == null || call.getFunction() == null) {
                continue;
            }
            String name = normalize(call.getFunction().getName());
            if (name.isEmpty() || SAVE_TOOL.equals(name)) {
                continue;
            }
            StringBuilder item = new StringBuilder("[assistant tool] ").append(name);
            String arguments = bounded(call.getFunction().getArguments(), maxToolValueChars());
            if (!arguments.isEmpty()) {
                item.append("\n").append(arguments);
            }
            items.add(item.toString());
        }
    }

    private boolean hasSaveCall(List<ChatMessage.ToolCallInfo> calls) {
        if (calls == null) {
            return false;
        }
        for (ChatMessage.ToolCallInfo call : calls) {
            if (call != null && call.getFunction() != null
                    && SAVE_TOOL.equals(normalize(call.getFunction().getName()))) {
                return true;
            }
        }
        return false;
    }

    private void appendTool(List<String> items, ChatMessage message) {
        String name = normalize(message.getName());
        if (SAVE_TOOL.equals(name)) {
            return;
        }
        String label = name.isEmpty() ? "tool" : "tool:" + name;
        appendText(items, label, message.getContent(), maxToolValueChars());
    }

    private void appendText(List<String> items, String label, String content, int limit) {
        String value = bounded(content, limit);
        if (!value.isEmpty()) {
            items.add("[" + label + "]\n" + value);
        }
    }

    private String bounded(String value, int limit) {
        String normalized = normalize(redactor.redact(value));
        if (normalized.length() <= limit) {
            return normalized;
        }
        return normalized.substring(0, limit) + "\n...[truncated]";
    }

    private String fitBudget(List<String> items, int limit) {
        String joined = String.join("\n\n", items);
        if (joined.length() <= limit) {
            return joined;
        }
        List<String> kept = new ArrayList<>();
        kept.add(items.get(0));
        int used = items.get(0).length() + OMITTED.length() + 4;
        List<String> tail = new ArrayList<>();
        for (int i = items.size() - 1; i > 0; i--) {
            String item = items.get(i);
            if (used + item.length() + 2 > limit) {
                continue;
            }
            tail.add(item);
            used += item.length() + 2;
        }
        Collections.reverse(tail);
        kept.add(OMITTED);
        kept.addAll(tail);
        String result = String.join("\n\n", kept);
        return result.length() <= limit ? result : result.substring(0, limit);
    }

    private List<ChatMessage> messages(Checkpoint checkpoint) {
        if (checkpoint == null || checkpoint.getMessages() == null) {
            return Collections.emptyList();
        }
        return checkpoint.getMessages();
    }

    private int maxTranscriptChars() {
        return clamp(properties.getSavedSkills().getMaxTranscriptChars(), 2000, 100000);
    }

    private int maxMessageChars() {
        return clamp(properties.getSavedSkills().getMaxMessageChars(), 200, 20000);
    }

    private int maxToolValueChars() {
        return clamp(properties.getSavedSkills().getMaxToolOutputChars(), 100, 10000);
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\r\n", "\n")
                .replace('\r', '\n')
                .replaceAll("[\\t\\x0B\\f ]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                hex.append(String.format("%02x", item & 0xff));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to fingerprint skill transcript", e);
        }
    }

    @Data
    @AllArgsConstructor
    public static class Projection {
        private String transcript;
        private String fingerprint;
    }
}
