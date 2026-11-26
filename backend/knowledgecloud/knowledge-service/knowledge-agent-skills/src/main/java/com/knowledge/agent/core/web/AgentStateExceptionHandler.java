package com.knowledge.agent.core.web;

import com.knowledge.agent.core.state.AgentStateException;
import com.knowledge.core.tool.api.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Stable {@code CODE: message} failures for tool-ledger/form/run-discovery endpoints. */
@Slf4j
@RestControllerAdvice(assignableTypes = {
        AgentToolCallController.class,
        AgentFormController.class,
        AgentRunDiscoveryController.class,
})
public class AgentStateExceptionHandler {

    @ExceptionHandler(AgentStateException.class)
    public R<Object> handleState(AgentStateException e) {
        return R.fail(e.getCode() + ": " + e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public R<Object> handleUnexpected(Exception e) {
        log.error("Agent runtime-state request failed", e);
        return R.fail("AGENT_STATE_INTERNAL: "
                + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
    }
}