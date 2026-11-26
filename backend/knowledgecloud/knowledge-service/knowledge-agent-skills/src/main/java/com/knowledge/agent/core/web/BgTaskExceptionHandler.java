package com.knowledge.agent.core.web;

import com.knowledge.agent.core.bgtask.BgTaskException;
import com.knowledge.core.tool.api.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns {@link BgTaskException} into a stable {@code CODE: message} failure.
 *
 * <p>Scoped to {@link BgTaskController} so it cannot change error handling for
 * the run/agent endpoints.
 */
@Slf4j
@RestControllerAdvice(assignableTypes = BgTaskController.class)
public class BgTaskExceptionHandler {

    @ExceptionHandler(BgTaskException.class)
    public R<Object> handleBgTask(BgTaskException e) {
        return R.fail(e.getCode() + ": " + e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public R<Object> handleUnexpected(Exception e) {
        log.error("Background task request failed", e);
        return R.fail("TASK_INTERNAL: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
    }
}