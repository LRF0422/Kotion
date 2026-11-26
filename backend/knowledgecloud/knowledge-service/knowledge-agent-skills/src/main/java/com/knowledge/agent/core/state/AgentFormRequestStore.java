package com.knowledge.agent.core.state;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentFormRequestEntity;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.mapper.AgentFormRequestMapper;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.agent.core.session.ChatSessionStore;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * Durable form inbox ({@code agent_form_request}).
 *
 * <p>{@code requestUserForm} creates the form here, so a refresh/restart (or
 * another device) still sees the same form and answer. The pending list is the
 * server-side version of {@code FormRequestsPanel}; the existing client
 * registry can become a cache over this store.
 */
@Component
public class AgentFormRequestStore {

    public static final int MAX_SCHEMA_BYTES = 64 * 1024;
    public static final int MAX_ANSWER_BYTES = 64 * 1024;
    public static final int MAX_TITLE_CHARS = 120;

    private final AgentFormRequestMapper mapper;
    private final AgentRunMapper runMapper;
    private final ChatSessionStore chatSessionStore;
    private final ObjectMapper objectMapper;
    private final LongSupplier clock;

    @Autowired
    public AgentFormRequestStore(AgentFormRequestMapper mapper, AgentRunMapper runMapper,
                                 ChatSessionStore chatSessionStore, ObjectMapper objectMapper) {
        this(mapper, runMapper, chatSessionStore, objectMapper, new LongSupplier() {
            @Override
            public long getAsLong() {
                return System.currentTimeMillis();
            }
        });
    }

    /** Test seam. */
    AgentFormRequestStore(AgentFormRequestMapper mapper, AgentRunMapper runMapper,
                          ChatSessionStore chatSessionStore, ObjectMapper objectMapper,
                          LongSupplier clock) {
        this.mapper = mapper;
        this.runMapper = runMapper;
        this.chatSessionStore = chatSessionStore;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        this.clock = clock != null ? clock : new LongSupplier() {
            @Override
            public long getAsLong() {
                return System.currentTimeMillis();
            }
        };
    }

    @Transactional(rollbackFor = Exception.class)
    public AgentFormRequestEntity create(long tenantId, long userId, CreateCommand cmd) {
        requireOwner(tenantId, userId);
        if (cmd == null) {
            throw new AgentStateException("INVALID_ARGUMENT", "form request is required");
        }
        String conversationId = requireText(cmd.getConversationId(), 128, "conversationId");
        validateConversation(tenantId, userId, conversationId);
        String title = requireText(cmd.getTitle(), MAX_TITLE_CHARS, "title");
        Object schema = cmd.getSchema();
        if (schema == null) {
            throw new AgentStateException("FORM_SCHEMA_REQUIRED", "form schema is required");
        }
        String schemaJson = serialize(schema, MAX_SCHEMA_BYTES, "schema");
        validateRun(tenantId, userId, cmd.getRunId());

        long now = clock.getAsLong();
        AgentFormRequestEntity entity = new AgentFormRequestEntity();
        entity.setFormId("form_" + UUID.randomUUID().toString().replace("-", ""));
        entity.setConversationId(conversationId);
        entity.setRunId(trimToNull(cmd.getRunId(), 64));
        entity.setCallId(trimToNull(cmd.getCallId(), 64));
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setTitle(title);
        entity.setSchemaJson(schemaJson);
        entity.setStatus(AgentFormRequestEntity.STATUS_PENDING);
        entity.setCreatedAt(now);
        entity.setExpiresAt(cmd.getExpiresAt() != null && cmd.getExpiresAt() > 0
                ? cmd.getExpiresAt() : null);
        mapper.insertForm(entity);
        return entity;
    }

    public AgentFormRequestEntity get(long tenantId, long userId, String formId) {
        AgentFormRequestEntity entity = requireForm(tenantId, userId, formId);
        expireIfNeeded(entity);
        return entity;
    }

    public List<AgentFormRequestEntity> list(long tenantId, long userId, String status,
                                             String conversationId, int limit) {
        requireOwner(tenantId, userId);
        int effective = limit <= 0 ? 100 : Math.min(limit, 200);
        List<AgentFormRequestEntity> rows = mapper.selectByStatus(tenantId, userId,
                trimToNull(status, 16) == null ? AgentFormRequestEntity.STATUS_PENDING : status.trim(),
                trimToNull(conversationId, 128), effective);
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        for (AgentFormRequestEntity row : rows) {
            expireIfNeeded(row);
        }
        return rows;
    }

    @Transactional(rollbackFor = Exception.class)
    public AgentFormRequestEntity answer(long tenantId, long userId, String formId, AnswerCommand cmd) {
        AgentFormRequestEntity entity = requireForm(tenantId, userId, formId);
        expireIfNeeded(entity);
        if (!AgentFormRequestEntity.STATUS_PENDING.equals(entity.getStatus())) {
            return entity;
        }
        if (cmd == null) {
            throw new AgentStateException("INVALID_ARGUMENT", "answer is required");
        }
        long now = clock.getAsLong();
        String valuesJson = serializeOptional(cmd.getValues(), MAX_ANSWER_BYTES, "values");
        String rowsJson = serializeOptional(cmd.getRows(), MAX_ANSWER_BYTES, "rows");
        if (valuesJson == null && rowsJson == null) {
            throw new AgentStateException("FORM_ANSWER_REQUIRED", "values or rows is required");
        }
        int updated = mapper.answer(tenantId, userId, formId, valuesJson, rowsJson, now);
        AgentFormRequestEntity latest = requireForm(tenantId, userId, formId);
        if (updated == 0) {
            return latest;
        }
        latest.setStatus(AgentFormRequestEntity.STATUS_ANSWERED);
        latest.setValuesJson(valuesJson);
        latest.setRowsJson(rowsJson);
        latest.setAnsweredAt(now);
        return latest;
    }

    @Transactional(rollbackFor = Exception.class)
    public AgentFormRequestEntity cancel(long tenantId, long userId, String formId, String reason) {
        AgentFormRequestEntity entity = requireForm(tenantId, userId, formId);
        if (!AgentFormRequestEntity.STATUS_PENDING.equals(entity.getStatus())) {
            return entity;
        }
        long now = clock.getAsLong();
        mapper.cancel(tenantId, userId, formId, truncateToNull(reason, 500), now);
        AgentFormRequestEntity latest = requireForm(tenantId, userId, formId);
        latest.setStatus(AgentFormRequestEntity.STATUS_CANCELLED);
        latest.setCancelReason(truncateToNull(reason, 500));
        latest.setAnsweredAt(now);
        return latest;
    }

    @Transactional(rollbackFor = Exception.class)
    public AgentFormRequestEntity markDelivered(long tenantId, long userId, String formId) {
        AgentFormRequestEntity entity = requireForm(tenantId, userId, formId);
        if (!AgentFormRequestEntity.STATUS_ANSWERED.equals(entity.getStatus())
                || entity.getDeliveredAt() != null) {
            return entity;
        }
        long now = clock.getAsLong();
        mapper.markDelivered(tenantId, userId, formId, now);
        entity.setDeliveredAt(now);
        return entity;
    }

    // ==================== internals ====================

    private AgentFormRequestEntity requireForm(long tenantId, long userId, String formId) {
        String id = requireText(formId, 64, "formId");
        AgentFormRequestEntity entity = mapper.selectByFormId(tenantId, userId, id);
        if (entity == null) {
            throw new AgentStateException("FORM_NOT_FOUND", "no such form: " + id);
        }
        return entity;
    }

    private void validateConversation(long tenantId, long userId, String conversationId) {
        if (chatSessionStore == null) {
            return;
        }
        Object session = chatSessionStore.get(tenantId, userId, conversationId);
        if (session == null) {
            throw new AgentStateException("CONVERSATION_NOT_FOUND",
                    "conversation does not belong to the caller: " + conversationId);
        }
    }

    private void validateRun(long tenantId, long userId, String runId) {
        String id = trimToNull(runId, 64);
        if (id == null || runMapper == null) {
            return;
        }
        AgentRunEntity run = runMapper.selectByRunId(id);
        if (run == null || run.getTenantId() == null || run.getUserId() == null
                || run.getTenantId().longValue() != tenantId
                || run.getUserId().longValue() != userId) {
            throw new AgentStateException("RUN_NOT_FOUND", "no such run: " + id);
        }
    }

    private void expireIfNeeded(AgentFormRequestEntity entity) {
        if (entity == null || !AgentFormRequestEntity.STATUS_PENDING.equals(entity.getStatus())) {
            return;
        }
        Long expiresAt = entity.getExpiresAt();
        if (expiresAt == null || expiresAt <= 0) {
            return;
        }
        long now = clock.getAsLong();
        if (expiresAt >= now) {
            return;
        }
        mapper.expire(entity.getFormId(), now);
        entity.setStatus(AgentFormRequestEntity.STATUS_EXPIRED);
        entity.setAnsweredAt(now);
    }

    private static void requireOwner(long tenantId, long userId) {
        if (tenantId <= 0 || userId <= 0) {
            throw new AgentStateException("IDENTITY_REQUIRED", "tenantId and userId are required");
        }
    }

    private static String requireText(String value, int max, String field) {
        String text = trimToNull(value, max);
        if (text == null) {
            throw new AgentStateException("INVALID_ARGUMENT", field + " is required");
        }
        return text;
    }

    private static String trimToNull(String value, int max) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        if (text.length() == 0) {
            return null;
        }
        return text.length() > max ? text.substring(0, max) : text;
    }

    private static String truncateToNull(String value, int max) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        if (text.length() == 0) {
            return null;
        }
        return text.length() > max ? text.substring(0, max) : text;
    }

    private String serialize(Object value, int maxBytes, String field) {
        byte[] bytes = serializeBytes(value, field);
        if (bytes.length > maxBytes) {
            throw new AgentStateException("PAYLOAD_TOO_LARGE",
                    field + " serializes to " + bytes.length + " bytes (max " + maxBytes + ")");
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private String serializeOptional(Object value, int maxBytes, String field) {
        return value == null ? null : serialize(value, maxBytes, field);
    }

    private byte[] serializeBytes(Object value, String field) {
        try {
            return objectMapper.writeValueAsBytes(value);
        } catch (JsonProcessingException e) {
            throw new AgentStateException("PAYLOAD_INVALID",
                    field + " is not JSON-serializable: " + e.getOriginalMessage());
        }
    }

    @Data
    public static class CreateCommand {
        private String conversationId;
        private String runId;
        private String callId;
        private String title;
        private Object schema;
        private Long expiresAt;
    }

    @Data
    public static class AnswerCommand {
        private Object values;
        private Object rows;
    }
}