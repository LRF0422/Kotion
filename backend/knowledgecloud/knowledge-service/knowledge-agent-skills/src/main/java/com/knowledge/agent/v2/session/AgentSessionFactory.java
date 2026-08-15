package com.knowledge.agent.v2.session;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.store.AgentDefinitionService;
import com.knowledge.agent.store.entity.AgentDefinitionEntity;
import com.knowledge.agent.tool.ProgressiveDiscovery;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.memory.MemoryEntry;
import com.knowledge.agent.v2.memory.MemoryStore;
import com.knowledge.agent.v2.profile.UserProfile;
import com.knowledge.agent.v2.profile.UserProfileStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Builds a fully-assembled {@link AgentSession} from a chat request.
 *
 * <p>Extracted from {@code AgentV2Controller} so both the synchronous
 * {@code /chat} endpoint and the async job runner share one canonical path.
 * Responsibilities:
 * <ul>
 *   <li>Convert messages, resolve mode and iteration budget</li>
 *   <li>Merge frontend tools from {@code tools[]} + {@code skills[].tools[]}</li>
 *   <li>Resolve the skill catalog → prompt fragment (spliced into the system
 *       prompt) and keep the full {@code skills} list on the session</li>
 *   <li>Apply a custom agent definition (prompt/model/tool set/budget)</li>
 *   <li>Inject user profile (画像) and recalled long-term memory as leading
 *       system context</li>
 * </ul>
 */
@Slf4j
@Component
public class AgentSessionFactory {

    private final AgentProperties properties;
    private final AgentDefinitionService definitionService;
    private final ProgressiveDiscovery progressiveDiscovery;
    private final ToolRegistry toolRegistry;
    private final MemoryStore memoryStore;
    private final UserProfileStore profileStore;

    public AgentSessionFactory(AgentProperties properties,
            AgentDefinitionService definitionService,
            ProgressiveDiscovery progressiveDiscovery,
            ToolRegistry toolRegistry,
            MemoryStore memoryStore,
            UserProfileStore profileStore) {
        this.properties = properties;
        this.definitionService = definitionService;
        this.progressiveDiscovery = progressiveDiscovery;
        this.toolRegistry = toolRegistry;
        this.memoryStore = memoryStore;
        this.profileStore = profileStore;
    }

    /**
     * Build a session from the request and the resolved identity.
     */
    public AgentSession build(ChatCompletionRequest request, AgentIdentity identity) {
        String conversationId = request.getConversationId() != null
                ? request.getConversationId()
                : UUID.randomUUID().toString();

        List<ConversationMessage> messages = request.getMessages() != null
                ? request.getMessages().stream().map(this::toV2Message).collect(Collectors.toList())
                : new ArrayList<>();

        ExecutionState execution = new ExecutionState();
        execution.setMessages(messages);

        AgentMode mode = "plan".equalsIgnoreCase(request.getMode())
                ? AgentMode.PLAN
                : AgentMode.EXECUTE;

        // Frontend tools + skill prompt fragment from the request catalog.
        SkillResolution resolution = resolveSkills(request);
        List<ChatTool> frontendTools = resolution.tools;

        AgentSession.Builder builder = AgentSession.builder()
                .sessionId(request.getSessionId() != null
                        ? request.getSessionId()
                        : UUID.randomUUID().toString())
                .conversationId(conversationId)
                .traceId(UUID.randomUUID().toString().substring(0, 8))
                .identity(identity)
                .mode(mode)
                .maxIterations(properties.getEngine().getMaxIterations())
                .modelName(request.getModel())
                .frontendTools(frontendTools)
                .skills(resolution.skills)
                .capabilitiesVersion(request.getCapabilitiesVersion())
                .execution(execution);

        applyAgentDefinition(request, identity.getTenantId(), builder, execution);

        AgentSession session = builder.build();

        // Splice the frontend skills' systemPromptFragment into the system prompt.
        if (resolution.promptFragment != null && !resolution.promptFragment.isEmpty()) {
            appendToLeadingSystemMessage(session, resolution.promptFragment);
        }

        // PLAN-mode guidance (second read-only defense layer, see §13.3 of the
        // harness blueprint): make the contract explicit in the system prompt.
        if (mode == AgentMode.PLAN) {
            appendToLeadingSystemMessage(session, "[规划模式] 你处于只读规划模式：只能调研、检索与分析，"
                    + "严禁修改、删除或外发任何内容。完成调研后必须调用 present_plan 提交结构化计划，"
                    + "等待用户批准后才能执行写操作。");
        }

        // Inject user profile + recalled memory as leading context.
        injectPersonalization(session, identity);

        return session;
    }

    // ---- Skill/tool resolution ----

    private SkillResolution resolveSkills(ChatCompletionRequest request) {
        List<ChatTool> merged = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        // 1. Top-level tools[] (legacy path).
        if (request.getTools() != null) {
            for (ChatTool tool : request.getTools()) {
                if (tool != null && tool.getFunction() != null
                        && tool.getFunction().getName() != null
                        && seen.add(tool.getFunction().getName())) {
                    merged.add(tool);
                }
            }
        }

        // 2. ProgressiveDiscovery resolves skills → tools + prompt fragment.
        String promptFragment = "";
        List<SkillPayload> skills = request.getSkills() != null
                ? request.getSkills() : Collections.emptyList();
        if (!skills.isEmpty() && progressiveDiscovery != null) {
            ProgressiveDiscovery.SkillResolution resolution =
                    progressiveDiscovery.resolveSkills(skills, toolRegistry);
            for (ChatTool tool : resolution.getTools()) {
                if (tool != null && tool.getFunction() != null
                        && tool.getFunction().getName() != null
                        && seen.add(tool.getFunction().getName())) {
                    merged.add(tool);
                }
            }
            if (resolution.getPromptFragment() != null) {
                promptFragment = resolution.getPromptFragment();
            }
        }

        return new SkillResolution(merged, skills, promptFragment);
    }

    // ---- Custom agent definition ----

    private void applyAgentDefinition(ChatCompletionRequest request, Long tenantId,
            AgentSession.Builder builder, ExecutionState execution) {
        if (request.getAgentId() == null) {
            return;
        }
        if (definitionService == null) {
            throw new IllegalStateException("Custom agent support is not available");
        }
        AgentDefinitionEntity def = definitionService.get(request.getAgentId(), tenantId);
        if (def == null || Boolean.FALSE.equals(def.getEnabled())) {
            throw new IllegalArgumentException("Agent definition not found or disabled: "
                    + request.getAgentId());
        }

        List<ConversationMessage> messages = execution.getMessages();
        boolean merged = false;
        for (int i = 0; i < messages.size(); i++) {
            ConversationMessage msg = messages.get(i);
            if ("system".equals(msg.getRole())) {
                String frontendPrompt = msg.getContent() != null ? msg.getContent() : "";
                messages.set(i, ConversationMessage.builder()
                        .role("system")
                        .content(def.getSystemPrompt() + "\n\n" + frontendPrompt)
                        .build());
                execution.setMessages(messages);
                merged = true;
                break;
            }
        }
        if (!merged) {
            builder.systemPrompt(def.getSystemPrompt());
        }

        if ((request.getModel() == null || request.getModel().isEmpty())
                && def.getModelName() != null && !def.getModelName().isEmpty()) {
            builder.modelName(def.getModelName());
        }

        Set<String> toolIds = definitionService.parseToolIds(def.getToolIds());
        if (!toolIds.isEmpty()) {
            builder.toolIds(toolIds);
        }
        if (def.getMaxIterations() != null) {
            builder.maxIterations(def.getMaxIterations());
        }

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("agentId", def.getId().toString());
        metadata.put("agentName", def.getName());
        builder.metadata(metadata);
    }

    // ---- Personalization (profile + memory) ----

    private void injectPersonalization(AgentSession session, AgentIdentity identity) {
        if (identity == null || identity.getUserId() == null) {
            return;
        }
        List<String> blocks = new ArrayList<>();

        // Profile block.
        try {
            if (profileStore != null) {
                UserProfile profile = profileStore.load(identity.getUserId(), identity.getTenantId());
                String profileBlock = buildProfileBlock(profile);
                if (profileBlock != null) {
                    blocks.add(profileBlock);
                }
            }
        } catch (Exception e) {
            log.debug("AgentSessionFactory: profile injection skipped: {}", e.getMessage());
        }

        // Memory block.
        try {
            if (memoryStore != null) {
                List<MemoryEntry> memories = memoryStore.recall(
                        MemoryStore.scope(identity.getUserId(), identity.getTenantId()), "", 5);
                if (!memories.isEmpty()) {
                    StringBuilder sb = new StringBuilder("[相关记忆]\n");
                    for (MemoryEntry m : memories) {
                        sb.append("- ").append(truncate(m.getContent(), 500)).append('\n');
                    }
                    blocks.add(sb.toString().trim());
                }
            }
        } catch (Exception e) {
            log.debug("AgentSessionFactory: memory injection skipped: {}", e.getMessage());
        }

        // Prompt-cache friendly placement: these blocks change between turns
        // (interaction counts, tool-usage ranks, memories). Inserting them right
        // after the system prompt would mutate the request PREFIX every turn and
        // defeat the provider's context cache for the whole conversation — so
        // they are appended as a TRAILING system message instead. The stable
        // prefix (system prompt + tool catalog + history) stays byte-identical
        // and cache hits are preserved; only the volatile tail misses.
        if (!blocks.isEmpty()) {
            List<ConversationMessage> messages = session.getExecution().getMessages();
            messages.add(ConversationMessage.system(String.join("\n\n", blocks)));
            session.getExecution().setMessages(messages);
        }
    }

    private String buildProfileBlock(UserProfile profile) {
        if (profile == null || profile.getInteractionCount() <= 0) {
            return null;
        }
        StringBuilder sb = new StringBuilder("[用户画像]");
        if (profile.getLanguage() != null) {
            sb.append(" 语言偏好: ").append(profile.getLanguage()).append(';');
        }
        if (profile.getPreferredModel() != null) {
            sb.append(" 常用模型: ").append(profile.getPreferredModel()).append(';');
        }
        sb.append(" 交互次数: ").append(profile.getInteractionCount()).append(';');
        if (!profile.getToolUsage().isEmpty()) {
            List<String> topTools = profile.getToolUsage().entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                    .limit(5).map(Map.Entry::getKey).collect(Collectors.toList());
            sb.append(" 常用工具: ").append(String.join(", ", topTools)).append(';');
        }
        if (!profile.getPreferences().isEmpty()) {
            sb.append(" 偏好: ").append(String.join("; ", profile.getPreferences())).append(';');
        }
        if (!profile.getFacts().isEmpty()) {
            sb.append(" 已知事实: ").append(String.join("; ", profile.getFacts())).append(';');
        }
        return sb.toString();
    }

    // ---- Message helpers ----

    private void appendToLeadingSystemMessage(AgentSession session, String text) {
        List<ConversationMessage> messages = session.getExecution().getMessages();
        for (int i = 0; i < messages.size(); i++) {
            ConversationMessage msg = messages.get(i);
            if ("system".equals(msg.getRole())) {
                String content = msg.getContent() != null ? msg.getContent() : "";
                messages.set(i, ConversationMessage.builder()
                        .role("system")
                        .content(content + "\n\n" + text)
                        .build());
                session.getExecution().setMessages(messages);
                return;
            }
        }
        // No system message yet — prepend one.
        messages.add(0, ConversationMessage.system(text));
        session.getExecution().setMessages(messages);
    }

    private void insertAfterLeadingSystem(AgentSession session, String text) {
        List<ConversationMessage> messages = session.getExecution().getMessages();
        int insertAt = 0;
        for (int i = 0; i < messages.size(); i++) {
            if ("system".equals(messages.get(i).getRole())) {
                insertAt = i + 1;
                break;
            }
        }
        messages.add(insertAt, ConversationMessage.system(text));
        session.getExecution().setMessages(messages);
    }

    private ConversationMessage toV2Message(ChatMessage msg) {
        ConversationMessage.Builder builder = ConversationMessage.builder()
                .role(msg.getRole())
                .content(msg.getContent())
                .toolCallId(msg.getToolCallId())
                .name(msg.getName())
                .reasoningContent(msg.getReasoningContent());

        if (msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
            List<ConversationMessage.ToolCallInfo> toolCalls = msg.getToolCalls().stream()
                    .map(tc -> new ConversationMessage.ToolCallInfo(
                            tc.getId(), tc.getType(),
                            tc.getFunction() != null ? tc.getFunction().getName() : null,
                            tc.getFunction() != null ? tc.getFunction().getArguments() : null))
                    .collect(Collectors.toList());
            builder.toolCalls(toolCalls);
        }
        return builder.build();
    }

    private String truncate(String text, int max) {
        if (text == null) {
            return "";
        }
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    // ---- Resolution DTO ----

    private static class SkillResolution {
        final List<ChatTool> tools;
        final List<SkillPayload> skills;
        final String promptFragment;

        SkillResolution(List<ChatTool> tools, List<SkillPayload> skills, String promptFragment) {
            this.tools = tools;
            this.skills = skills;
            this.promptFragment = promptFragment;
        }
    }
}
