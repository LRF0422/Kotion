package com.knowledge.agent.core.supervisor;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.loop.ResumePayload;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A tool-results resume is acknowledged by CALL ID, never by "the run is not
 * waiting right now".
 *
 * <p>The old rule answered any {@code tool_results} payload with success when the
 * run was not parked. In the window between the loop announcing the calls
 * ({@code tool.requested}) and its pause becoming visible, that dropped real
 * results on the floor: the client considered them delivered, the loop then
 * parked, and the run failed its tool timeout later with
 * "等待编辑器工具结果超时". These cases pin the idempotency check that replaced
 * the blanket answer — an unapplied batch must be queued for the loop, only a
 * genuinely duplicate one may be acknowledged.
 */
class DefaultRunSupervisorResumeAckTest {

    private ResumePayload payload(String... callIds) {
        ResumePayload payload = new ResumePayload();
        payload.setAction("tool_results");
        List<ResumePayload.ToolResultItem> results = new ArrayList<>();
        for (String callId : callIds) {
            ResumePayload.ToolResultItem item = new ResumePayload.ToolResultItem();
            item.setCallId(callId);
            item.setOk(true);
            results.add(item);
        }
        payload.setToolResults(results);
        return payload;
    }

    private ChatMessage toolResult(String callId) {
        return ChatMessage.builder()
                .role("tool")
                .toolCallId(callId)
                .content("{\"ok\":true}")
                .build();
    }

    private Checkpoint checkpointWith(ChatMessage... messages) {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setMessages(new ArrayList<>(List.of(messages)));
        return checkpoint;
    }

    @Test
    void anAppliedBatchIsAcknowledged() {
        assertTrue(DefaultRunSupervisor.toolResultsAlreadyApplied(
                checkpointWith(toolResult("call-1")), payload("call-1")),
                "a duplicate resume must not be queued again");
    }

    @Test
    void aBatchThatWasNeverAppliedIsNotAcknowledged() {
        assertFalse(DefaultRunSupervisor.toolResultsAlreadyApplied(
                checkpointWith(), payload("call-1")),
                "results arriving before the pause is visible must be queued, not acked");
    }

    @Test
    void aPartiallyAppliedBatchIsNotAcknowledged() {
        assertFalse(DefaultRunSupervisor.toolResultsAlreadyApplied(
                checkpointWith(toolResult("call-1")), payload("call-1", "call-2")),
                "one missing result is still a batch that must reach the loop");
    }

    @Test
    void anEmptyPayloadOrCheckpointIsNeverTreatedAsApplied() {
        assertFalse(DefaultRunSupervisor.toolResultsAlreadyApplied(null, payload("call-1")));

        Checkpoint emptyMessages = checkpointWith();
        assertFalse(DefaultRunSupervisor.toolResultsAlreadyApplied(emptyMessages, null));

        ResumePayload empty = new ResumePayload();
        empty.setAction("tool_results");
        empty.setToolResults(new ArrayList<>());
        assertFalse(DefaultRunSupervisor.toolResultsAlreadyApplied(emptyMessages, empty),
                "an empty payload is not proof of delivery");
    }
}
