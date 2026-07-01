package com.knowledge.agent.controller;

import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * REST controller for agent state snapshots — inspection, deletion, and
 * (future) resume-from-checkpoint.
 *
 * <p>
 * Endpoints:
 * <ul>
 *   <li>{@code GET /api/v1/agent/state/{sessionId}} — returns the persisted
 *       state snapshot for a session</li>
 *   <li>{@code DELETE /api/v1/agent/state/{sessionId}} — clears the persisted
 *       snapshot</li>
 *   <li>{@code POST /api/v1/agent/resume/{sessionId}} — returns the snapshot
 *       so the caller can resubmit working messages via
 *       {@code /api/v1/chat/completions}. A full resume-from-checkpoint that
 *       re-enters the agent loop without a new client request can be added
 *       in a later phase.</li>
 * </ul>
 */
@Api(tags = "Agent State")
@Slf4j
@RestController
@RequestMapping("/api/v1/agent")
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "agent.state", name = "backend")
public class AgentStateController {

    private final AgentStateStore stateStore;

    /**
     * Get the persisted state snapshot for a session.
     */
    @ApiOperation("Get persisted agent state for a session")
    @GetMapping("/state/{sessionId}")
    public ResponseEntity<Map<String, Object>> getState(
            @PathVariable String sessionId) {
        AgentStateSnapshot snapshot = stateStore.load(sessionId);
        if (snapshot == null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("found", false);
            body.put("sessionId", sessionId);
            return ResponseEntity.ok(body);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("found", true);
        body.put("sessionId", snapshot.getSessionId());
        body.put("conversationId", snapshot.getConversationId());
        body.put("iteration", snapshot.getIteration());
        body.put("timestamp", snapshot.getTimestamp());
        body.put("messageCount", snapshot.getWorkingMessages() != null
                ? snapshot.getWorkingMessages().size() : 0);
        body.put("activatedSkillNames", snapshot.getActivatedSkillNames());
        body.put("toolCallCount", snapshot.getToolCallHistory() != null
                ? snapshot.getToolCallHistory().size() : 0);
        body.put("snapshot", snapshot);
        return ResponseEntity.ok(body);
    }

    /**
     * Delete the persisted state snapshot for a session.
     */
    @ApiOperation("Clear persisted agent state for a session")
    @DeleteMapping("/state/{sessionId}")
    public ResponseEntity<Map<String, Object>> deleteState(
            @PathVariable String sessionId) {
        boolean existed = stateStore.exists(sessionId);
        stateStore.delete(sessionId);
        log.info("Deleted agent state for sessionId={} (existed={})", sessionId, existed);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("deleted", existed);
        body.put("sessionId", sessionId);
        return ResponseEntity.ok(body);
    }

    /**
     * Resume an agent from its persisted checkpoint.
     *
     * <p>For now, this returns the snapshot so the caller can resubmit the
     * working messages via the existing {@code POST /api/v1/chat/completions}
     * endpoint. The chat completions handler will detect the existing snapshot
     * (by sessionId) and restore the loop state automatically.
     *
     * <p>A full resume-from-checkpoint that re-enters the agent loop without
     * a new client request can be implemented in a later phase.
     */
    @ApiOperation("Resume agent from checkpoint (returns snapshot)")
    @PostMapping("/resume/{sessionId}")
    public ResponseEntity<Map<String, Object>> resume(
            @PathVariable String sessionId) {
        AgentStateSnapshot snapshot = stateStore.load(sessionId);
        Map<String, Object> body = new LinkedHashMap<>();
        if (snapshot == null) {
            body.put("resumable", false);
            body.put("reason", "No persisted state found for sessionId=" + sessionId);
            return ResponseEntity.ok(body);
        }
        body.put("resumable", true);
        body.put("sessionId", snapshot.getSessionId());
        body.put("conversationId", snapshot.getConversationId());
        body.put("iteration", snapshot.getIteration());
        body.put("timestamp", snapshot.getTimestamp());
        body.put("messageCount", snapshot.getWorkingMessages() != null
                ? snapshot.getWorkingMessages().size() : 0);
        body.put("instruction", "Resubmit the working messages from the snapshot "
                + "via POST /api/v1/chat/completions with the same sessionId to "
                + "resume the agent loop from this checkpoint.");
        body.put("snapshot", snapshot);
        return ResponseEntity.ok(body);
    }
}
