package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Context assembly for the loop — builds the stable system prefix (base prompt
 * + skills fragments + memory injection + plan-mode rules) and estimates token
 * usage.
 *
 * <p>Compaction (三级压缩: evict → summarize → truncate) plugs in here; the
 * system prefix is always kept stable so provider context caching hits.
 */
@Component
public class ContextManager {

    /** Editor-agent base system prompt (the redesign's primary persona). */
    public static final String BASE_SYSTEM_PROMPT =
            "你是知识库（Kotion）的编辑器 Agent，直接操作用户的知识文档。\n"
            + "\n"
            + "能力与工具：\n"
            + "- editor.* 工具：读取、插入、删除、格式化文档内容（块、标题、列表、表格、代码块、callout 等）。\n"
            + "- 其他工具：网络检索、长期记忆、工作记忆、任务委派（delegate）。\n"
            + "\n"
            + "工作准则：\n"
            + "1. 先读后写：修改前先用 read/get 类工具确认目标位置与现有内容。\n"
            + "2. 块级定位：优先使用文档结构/块 id 定位，避免大段重写。\n"
            + "3. 最小改动：只修改与任务相关的部分，保持原有格式与语气。\n"
            + "4. 长任务先规划：复杂任务先用工作记忆（scratchpad）记录计划与进度，分步执行。\n"
            + "5. 及时汇报：操作完成后用简洁的语言说明改了什么。\n"
            + "6. 记忆：值得长期记住的用户偏好与事实用 remember 工具保存；需要时用 recall_memory 检索。\n"
            + "7. 委派：独立、可并行的子任务用 delegate 工具委派给子 agent。";

    /** Plan-mode restrictions appended to the system prompt. */
    public static final String PLAN_MODE_RULES =
            "\n\n当前处于 PLAN（计划）模式：只允许只读工具与 present_plan。"
            + "先调研、再给出计划；不要修改任何文档，等用户批准后再执行。";

    /** Header of the deferred (skill-owned) tool directory. */
    private static final String DEFERRED_TOOLS_HEADER =
            "\n\n【按需工具】以下工具可直接调用，但为节省上下文只给出参数签名（`?` 表示可选），"
            + "未展开完整的参数结构。首次调用后其完整参数结构会加载进工具列表；"
            + "若首次调用因参数不符被拒绝，请依据返回的错误与随后出现的参数结构重试。";

    /** Per-tool description budget in the directory (chars). */
    private static final int DEFERRED_DESC_LIMIT = 400;

    /** Max parameters rendered per tool signature. */
    private static final int DEFERRED_PARAM_LIMIT = 12;

    /**
     * Build the stable system message: base prompt + skills fragments + memory
     * injection lines + (plan rules when in plan mode and gate still closed).
     */
    public ChatMessage buildSystemMessage(AgentRun run, List<String> skillFragments,
                                          List<String> memoryLines) {
        return buildSystemMessage(run, skillFragments, memoryLines, null);
    }

    /**
     * Same as {@link #buildSystemMessage(AgentRun, List, List)} plus a directory
     * of deferred tools — those registered as callable but withheld from the
     * model's tool list. Rendered as a one-line signature per tool; the full
     * JSON Schema (the expensive part) stays out of the prompt until first use.
     */
    public ChatMessage buildSystemMessage(AgentRun run, List<String> skillFragments,
                                          List<String> memoryLines, List<ToolSpec> deferredTools) {
        StringBuilder content = new StringBuilder(BASE_SYSTEM_PROMPT);

        if (skillFragments != null) {
            for (String fragment : skillFragments) {
                if (fragment != null && !fragment.trim().isEmpty()) {
                    content.append("\n\n").append(fragment.trim());
                }
            }
        }
        appendDeferredTools(content, deferredTools);
        if (memoryLines != null && !memoryLines.isEmpty()) {
            content.append("\n\n【关于用户的长期记忆】");
            for (String line : memoryLines) {
                if (line != null && !line.trim().isEmpty()) {
                    content.append("\n- ").append(line.trim());
                }
            }
        }
        if ("plan".equalsIgnoreCase(run.getMode()) && !run.isPlanGateOpen()) {
            content.append(PLAN_MODE_RULES);
        }
        return ChatMessage.builder().role("system").content(content.toString()).build();
    }

    private void appendDeferredTools(StringBuilder content, List<ToolSpec> deferredTools) {
        if (deferredTools == null || deferredTools.isEmpty()) {
            return;
        }
        content.append(DEFERRED_TOOLS_HEADER);
        for (ToolSpec spec : deferredTools) {
            if (spec == null || spec.getName() == null) {
                continue;
            }
            content.append("\n- ").append(spec.getName()).append(signature(spec.getInputSchema()));
            String description = spec.getDescription();
            if (description != null && !description.trim().isEmpty()) {
                String trimmed = description.trim();
                if (trimmed.length() > DEFERRED_DESC_LIMIT) {
                    trimmed = trimmed.substring(0, DEFERRED_DESC_LIMIT) + "…";
                }
                content.append(": ").append(trimmed);
            }
        }
    }

    /**
     * Renders a JSON Schema object as a compact call signature, e.g.
     * {@code (blockId: string, data?: object)}. Listing only tool names invites
     * the model to invent argument names on the first (schema-less) call.
     */
    @SuppressWarnings("unchecked")
    private String signature(java.util.Map<String, Object> inputSchema) {
        if (inputSchema == null) {
            return "()";
        }
        Object propertiesNode = inputSchema.get("properties");
        if (!(propertiesNode instanceof java.util.Map)) {
            return "()";
        }
        java.util.Set<String> required = new java.util.HashSet<>();
        Object requiredNode = inputSchema.get("required");
        if (requiredNode instanceof List) {
            for (Object item : (List<Object>) requiredNode) {
                if (item != null) {
                    required.add(String.valueOf(item));
                }
            }
        }
        StringBuilder signature = new StringBuilder("(");
        int rendered = 0;
        for (java.util.Map.Entry<String, Object> entry
                : ((java.util.Map<String, Object>) propertiesNode).entrySet()) {
            if (rendered >= DEFERRED_PARAM_LIMIT) {
                signature.append(", …");
                break;
            }
            if (rendered > 0) {
                signature.append(", ");
            }
            signature.append(entry.getKey());
            if (!required.contains(entry.getKey())) {
                signature.append('?');
            }
            String type = typeOf(entry.getValue());
            if (type != null) {
                signature.append(": ").append(type);
            }
            rendered++;
        }
        return signature.append(')').toString();
    }

    @SuppressWarnings("unchecked")
    private String typeOf(Object propertyNode) {
        if (!(propertyNode instanceof java.util.Map)) {
            return null;
        }
        Object type = ((java.util.Map<String, Object>) propertyNode).get("type");
        if (type instanceof List) {
            List<Object> types = (List<Object>) type;
            return types.isEmpty() ? null : String.valueOf(types.get(0));
        }
        return type != null ? String.valueOf(type) : null;
    }

    /**
     * Full message list for one inference. The checkpoint's messages already
     * carry the stable system prefix at index 0 — this hook applies budget
     * management (三级压缩) and returns the final list to send.
     */
    public List<ChatMessage> assemble(List<ChatMessage> checkpointMessages) {
        // M1: passthrough. Compaction (evict → summarize → truncate) plugs in
        // here in M3, keeping the system prefix stable.
        return checkpointMessages != null ? checkpointMessages : new ArrayList<ChatMessage>();
    }

    /**
     * Coarse token estimation: chars/4 for text + 64 tokens per tool schema
     * entry + per-message overhead. Deterministic and fast (fine for budget
     * gating; the provider is authoritative for billing).
     */
    public long estimateTokens(List<ChatMessage> messages, int toolCount) {
        long tokens = toolCount * 64L;
        if (messages == null) {
            return tokens;
        }
        for (ChatMessage message : messages) {
            tokens += 4; // per-message framing overhead
            if (message.getContent() != null) {
                tokens += message.getContent().length() / 4;
            }
            if (message.getReasoningContent() != null) {
                tokens += message.getReasoningContent().length() / 4;
            }
            if (message.getToolCalls() != null) {
                for (ChatMessage.ToolCallInfo call : message.getToolCalls()) {
                    if (call.getFunction() != null) {
                        if (call.getFunction().getName() != null) {
                            tokens += call.getFunction().getName().length() / 4 + 8;
                        }
                        if (call.getFunction().getArguments() != null) {
                            tokens += call.getFunction().getArguments().length() / 4;
                        }
                    }
                }
            }
        }
        return tokens;
    }
}
