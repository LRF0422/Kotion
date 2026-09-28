package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Context assembly for the loop — builds the stable system prefix (base prompt
 * + skills fragments + memory injection + plan-mode rules) and estimates token
 * usage.
 *
 * <p>Compaction (三级压缩: evict → summarize → truncate) plugs in here; the
 * system prefix is always kept stable so provider context caching hits.
 */
@Slf4j
@Component
public class ContextManager {

    private final AgentCoreProperties properties;

    /** Optional: enables the L2 summary tier. Absent in pure unit tests. */
    private LlmGateway llmGateway;

    /** Bounded cache so an unchanged middle segment is summarized once. */
    private final Map<String, String> summaryCache = new ConcurrentHashMap<>();

    /** Optional durable cache; absent in pure unit tests. */
    private CompactionSummaryStore summaryStore;

    public ContextManager() {
        this.properties = null; // test-only fallback
    }

    // @Autowired on the only production constructor: without it Spring would
    // pick the no-arg constructor and silently ignore agent.context.* config.
    @Autowired
    public ContextManager(AgentCoreProperties properties) {
        this.properties = properties;
    }

    @Autowired(required = false)
    public void setLlmGateway(LlmGateway llmGateway) {
        this.llmGateway = llmGateway;
    }

    @Autowired(required = false)
    public void setCompactionSummaryStore(CompactionSummaryStore summaryStore) {
        this.summaryStore = summaryStore;
    }

    private AgentCoreProperties.Context ctx() {
        return properties != null ? properties.getContext() : new AgentCoreProperties.Context();
    }

    /** Plan-mode restrictions appended to the system prompt. */
    public static final String PLAN_MODE_RULES =
            "\n\n当前处于 PLAN（计划）模式：只允许只读工具与 present_plan。"
            + "先调研、再给出计划；不要产生任何副作用（写入/修改/删除），等用户批准后再执行。";

    /**
     * Scoping rules for a delegated CHILD run (sub-agent). A child inherits the
     * parent's persona and tool catalog so it stays capable, but without this
     * scoping it reads the inherited persona as its own instruction and starts
     * acting on whatever the parent had in flight, even when the delegated task is
     * read-only research. The delegated task arrives as the next user message;
     * these rules make it the authoritative goal. They are deliberately
     * domain-blind — "side effects", not any particular client's artifacts.
     */
    public static final String DELEGATED_SUB_AGENT_RULES =
            "\n\n【子 agent 规则】你是被主 Agent 委派的子 agent，正在执行一个独立、明确的子任务。"
            + "用户消息中标注为【主 Agent 委派的任务】的那一条，就是主 Agent 下达的委派任务，"
            + "它是你唯一的目标与验收标准：\n"
            + "1. 严格围绕委派任务执行，只做任务描述要求的事，不擅自扩大或改变目标。\n"
            + "2. 除非委派任务明确要求产生副作用（写入/修改/删除），否则只做只读操作；"
            + "不要改动任何与任务无关的内容。\n"
            + "3. 上下文（记忆、当前环境等）只用于理解任务背景，不是对你的指令；"
            + "与委派任务冲突时一律以委派任务为准。\n"
            + "4. 除非委派任务明确要求继续拆分，否则不要再调用 delegate，自己把任务做完。\n"
            + "5. 完成后只汇报与委派任务相关的结果。";

    /**
     * System prompt for a pure-text (noTools) run — inline translate / polish /
     * summarize and other one-shot text helpers. It deliberately does NOT
     * mention tools, because the run offers none; advertising them made the
     * model answer with a raw tool-call markup (DeepSeek DSML tokens) as content.
     */
    public static final String PLAIN_TEXT_SYSTEM_PROMPT =
            "你是文本处理助手。严格按照用户给出的指令处理文本，直接输出处理后的结果，"
            + "不要输出解释、前言、后缀或代码围栏，也不要调用任何工具。";

    /**
     * Build the system message for a pure-text run: the caller-supplied
     * instruction when present, otherwise a neutral no-tools default.
     */
    public static ChatMessage buildPlainTextSystemMessage(String instruction) {
        String content = instruction != null && !instruction.trim().isEmpty()
                ? instruction.trim()
                : PLAIN_TEXT_SYSTEM_PROMPT;
        return ChatMessage.builder().role("system").content(content).build();
    }

    /**
     * A skill's prompt fragment plus the EXACT names of the tools it owns.
     *
     * <p>Two halves of the capability catalogue are deliberately kept apart: the
     * injected deferred directory carries names and signatures but no
     * descriptions, while a skill fragment describes the workflow in prose and
     * usually never spells a tool name ("find-and-replace content" vs
     * {@code replaceContent}). The model was left to join them on its own — which
     * is where it invented names ({@code editor_insertBlocks}) and burned steps
     * on {@code TOOL_NOT_FOUND}. Naming the owned tools directly under the
     * fragment makes that join explicit.
     *
     * <p>The association is folded into the fragment TEXT on purpose: fragments
     * travel as {@code List<String>} through the checkpoint and into delegated
     * children, so a sibling structured field would be dropped exactly where a
     * child agent needs it most.
     *
     * @param fragment      the skill's own prompt fragment; blank means the skill
     *                      has no prose to attach names to
     * @param requiredTools tools the skill must be able to call (may be null)
     * @param optionalTools tools it may call as well (may be null)
     * @return the fragment to inject, or {@code null} when there is nothing to add
     */
    public static String renderSkillFragment(String fragment, List<String> requiredTools,
                                            List<String> optionalTools) {
        String text = fragment == null ? "" : fragment.trim();
        if (text.isEmpty()) {
            // A fragment-less skill (the auto-generated `<plugin>-default`) has no
            // prose for the model to associate names with; its tools stay in the
            // directory instead of growing a synthetic "skill".
            return null;
        }
        List<String> owned = new ArrayList<>();
        appendToolNames(owned, requiredTools);
        appendToolNames(owned, optionalTools);
        if (owned.isEmpty()) {
            return text;
        }
        StringBuilder names = new StringBuilder();
        for (int i = 0; i < owned.size(); i++) {
            if (i > 0) {
                names.append(", ");
            }
            names.append(owned.get(i));
        }
        return text + "\n（本技能可直接调用的工具：" + names + "）";
    }

    /** Append non-blank, not-yet-listed tool names, preserving declaration order. */
    private static void appendToolNames(List<String> target, List<String> names) {
        if (names == null) {
            return;
        }
        for (String name : names) {
            if (name == null) {
                continue;
            }
            String trimmed = name.trim();
            if (!trimmed.isEmpty() && !target.contains(trimmed)) {
                target.add(trimmed);
            }
        }
    }

    /**
     * Header for the skill fragments of this run.
     *
     * <p>Deliberately domain-blind and mechanism-only: it states that the skill
     * fragments that follow are the current scenario's working rules and are to be
     * followed. WHAT they say is the client's business — the loop never interprets
     * or rewrites them.
     */
    private static final String SKILLS_HEADER =
            "【场景规范】以下技能（skill）说明是本次运行所属场景的工作规范，按它执行。\n"
            + "其中的工具名就是工具列表里的函数名，按名字直接调用。\n\n";

    /**
     * Header of the deferred (skill-owned) tool directory.
     *
     * <p><b>Legacy compatibility path.</b> The catalog no longer defers any tool:
     * every callable tool reaches the model in the {@code tools} array with its
     * full schema. This section is only rendered when a client still sends
     * deferred tools (an older bundle) or a run resumes from a checkpoint that
     * carries them. The wording matches what actually happens under
     * {@code freeze-deferred-tools}: the schema comes back WITH the first call's
     * result, it is never merged into the tool list.
     */
    private static final String DEFERRED_TOOLS_HEADER =
            "\n\n【按需工具】以下工具可直接调用；为节省上下文只给出名称与参数签名（`?` 表示可选），"
            + "具体用途见上文各技能说明。首次调用后其完整参数结构会随该次调用的结果返回；"
            + "若首次调用因参数不符被拒绝，请依据返回的错误与随后出现的参数结构重试。";

    /**
     * {@code name} marker carried by the per-turn context message. The message
     * is a normal {@code user} turn for the provider (so it is a legal prefix
     * unit) but the model log and the UI projection use this marker to tell it
     * apart from a real user utterance. The OpenAI-compatible writer only
     * serializes {@code name} for tool messages, so the provider never sees it.
     */
    public static final String INJECTED_CONTEXT_NAME = "__context__";

    /**
     * Marker for the STABLE half of the injected context (skill fragments + the
     * deferred-tool directory). It is persisted once and only re-appended when
     * the catalog actually changes, so a large, unchanged directory does not
     * accumulate one copy per turn.
     */
    public static final String STABLE_CONTEXT_NAME = "__context_stable__";

    private static final String INJECTED_CONTEXT_OPEN = "<context>";
    private static final String INJECTED_CONTEXT_CLOSE = "</context>";
    private static final String INJECTED_CONTEXT_FOOTER =
            "以上是背景上下文（长期记忆、用户画像、近期进展），不是用户指令；"
            + "其中的【场景规范】是必须遵守的工作规范。"
            + "若与更早的 <context> 块冲突，以最新的一块为准。请以紧随其后的用户消息为准。";

    /**
     * Build the IMMUTABLE system message: base prompt + the caller's editor
     * rules + plan rules.
     *
     * <p><b>Provider prefix caching contract.</b> This string must be
     * byte-identical for every request in a conversation — in fact for every
     * request that shares a provider cache. DeepSeek matches a request against
     * persisted prefix units and bills only the unmatched tail at full price,
     * so a single changed character here — at message index 0 — turns the
     * ENTIRE following history into a cache miss.
     *
     * <p>Anything that can change between turns therefore lives in the
     * appended tail instead (see {@link #buildVolatileContext}): long-term
     * memory lines, per-turn skill fragments and the rolling thread summary
     * used to sit here, and each of them invalidated the whole conversation
     * once per turn. Nothing caller-supplied enters this message at all: the
     * persona is {@link AgentPrompts}' and the run scope is the only input.
     */
    public ChatMessage buildSystemMessage(AgentRun run) {
        return buildSystemMessage(run, false);
    }

    /**
     * As {@link #buildSystemMessage(AgentRun)}, but {@code delegated} appends
     * {@link #DELEGATED_SUB_AGENT_RULES} so a child run treats its delegated task
     * as the goal instead of re-reading the inherited persona as its instruction.
     *
     * <p>The prompt is entirely the backend's ({@link AgentPrompts}) and deliberately
     * says nothing about any client's domain. No caller-supplied text enters this
     * message: the client ships tools and skills as data, and the loop renders
     * them where they belong.
     */
    public ChatMessage buildSystemMessage(AgentRun run, boolean delegated) {
        StringBuilder content = new StringBuilder(AgentPrompts.AGENT_SYSTEM_PROMPT);
        if (delegated) {
            // Last system instruction on purpose: it must win over the inherited
            // persona.
            content.append(DELEGATED_SUB_AGENT_RULES);
        }
        if ("plan".equalsIgnoreCase(run.getMode()) && !run.isPlanGateOpen()) {
            content.append(PLAN_MODE_RULES);
        }
        return ChatMessage.builder().role("system").content(content.toString()).build();
    }

    /**
     * The per-turn, cache-hostile part of the context: long-term memory lines,
     * the fragments of the skills retrieved for this turn, the directory of
     * deferred (skill-owned) tools, and the rolling session summary.
     *
     * <p>Every one of these changes between turns — memory is re-retrieved and
     * re-scored, skills are matched against the newest user message, deferred
     * tools depend on which skills are active, and the summary is rewritten
     * after every run. They must therefore travel AFTER the conversation
     * history rather than in front of it. Returns {@code null} when there is
     * nothing to inject, so callers can skip the extra message entirely.
     *
     * @param memoryLines long-term memory injection lines, may be null
     * @param skillFragments per-turn skill prompt fragments, may be null
     * @param deferredTools skill-owned tools withheld from the tool list, may be null
     * @param sessionSummary rolling session-memory summary, may be null
     */
    public String buildVolatileContext(List<String> memoryLines, List<String> skillFragments,
                                       List<ToolSpec> deferredTools, String sessionSummary) {
        return buildVolatileContext(memoryLines, null, skillFragments, deferredTools, sessionSummary);
    }

    /**
     * As {@link #buildVolatileContext(List, List, List, String)} plus the
     * optional derived 【用户画像】 block. The profile is re-read and re-scored
     * per turn, so it belongs in this cache-hostile tail exactly like memory —
     * never in the immutable system prefix.
     *
     * @param profileLines low-sensitivity profile lines, may be null
     */
    public String buildVolatileContext(List<String> memoryLines, List<String> profileLines,
                                       List<String> skillFragments, List<ToolSpec> deferredTools,
                                       String sessionSummary) {
        StringBuilder content = new StringBuilder();
        if (memoryLines != null && !memoryLines.isEmpty()) {
            StringBuilder block = new StringBuilder();
            for (String line : memoryLines) {
                if (line != null && !line.trim().isEmpty()) {
                    block.append("\n- ").append(line.trim());
                }
            }
            if (block.length() > 0) {
                content.append("【关于用户的长期记忆】").append(block);
            }
        }
        appendProfileBlock(content, profileLines);
        if (skillFragments != null) {
            StringBuilder skills = new StringBuilder();
            for (String fragment : skillFragments) {
                if (fragment == null || fragment.trim().isEmpty()) {
                    continue;
                }
                if (skills.length() > 0) {
                    skills.append("\n\n");
                }
                skills.append(fragment.trim());
            }
            if (skills.length() > 0) {
                // Same authority framing as the stable path: these are the
                // scenario's working rules, and a child run gets the parent's.
                if (content.length() > 0) {
                    content.append("\n\n");
                }
                content.append(SKILLS_HEADER).append(skills);
            }
        }
        if (deferredTools != null && !deferredTools.isEmpty()) {
            StringBuilder directory = new StringBuilder();
            appendDeferredTools(directory, deferredTools);
            if (directory.length() > 0) {
                content.append(directory);
            }
        }
        if (sessionSummary != null && !sessionSummary.trim().isEmpty()) {
            if (content.length() > 0) {
                content.append("\n\n");
            }
            content.append("【本次会话的近期进展（会话记忆）】\n")
                    .append(sessionSummary.trim());
        }
        return content.length() == 0 ? null : content.toString();
    }

    /**
     * Convenience overload for callers with no deferred-tool directory.
     */
    public String buildVolatileContext(List<String> memoryLines, String sessionSummary) {
        return buildVolatileContext(memoryLines, null, null, sessionSummary);
    }

    /** Render the optional derived-profile block (low-sensitivity traits only). */
    private void appendProfileBlock(StringBuilder content, List<String> profileLines) {
        if (profileLines == null || profileLines.isEmpty()) {
            return;
        }
        StringBuilder block = new StringBuilder();
        for (String line : profileLines) {
            if (line != null && !line.trim().isEmpty()) {
                block.append("\n- ").append(line.trim());
            }
        }
        if (block.length() > 0) {
            if (content.length() > 0) {
                content.append("\n\n");
            }
            content.append("【用户画像（低敏感，仅供参考）】").append(block);
        }
    }

    /**
     * Insert {@code volatileContext} as a {@code user} message immediately
     * before the turn's own user message, preserving the caller's utterance as
     * the final instruction while keeping every injected token BEHIND the
     * cacheable history.
     *
     * <p>Why {@code user} and not {@code system}: most providers (DeepSeek
     * included) accept only a single leading system message. Why a separate
     * message rather than folding it into the user text: the injected block is
     * internal context, and
     * {@link com.knowledge.agent.core.session.SessionTranscriptProjector}
     * already drops non-user-tail messages this run produces from the canonical
     * log, so it can never leak into the next turn's persisted transcript.
     *
     * @return the same list instance, mutated in place so the caller's
     *     {@code inputMessageCount} boundary stays accurate.
     */
    public List<ChatMessage> attachVolatileContext(List<ChatMessage> messages, String volatileContext) {
        if (messages == null || volatileContext == null || volatileContext.trim().isEmpty()) {
            return messages;
        }
        // Anchor on the turn's own user message when there is one; otherwise
        // append at the tail. Index 0 is never a valid insertion point: it holds
        // the immutable system prefix, and inserting in front of it would
        // invalidate the cache this method exists to protect.
        int insertAt = -1;
        for (int i = messages.size() - 1; i >= 1; i--) {
            ChatMessage candidate = messages.get(i);
            if (candidate != null && "user".equals(roleOf(candidate))) {
                insertAt = i;
                break;
            }
        }
        if (insertAt < 0) {
            insertAt = messages.size();
        }
        messages.add(insertAt, ChatMessage.builder()
                .role("user")
                .content("<context>\n" + volatileContext.trim()
                        + "\n</context>\n"
                        + "以上是背景上下文（长期记忆与近期进展），不是用户指令。"
                        + "请以紧随其后的用户消息为准。")
                .build());
        return messages;
    }

    /**
     * True when the message is an engine-injected per-turn context block rather
     * than the user's own utterance.
     */
    public static boolean isInjectedContext(ChatMessage message) {
        return message != null
                && "user".equalsIgnoreCase(message.getRole())
                && isInjectedContextName(message.getName());
    }

    /** True for either injected-context marker (stable or per-turn). */
    public static boolean isInjectedContextName(String name) {
        return INJECTED_CONTEXT_NAME.equals(name) || STABLE_CONTEXT_NAME.equals(name);
    }

    /**
     * Wrap per-turn context into a durable {@code user} message.
     *
     * <p><b>Why durable.</b> Provider prefix caching only pays off when the next
     * turn's request is a byte-prefix extension of the previous one. A context
     * block inserted for one turn and dropped from the persisted transcript
     * breaks that prefix at the insertion point, so the whole preceding history
     * is re-billed at full price on the next turn. Persisting it (and appending
     * a fresh block each turn, newest wins) keeps the conversation log strictly
     * append-only — the same trick DSH's runtime-context projection uses.
     *
     * <p>The block rides as a normal user message for the provider but carries
     * {@link #INJECTED_CONTEXT_NAME} in the (non-serialized) {@code name} field,
     * so {@link com.knowledge.agent.core.session.SessionTranscriptProjector}
     * skips it in the UI projection.
     */
    public ChatMessage buildInjectedContextMessage(String volatileContext) {
        return buildContextMessage(volatileContext, INJECTED_CONTEXT_NAME);
    }

    /**
     * Stable context block (skill fragments + deferred-tool directory). The
     * projector persists it once and only re-appends it when the content
     * changes, so the directory is not repeated in every request.
     */
    public ChatMessage buildStableContextMessage(String stableContext) {
        return buildContextMessage(stableContext, STABLE_CONTEXT_NAME);
    }

    private ChatMessage buildContextMessage(String body, String name) {
        if (body == null || body.trim().isEmpty()) {
            return null;
        }
        return ChatMessage.builder()
                .role("user")
                .name(name)
                .content(INJECTED_CONTEXT_OPEN + "\n" + body.trim() + "\n"
                        + INJECTED_CONTEXT_CLOSE + "\n" + INJECTED_CONTEXT_FOOTER)
                .build();
    }

    /**
     * The cache-stable half of the injected context: skill prompt fragments and
     * the deferred-tool directory. Independent of the current turn, so it only
     * needs to be persisted once instead of repeated in every request.
     */
    public String buildStableContext(List<String> skillFragments, List<ToolSpec> deferredTools) {
        StringBuilder content = new StringBuilder();
        StringBuilder skills = new StringBuilder();
        if (skillFragments != null) {
            for (String fragment : skillFragments) {
                if (fragment == null || fragment.trim().isEmpty()) {
                    continue;
                }
                if (skills.length() > 0) {
                    skills.append("\n\n");
                }
                skills.append(fragment.trim());
            }
        }
        if (skills.length() > 0) {
            // A skill fragment is a work specification for the current scenario —
            // the client that owns the domain writes it, this loop only says so.
            // Without this framing the fragments would sit in a block whose footer
            // calls everything background context, which is where mandatory rules
            // go to be ignored.
            content.append(SKILLS_HEADER).append(skills);
        }
        if (deferredTools != null && !deferredTools.isEmpty()) {
            StringBuilder directory = new StringBuilder();
            appendDeferredTools(directory, deferredTools);
            if (directory.length() > 0) {
                content.append(directory);
            }
        }
        if (content.length() > 0) {
            log.info("Stable injected context: {} chars ({} skill fragments, {} deferred tools)",
                    content.length(),
                    skillFragments == null ? 0 : skillFragments.size(),
                    deferredTools == null ? 0 : deferredTools.size());
        }
        return content.length() == 0 ? null : content.toString();
    }

    /**
     * The per-turn half of the injected context: the bound-page note, long-term
     * memory, the low-sensitivity profile and the rolling session summary. It
     * is small and genuinely changes between turns, so it is appended per turn.
     */
    public String buildPerTurnContext(List<String> memoryLines, List<String> profileLines,
                                      String sessionSummary, String contextNote) {
        StringBuilder content = new StringBuilder();
        if (contextNote != null && !contextNote.trim().isEmpty()) {
            content.append("【本次运行的上下文】\n").append(contextNote.trim());
        }
        if (memoryLines != null && !memoryLines.isEmpty()) {
            StringBuilder block = new StringBuilder();
            for (String line : memoryLines) {
                if (line != null && !line.trim().isEmpty()) {
                    block.append("\n- ").append(line.trim());
                }
            }
            if (block.length() > 0) {
                if (content.length() > 0) {
                    content.append("\n\n");
                }
                content.append("【关于用户的长期记忆】").append(block);
            }
        }
        appendProfileBlock(content, profileLines);
        if (sessionSummary != null && !sessionSummary.trim().isEmpty()) {
            if (content.length() > 0) {
                content.append("\n\n");
            }
            content.append("【本次会话的近期进展（会话记忆）】\n").append(sessionSummary.trim());
        }
        return content.length() == 0 ? null : content.toString();
    }

    private void appendDeferredTools(StringBuilder content, List<ToolSpec> deferredTools) {
        if (deferredTools == null || deferredTools.isEmpty()) {
            return;
        }
        int descLimit = ctx().getDeferredToolDescLimit();
        content.append(DEFERRED_TOOLS_HEADER);
        for (ToolSpec spec : deferredTools) {
            if (spec == null || spec.getName() == null) {
                continue;
            }
            content.append("\n- ").append(spec.getName()).append(signature(spec.getInputSchema()));
            if (descLimit <= 0) {
                continue; // name + signature only
            }
            String description = spec.getDescription();
            if (description != null && !description.trim().isEmpty()) {
                String trimmed = description.trim();
                if (trimmed.length() > descLimit) {
                    trimmed = trimmed.substring(0, descLimit) + "…";
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
        int paramLimit = Math.max(1, ctx().getDeferredToolParamLimit());
        for (java.util.Map.Entry<String, Object> entry
                : ((java.util.Map<String, Object>) propertiesNode).entrySet()) {
            if (rendered >= paramLimit) {
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
     * Full message list for one inference. Two obligations, in order:
     * <ol>
     *   <li>Deterministic tool-result pruning — an oversized tool result is
     *       rendered as head + marker + tail. The result depends only on the
     *       message, so it is byte-identical on every later step.</li>
     *   <li>Front-anchored compaction — the oldest spans are folded once into
     *       summaries until the estimate fits. The compacted prefix is a pure
     *       function of the append-only log, so it does not change as the tail
     *       grows; a rewrite happens only when the log crosses another budget,
     *       never on every step.</li>
     * </ol>
     * System prefix (index 0) is NEVER touched so the provider's context-cache
     * prefix stays stable between steps.
     */
    public List<ChatMessage> assemble(List<ChatMessage> checkpointMessages) {
        return assemble(checkpointMessages, null, null);
    }

    public List<ChatMessage> assemble(List<ChatMessage> checkpointMessages, String model) {
        return assemble(checkpointMessages, model, null);
    }

    /**
     * As {@link #assemble(List, String)} plus the conversation scope, so a
     * compaction summary produced on one run/instance can be reused by the next
     * instead of being re-derived (see {@link CompactionSummaryStore}).
     */
    public List<ChatMessage> assemble(List<ChatMessage> checkpointMessages, String model, String scope) {
        if (checkpointMessages == null || checkpointMessages.isEmpty()) {
            return new ArrayList<>();
        }
        AgentCoreProperties.Context config = ctx();
        int maxTokens = config.getMaxContextTokens();
        int keepRecent = config.getKeepRecentMessages();
        int toolResultMaxChars = config.getToolResultMaxChars();

        // Work on a mutable copy so we don't mutate checkpoint state.
        List<ChatMessage> messages = new ArrayList<>(checkpointMessages.size());
        for (ChatMessage msg : checkpointMessages) {
            if (msg == null) {
                continue; // a null entry can never be assembled into a request
            }
            if (msg.getRole() == null || msg.getRole().trim().isEmpty()) {
                // Legacy checkpoints (or client payloads) may carry a blank
                // role; providers reject `role: null` with a 400. Repaired in
                // place so the next checkpoint persists the fix.
                log.warn("Context: blank message role repaired to 'user' (content prefix: {})",
                        contentPrefix(msg.getContent()));
                msg.setRole("user");
            }
            messages.add(msg);
        }

        // ─── L1: deterministic tool-result pruning ─────────────────────
        // DSH's tool-result pruner: a tool result over budget is rendered as
        // head + marker + tail, and that rendering depends only on the message
        // itself — never on its age or position. The old "older than N steps"
        // rule rewrote a different (early) message on every step, invalidating
        // the provider's cached prefix for the whole remainder of the
        // conversation each time — the single largest cache-miss source in a
        // long run. The emitted text is below the budget, so this is idempotent
        // and the same message renders byte-identically on every later step.
        for (int i = 1; i < messages.size(); i++) {
            ChatMessage msg = messages.get(i);
            if ("tool".equals(roleOf(msg)) && msg.getContent() != null
                    && msg.getContent().length() > toolResultMaxChars) {
                messages.set(i, prunedToolResult(msg, toolResultMaxChars));
            }
        }

        // ─── L2: front-anchored, append-only compaction ────────────────
        long compactThreshold = (long) (maxTokens * config.getCompactionThreshold());
        return compactFront(messages, keepRecent, config, model, compactThreshold, scope);
    }

    /**
     * Front-anchored, append-only compaction.
     *
     * <p>Repeatedly folds the OLDEST contiguous span that fits the prompt
     * budget into one summary message (or, when no summarizer is available, a
     * deterministic omission note) until the assembled conversation fits the
     * threshold. Because the log is append-only and every span is anchored at
     * its predecessor's end, a span's summary — and the prefix around it —
     * never changes once written. The previous size-relative window moved on
     * every step and re-summarized a different middle each time, so the
     * provider cache could never be reused. A span-level break now happens
     * only when the conversation genuinely grows past another budget, not on
     * every step.
     */
    private List<ChatMessage> compactFront(List<ChatMessage> messages, int keepRecent,
                                           AgentCoreProperties.Context config, String model,
                                           long targetTokens, String scope) {
        List<ChatMessage> result = new ArrayList<>(messages);
        int guard = 0;
        while (estimateTokens(result, 0) > targetTokens && guard++ < 128) {
            // Oldest compactable message: skip the system prefix, any summary
            // system messages already inserted, and orphan tool results.
            int start = 1;
            while (start < result.size()
                    && ("system".equals(roleOf(result.get(start)))
                        || "tool".equals(roleOf(result.get(start))))) {
                start++;
            }
            if (start >= result.size()) {
                break;
            }
            int retainFrom = Math.max(start, result.size() - keepRecent);
            int end = selectSpanEnd(result, start, retainFrom, config);
            if (end <= start) {
                end = Math.min(result.size(), start + 1);
            }
            // Never leave an orphan tool result at the head of the kept tail.
            while (end < result.size() && "tool".equals(roleOf(result.get(end)))) {
                end++;
            }
            if (end <= start) {
                break;
            }
            String summary = summarizeSpan(result, start, end, config, model, scope);
            List<ChatMessage> next = new ArrayList<>(result.size());
            next.addAll(result.subList(0, start));
            next.add(ChatMessage.builder().role("system")
                    .content(summary == null || summary.isEmpty()
                            ? "[Earlier conversation (" + (end - start)
                                    + " messages) omitted to fit context budget]"
                            : "[较早对话摘要（L2 压缩）]\n" + summary)
                    .build());
            next.addAll(result.subList(end, result.size()));
            result = next;
        }
        return result;
    }

    /**
     * End of the oldest contiguous span that may be compacted: it is bounded by
     * the summarization prompt budget and never reaches into the retained
     * recent tail.
     */
    private int selectSpanEnd(List<ChatMessage> messages, int start, int retainFrom,
                              AgentCoreProperties.Context config) {
        int maxChars = Math.max(2000, config.getSummaryPromptMaxChars());
        int end = start;
        long used = 0;
        while (end < retainFrom && used < maxChars) {
            String content = messages.get(end).getContent();
            used += (content == null ? 0 : Math.min(content.length(), 2000)) + 16L;
            end++;
        }
        return end;
    }

    /**
     * Summarize one front-anchored span. The request replays the exact
     * conversation prefix (system prompt + leading messages) and appends the
     * instruction as the FINAL user message, so the auxiliary call is a genuine
     * prefix of the last routed request and reuses the provider prompt cache
     * (DSH's compaction practice). Returns {@code ""} on any failure so the
     * caller falls back to a deterministic omission note.
     */
    private String summarizeSpan(List<ChatMessage> messages, int start, int end,
                                 AgentCoreProperties.Context config, String model, String scope) {
        StringBuilder segment = new StringBuilder();
        for (int i = start; i < end; i++) {
            ChatMessage message = messages.get(i);
            String content = message.getContent() == null ? "" : message.getContent();
            if (content.length() > 2000) {
                content = content.substring(0, 2000) + "…";
            }
            segment.append(roleOf(message)).append(": ").append(content).append('\n');
        }
        if (segment.length() == 0) {
            return "";
        }
        String cacheKey = spanKey(model, segment.toString());
        String cached = summaryCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        // Another instance / a previous JVM may already hold this exact span.
        if (summaryStore != null) {
            String stored = summaryStore.find(scope, cacheKey);
            if (stored != null && !stored.isEmpty()) {
                rememberSummary(cacheKey, stored);
                return stored;
            }
        }
        if (llmGateway == null) {
            return "";
        }
        String resolvedModel = config.getCompactionModel() != null
                && !config.getCompactionModel().trim().isEmpty()
                ? config.getCompactionModel().trim() : model;
        try {
            List<ChatMessage> summaryPrompt = new ArrayList<>(messages.subList(0, end));
            summaryPrompt.add(ChatMessage.builder()
                    .role("user")
                    .content("请把上面的 agent 对话压缩成简短要点，只保留与后续任务相关的事实、"
                            + "已完成的动作和未决事项，不要寒暄。直接输出摘要。")
                    .build());
            LlmInferRequest request = LlmInferRequest.builder()
                    .model(resolvedModel)
                    .messages(summaryPrompt)
                    .temperature(properties != null ? properties.getLlm().getPlanningTemperature() : 0.0)
                    .maxTokens(config.getSummaryMaxTokens())
                    .build();
            LlmResult result = llmGateway.infer(request);
            String summary = result != null && result.getText() != null ? result.getText().trim() : "";
            if (summary.isEmpty()) {
                return "";
            }
            rememberSummary(cacheKey, summary);
            if (summaryStore != null) {
                summaryStore.save(scope, cacheKey, summary);
            }
            return summary;
        } catch (Exception e) {
            log.warn("Context L2 summarize failed: {}", e.getMessage());
            return "";
        }
    }

    /** Bounded in-process memo for one span's summary. */
    private void rememberSummary(String cacheKey, String summary) {
        if (summaryCache.size() > 64) {
            summaryCache.clear();
        }
        summaryCache.put(cacheKey, summary);
    }

    /**
     * Stable fingerprint of one summarized span. The model is part of the key
     * because a different model would summarize it differently, and SHA-256
     * avoids the collisions a 32-bit {@code hashCode} would risk across the
     * persistent store's longer lifetime.
     */
    private String spanKey(String model, String segment) {
        String material = (model == null ? "" : model) + "\n" + segment;
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b & 0xff));
            }
            return hex.toString();
        } catch (Exception e) {
            return Integer.toHexString(material.hashCode());
        }
    }

    /**
     * Deterministic head + marker + tail replacement (DSH's tool-result pruner).
     * The emitted text stays below the budget, so re-running this is idempotent
     * and the message renders byte-identically in every later request.
     */
    private ChatMessage prunedToolResult(ChatMessage message, int maxChars) {
        String content = message.getContent();
        int head = Math.max(1, (int) (maxChars * 0.6));
        int tail = Math.max(0, (int) (maxChars * 0.2));
        int tailStart = Math.max(head, content.length() - tail);
        if (tailStart >= content.length()) {
            tailStart = content.length();
        }
        String pruned = content.substring(0, Math.min(head, content.length()))
                + "\n\n[... middle pruned: " + content.length() + " chars ...]\n\n"
                + content.substring(tailStart);
        return ChatMessage.builder()
                .role("tool")
                .toolCallId(message.getToolCallId())
                .name(message.getName())
                .content(pruned)
                .build();
    }

    private String roleOf(ChatMessage message) {
        return message.getRole() == null ? "" : message.getRole().toLowerCase(java.util.Locale.ROOT);
    }

    private String contentPrefix(String value) {
        if (value == null) {
            return "";
        }
        String flat = value.replaceAll("\\s+", " ").trim();
        return flat.length() > 80 ? flat.substring(0, 80) + "…" : flat;
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
            if (message.getContentParts() != null) {
                // Multimodal parts: text at chars/4; each image at a flat estimate
                // (~1024) instead of base64 length/4, which would wildly overstate
                // the provider's vision-token accounting.
                for (Object part : message.getContentParts()) {
                    if (part instanceof java.util.Map) {
                        java.util.Map<?, ?> map = (java.util.Map<?, ?>) part;
                        Object type = map.get("type");
                        if ("text".equals(type)) {
                            Object text = map.get("text");
                            if (text != null) {
                                tokens += String.valueOf(text).length() / 4;
                            }
                        } else if ("image_url".equals(type)) {
                            tokens += 1024;
                        }
                    }
                }
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
