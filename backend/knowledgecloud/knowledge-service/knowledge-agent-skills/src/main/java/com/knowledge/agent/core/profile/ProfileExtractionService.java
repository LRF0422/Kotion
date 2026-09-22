package com.knowledge.agent.core.profile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import com.knowledge.agent.core.entity.AgentProfileExtractionEntity;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.savedskill.SecretRedactor;
import com.knowledge.agent.core.session.ChatSessionStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Async derivation of the user profile from the engine-owned canonical session
 * log. Triggered once per completed ROOT run, throttled per session by a
 * watermark, and only for users who explicitly opted in.
 *
 * <p>Failure policy: derived data must never affect a run. Every problem is
 * logged and swallowed; the watermark is only advanced on success.
 */
@Slf4j
@Component
public class ProfileExtractionService {

    /** Context blocks this system injects — never treat them as user evidence. */
    private static final String[] INJECTED_MARKERS = {
            "【用户画像", "【关于用户的长期记忆", "【本次会话的近期进展"
    };
    private static final int MAX_EXCERPT_CHARS = 200;

    private final ProfileStore store;
    private final ProfileExtractor extractor;
    private final ProfileMerger merger;
    private final ChatSessionStore sessionStore;
    private final SecretRedactor secretRedactor;
    private final AgentCoreProperties properties;
    private final ObjectMapper objectMapper;
    /** Optional (tests): side-channel token usage is billed to the source run. */
    private final RunStore runStore;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "agentcore-profile-extract");
        thread.setDaemon(true);
        return thread;
    });

    public ProfileExtractionService(ProfileStore store,
                                    ProfileExtractor extractor,
                                    ProfileMerger merger,
                                    ChatSessionStore sessionStore,
                                    SecretRedactor secretRedactor,
                                    AgentCoreProperties properties,
                                    ObjectMapper objectMapper) {
        this(store, extractor, merger, sessionStore, secretRedactor, properties, objectMapper, null);
    }

    @Autowired
    public ProfileExtractionService(ProfileStore store,
                                    ProfileExtractor extractor,
                                    ProfileMerger merger,
                                    ChatSessionStore sessionStore,
                                    SecretRedactor secretRedactor,
                                    AgentCoreProperties properties,
                                    ObjectMapper objectMapper,
                                    RunStore runStore) {
        this.store = store;
        this.extractor = extractor;
        this.merger = merger;
        this.sessionStore = sessionStore;
        this.secretRedactor = secretRedactor;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.runStore = runStore;
    }

    /** Fire-and-forget extraction for a terminal root run. */
    public void extractAsync(AgentRun run) {
        if (run == null || run.getParentRunId() != null) {
            return;
        }
        if (!properties.getProfile().isEnabled()) {
            return;
        }
        executor.submit(() -> {
            try {
                extract(run);
            } catch (Exception e) {
                log.warn("profile extraction failed for run {}: {}", run.getRunId(), e.getMessage());
            }
        });
    }

    /** Visible for tests: run extraction synchronously. */
    public void extract(AgentRun run) {
        Long tenantId = run.getTenantId();
        Long userId = run.getUserId();
        String sessionId = run.getConversationId();
        if (tenantId == null || userId == null || sessionId == null || sessionId.trim().isEmpty()) {
            return;
        }
        if (!store.isConsentGiven(tenantId, userId)) {
            return;
        }
        AgentChatSessionEntity session = sessionStore.get(tenantId, userId, sessionId);
        if (session == null || isBlank(session.getModelMessagesJson())) {
            return;
        }

        List<String> messages = visibleMessages(session.getModelMessagesJson());
        int count = messages.size();
        if (count == 0) {
            return;
        }
        AgentCoreProperties.Profile config = properties.getProfile();
        AgentProfileExtractionEntity watermark = store.getWatermark(tenantId, userId, sessionId);
        int lastCount = watermark != null && watermark.getExtractedMessageCount() != null
                ? watermark.getExtractedMessageCount() : 0;
        if (lastCount > 0 && count - lastCount < Math.max(1, config.getMinNewMessages())) {
            return;
        }
        if (lastCount == 0 && count < 2) {
            return;
        }

        String model = isBlank(config.getModel()) ? run.getModel() : config.getModel();
        if (isBlank(model)) {
            return;
        }

        String transcript = buildTranscript(messages, Math.max(1000, config.getMaxTranscriptChars()));
        if (transcript.isEmpty()) {
            return;
        }
        List<String> known = knownTraits(tenantId, userId);

        ProfileExtractor.ExtractionOutcome outcome = extractor.extract(model, transcript, known);
        String runId = run.getRunId();
        if (!outcome.isOk()) {
            store.saveWatermark(tenantId, userId, sessionId, lastCount, runId, model, "failed");
            accountUsage(runId, outcome);
            return;
        }

        applyDrafts(tenantId, userId, sessionId, runId, outcome.getDrafts());
        store.saveWatermark(tenantId, userId, sessionId, count, runId, model, "ok");
        accountUsage(runId, outcome);
    }

    private void applyDrafts(Long tenantId, Long userId, String sessionId, String runId,
                             List<ProfileTraitDraft> drafts) {
        if (drafts == null || drafts.isEmpty()) {
            return;
        }
        AgentCoreProperties.Profile config = properties.getProfile();
        long now = System.currentTimeMillis();
        int active = store.countActive(tenantId, userId);
        for (ProfileTraitDraft draft : drafts) {
            if (draft == null) {
                continue;
            }
            String dimension = draft.getDimension();
            String value = ProfileMerger.normalizeValue(draft.getValue());
            if (dimension == null || value == null) {
                continue;
            }
            ProfileTrait existing = store.findByKey(tenantId, userId, dimension, value);
            if (existing == null && active >= Math.max(1, config.getMaxTraitsPerUser())) {
                log.info("profile trait cap reached for {}:{} — dropping further drafts", tenantId, userId);
                break;
            }
            ProfileTrait merged = merger.merge(tenantId, userId, existing, draft, now);
            if (merged == null) {
                continue; // tombstoned / suppressed — never revive
            }
            store.upsert(merged);
            store.addEvidence(tenantId, userId, merged.getTraitId(), sessionId, runId,
                    excerpt(draft.getEvidence()), now);
            store.trimEvidence(tenantId, userId, merged.getTraitId(),
                    Math.max(1, config.getMaxEvidencePerTrait()));
            if (existing == null) {
                active++;
            }
        }
    }

    private List<String> knownTraits(Long tenantId, Long userId) {
        List<String> known = new ArrayList<>();
        for (ProfileTrait trait : store.listActive(tenantId, userId, 50)) {
            known.add(trait.getDimension() + ":" + trait.getTraitValue());
        }
        return known;
    }

    /** Only user/assistant visible text; tool output and injected blocks are skipped. */
    private List<String> visibleMessages(String modelLogJson) {
        List<String> messages = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(modelLogJson);
            if (root == null || !root.isArray()) {
                return messages;
            }
            for (JsonNode node : root) {
                if (node == null || node.isNull()) {
                    continue;
                }
                JsonNode message = node.has("m") ? node.get("m") : node;
                if (message == null || !message.isObject()) {
                    continue;
                }
                String role = message.path("role").asText("");
                if (!"user".equalsIgnoreCase(role) && !"assistant".equalsIgnoreCase(role)) {
                    continue;
                }
                String content = message.path("content").asText("");
                if (content == null || content.trim().isEmpty() || isInjectedBlock(content)) {
                    continue;
                }
                messages.add("[" + role.toLowerCase() + "] " + content.trim());
            }
        } catch (Exception e) {
            log.warn("profile model-log parse failed: {}", e.getMessage());
        }
        return messages;
    }

    private boolean isInjectedBlock(String content) {
        String trimmed = content.trim();
        for (String marker : INJECTED_MARKERS) {
            if (trimmed.startsWith(marker)) {
                return true;
            }
        }
        return false;
    }

    /** Tail of the conversation, redacted, bounded by maxChars (oldest dropped first). */
    private String buildTranscript(List<String> messages, int maxChars) {
        List<String> selected = new ArrayList<>();
        int used = 0;
        for (int i = messages.size() - 1; i >= 0; i--) {
            String redacted = secretRedactor.redact(messages.get(i));
            if (redacted == null) {
                continue;
            }
            if (used + redacted.length() > maxChars) {
                int remaining = maxChars - used;
                if (remaining > 0) {
                    selected.add(redacted.substring(0, remaining));
                }
                break;
            }
            selected.add(redacted);
            used += redacted.length();
        }
        Collections.reverse(selected);
        return String.join("\n", selected);
    }

    private String excerpt(String evidence) {
        if (evidence == null) {
            return null;
        }
        String redacted = secretRedactor.redact(evidence.trim());
        if (redacted == null) {
            return null;
        }
        return redacted.length() > MAX_EXCERPT_CHARS
                ? redacted.substring(0, MAX_EXCERPT_CHARS) : redacted;
    }

    private void accountUsage(String runId, ProfileExtractor.ExtractionOutcome outcome) {
        if (runStore == null || outcome == null || isBlank(runId)) {
            return;
        }
        if (outcome.getPromptTokens() <= 0 && outcome.getCompletionTokens() <= 0) {
            return;
        }
        try {
            AgentRun run = runStore.load(runId);
            if (run == null) {
                return;
            }
            run.setPromptTokens(run.getPromptTokens() + outcome.getPromptTokens());
            run.setCompletionTokens(run.getCompletionTokens() + outcome.getCompletionTokens());
            run.touch();
            runStore.persist(run);
            runStore.saveHot(run);
        } catch (Exception e) {
            log.warn("profile extraction usage accounting failed for {}: {}", runId, e.getMessage());
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }
}
