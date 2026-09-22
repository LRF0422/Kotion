package com.knowledge.agent.core.profile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Turns a redacted conversation transcript into profile drafts.
 *
 * <p>Two defensive layers live here, both required by the privacy spec:
 * <ol>
 *   <li>the system prompt only authorises the allowlisted dimensions and
 *       forbids sensitive attributes;</li>
 *   <li>{@link #parseAndFilter(String)} re-validates every model output —
 *       dimension allowlist, sensitive-token blacklist, evidence presence and
 *       length — because model output is untrusted.</li>
 * </ol>
 */
@Slf4j
@Component
public class ProfileExtractor {

    static final String SYSTEM_PROMPT =
            "你是用户画像抽取器。请从对话中只提取“有明确证据支持”的低敏感用户特征。\n"
                    + "允许的维度（只能用这些，值用简短中文短语）：\n"
                    + "occupation 职业/职能角色；industry 行业/领域；expertise 专业主题；\n"
                    + "tech_stack 工具与技术栈；content_topic 内容兴趣主题；content_format 内容形式偏好；\n"
                    + "interaction_pref 交互/表达偏好；active_hours 活跃时段（如 09-12）。\n\n"
                    + "严格规则：\n"
                    + "1. 禁止推断性别、年龄、精神状态、性格、健康、政治宗教、性取向、位置、财务等敏感属性；\n"
                    + "   即使对话中明确提到，也不要输出。\n"
                    + "2. 每个特征必须能在对话中找到证据；没有证据就不要输出。\n"
                    + "3. 不确定就用较低 confidence（0-100 整数），不要编造。\n"
                    + "4. 只输出 JSON，不要解释、不要 Markdown 代码块。\n"
                    + "5. 输出格式：{\"traits\":[{\"dimension\":\"...\",\"value\":\"...\",\"confidence\":0,"
                    + "\"evidence\":\"不超过50字的原文依据\"}]}\n"
                    + "6. 没有任何可提取特征时输出 {\"traits\":[]}。";

    private final LlmGateway llmGateway;
    private final AgentCoreProperties properties;
    private final ObjectMapper objectMapper;

    public ProfileExtractor(LlmGateway llmGateway, AgentCoreProperties properties,
                            ObjectMapper objectMapper) {
        this.llmGateway = llmGateway;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /** Call the model and return the privacy-filtered drafts (never throws). */
    public ExtractionOutcome extract(String model, String transcript, List<String> knownTraits) {
        if (model == null || model.trim().isEmpty() || transcript == null || transcript.trim().isEmpty()) {
            return ExtractionOutcome.failed();
        }
        try {
            List<ChatMessage> prompt = new ArrayList<>();
            prompt.add(ChatMessage.builder().role("system").content(SYSTEM_PROMPT).build());
            StringBuilder user = new StringBuilder();
            if (knownTraits != null && !knownTraits.isEmpty()) {
                user.append("【已知画像（不要重复输出）】\n");
                for (String known : knownTraits) {
                    if (known != null && !known.trim().isEmpty()) {
                        user.append("- ").append(known.trim()).append('\n');
                    }
                }
                user.append('\n');
            }
            user.append("【最近一段对话】\n").append(transcript);
            prompt.add(ChatMessage.builder().role("user").content(user.toString()).build());

            LlmResult result = llmGateway.infer(LlmInferRequest.builder()
                    .model(model)
                    .messages(prompt)
                    .temperature(0.0)
                    .maxTokens(Math.max(128, properties.getProfile().getMaxOutputTokens()))
                    .build());
            if (result == null) {
                return ExtractionOutcome.failed();
            }
            List<ProfileTraitDraft> drafts = parseAndFilter(result.getText());
            return new ExtractionOutcome(drafts, result.getPromptTokens(),
                    result.getCompletionTokens(), true);
        } catch (Exception e) {
            log.warn("profile extraction LLM call failed: {}", e.getMessage());
            return ExtractionOutcome.failed();
        }
    }

    /**
     * Parse the model's JSON and drop everything that fails the privacy gate.
     * Public so the compliance test can exercise it without a live model.
     */
    public List<ProfileTraitDraft> parseAndFilter(String raw) {
        List<ProfileTraitDraft> drafts = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) {
            return drafts;
        }
        JsonNode root = readJson(raw);
        if (root == null) {
            return drafts;
        }
        JsonNode array;
        if (root.isArray()) {
            array = root;
        } else if (root.isObject() && root.get("traits") != null && root.get("traits").isArray()) {
            array = root.get("traits");
        } else if (root.isObject() && root.has("dimension")) {
            // A bare single trait object is tolerated for model variance.
            array = objectMapper.createArrayNode().add(root);
        } else {
            return drafts;
        }
        for (JsonNode node : array) {
            ProfileTraitDraft draft = toDraft(node);
            if (draft != null) {
                drafts.add(draft);
            }
        }
        return drafts;
    }

    /** Parse the raw text, tolerating a Markdown code fence around the JSON. */
    private JsonNode readJson(String raw) {
        String text = raw.trim();
        try {
            return objectMapper.readTree(text);
        } catch (Exception ignored) {
            // fall through to brace extraction
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return objectMapper.readTree(text.substring(start, end + 1));
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private ProfileTraitDraft toDraft(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        String dimension = text(node, "dimension");
        String value = text(node, "value");
        String evidence = text(node, "evidence");
        if (dimension == null || value == null || evidence == null) {
            return null; // evidence is mandatory
        }
        if (value.length() > 128) {
            return null;
        }
        if (!ProfileDimension.isAllowlisted(dimension)) {
            return null;
        }
        if (!ProfileSensitivity.isStorable(dimension, value, evidence)) {
            log.info("profile draft dropped by sensitivity gate: dimension={}", dimension);
            return null;
        }
        int confidence = ProfileMerger.clamp(node.path("confidence").asInt(0));
        return new ProfileTraitDraft(dimension.trim().toLowerCase(), value.trim(), confidence,
                evidence.trim());
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return text == null || text.trim().isEmpty() ? null : text.trim();
    }

    /** Extraction result plus the token usage needed for side-channel accounting. */
    public static final class ExtractionOutcome {
        private final List<ProfileTraitDraft> drafts;
        private final long promptTokens;
        private final long completionTokens;
        private final boolean ok;

        ExtractionOutcome(List<ProfileTraitDraft> drafts, long promptTokens,
                          long completionTokens, boolean ok) {
            this.drafts = drafts != null ? drafts : Collections.<ProfileTraitDraft>emptyList();
            this.promptTokens = promptTokens;
            this.completionTokens = completionTokens;
            this.ok = ok;
        }

        static ExtractionOutcome failed() {
            return new ExtractionOutcome(Collections.<ProfileTraitDraft>emptyList(), 0L, 0L, false);
        }

        public List<ProfileTraitDraft> getDrafts() {
            return drafts;
        }

        public long getPromptTokens() {
            return promptTokens;
        }

        public long getCompletionTokens() {
            return completionTokens;
        }

        public boolean isOk() {
            return ok;
        }
    }
}
