package com.knowledge.agent.harness;

import com.knowledge.agent.api.dto.AgentMode;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.List;

/**
 * Builds the system prompt dynamically from available tools.
 * <p>
 * Includes contextual information (current date/time, user identity)
 * so the LLM always has an accurate sense of "now" and "who" it is
 * talking to, preventing outdated or generic responses.
 */
@Slf4j
@Component
public class SystemPromptBuilder {

    private static final String BASE_PROMPT = "You are a knowledgeable AI assistant with access to various tools. "
            + "Use the available tools to help answer questions and complete tasks. "
            + "When a task is complex enough to require parallel sub-task execution, use the `delegate` tool "
            + "to spawn sub-agents. Each sub-agent will work on a specific sub-task with the appropriate tools. "
            + "Think step by step and use tools when they can help you provide a better answer.\n\n"
            + "Available tools:\n";

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern(
            "yyyy-MM-dd HH:mm:ss z");

    /**
     * Build the system prompt from backend tools only (for backward compatibility).
     */
    public String build(Collection<Tool> tools) {
        return build(tools, null, null);
    }

    /**
     * Build the system prompt from available tools, including frontend tools.
     *
     * @param tools         registered backend tools
     * @param frontendTools frontend tools from the client request
     */
    public String build(Collection<Tool> tools, List<ChatTool> frontendTools) {
        return build(tools, frontendTools, null);
    }

    /**
     * Build the system prompt from available tools, frontend tools, and user
     * context.
     *
     * @param tools         registered backend tools
     * @param frontendTools frontend tools from the client request
     * @param context       tool execution context (carries user info)
     */
    public String build(Collection<Tool> tools, List<ChatTool> frontendTools, ToolContext context) {
        return build(tools, frontendTools, context, null);
    }

    /**
     * Build the system prompt from available tools, frontend tools, user
     * context, and a skill prompt fragment.
     *
     * @param tools               registered backend tools
     * @param frontendTools       frontend tools from the client request
     * @param context             tool execution context (carries user info)
     * @param skillPromptFragment concatenated systemPromptFragment from
     *                            resolved frontend skills (may be null or empty)
     */
    public String build(Collection<Tool> tools, List<ChatTool> frontendTools,
            ToolContext context, String skillPromptFragment) {
        StringBuilder sb = new StringBuilder();

        // --- Context section (current time + user info) ---
        sb.append(buildContextSection(context));

        // --- Plan mode instructions (P7), layer 2 ---
        if (context != null && context.getMode() == AgentMode.PLAN) {
            sb.append("=== PLAN MODE ACTIVE ===\n");
            sb.append("You are in PLAN MODE. You MUST NOT modify anything. ");
            sb.append("Only use read-only tools (search / read / fetch / list / get) and `delegate` ");
            sb.append("for read-only research. Do NOT call any tool that writes, deletes, updates, or ");
            sb.append("otherwise changes state — such calls will be rejected.\n");
            sb.append("When you have finished researching, you MUST call the `present_plan` tool with a ");
            sb.append("structured plan (title, summary, ordered steps with their tools and risk levels, ");
            sb.append("open questions, estimated number of mutations). Do not start executing the plan — ");
            sb.append("it will be shown to the user for approval first.\n");
            sb.append("=== END PLAN MODE ===\n\n");
        }

        // --- Base prompt + tool list ---
        sb.append(BASE_PROMPT);

        // Backend tools
        for (Tool tool : tools) {
            if (tool.isFrontend()) {
                continue; // Frontend-registered tools are described via frontendTools
            }
            sb.append("- ").append(tool.getId()).append(": ").append(tool.getDescription()).append("\n");
        }

        // Frontend tools
        if (frontendTools != null) {
            for (ChatTool ft : frontendTools) {
                if (ft.getFunction() != null) {
                    sb.append("- ").append(ft.getFunction().getName())
                            .append(": ").append(ft.getFunction().getDescription())
                            .append(" (frontend tool)\n");
                }
            }
        }

        // --- Skill prompt fragments (from progressive skill discovery) ---
        if (skillPromptFragment != null && !skillPromptFragment.isEmpty()) {
            sb.append("\nActive skill instructions:\n");
            sb.append(skillPromptFragment).append("\n");
        }

        return sb.toString();
    }

    // ---- Context helpers ----

    /**
     * Build a concise context block that tells the LLM the current time and who
     * the user is. This prevents the model from producing stale or impersonal
     * responses.
     */
    private String buildContextSection(ToolContext context) {
        StringBuilder sb = new StringBuilder();

        // Current date/time — always include so the model knows "now"
        ZonedDateTime now = ZonedDateTime.now(ZoneId.systemDefault());
        int year = now.getYear();
        sb.append("=== IMPORTANT: CURRENT TIME CONTEXT ===\n");
        sb.append("Current date/time: ").append(DT_FMT.format(now)).append("\n");
        sb.append("The current year is ").append(year).append(". ");
        sb.append("You MUST use ").append(year).append(" as the current year in all responses. ");
        sb.append("Do NOT use any earlier year such as 2024 or 2023 unless explicitly referring to historical events.\n");
        sb.append("=== END TIME CONTEXT ===\n");

        if (context != null) {
            // User identity
            boolean hasUser = context.getUserId() != null && context.getUserId() > 0;
            boolean hasName = context.getUserName() != null && !context.getUserName().isEmpty();
            boolean hasAccount = context.getAccount() != null && !context.getAccount().isEmpty();
            boolean hasTenant = context.getTenantIdStr() != null && !context.getTenantIdStr().isEmpty();
            boolean hasRole = context.getRoleName() != null && !context.getRoleName().isEmpty();

            if (hasUser || hasName) {
                sb.append("Current user: ");
                if (hasName) {
                    sb.append(context.getUserName());
                }
                if (hasAccount) {
                    sb.append(" (").append(context.getAccount()).append(")");
                }
                sb.append(", ID: ").append(hasUser ? context.getUserId() : "unknown");
                if (hasRole) {
                    sb.append(", role: ").append(context.getRoleName());
                }
                sb.append("\n");
            }

            if (hasTenant) {
                sb.append("Tenant/Organization ID: ").append(context.getTenantIdStr()).append("\n");
            }
        }

        sb.append("\n");
        return sb.toString();
    }
}
