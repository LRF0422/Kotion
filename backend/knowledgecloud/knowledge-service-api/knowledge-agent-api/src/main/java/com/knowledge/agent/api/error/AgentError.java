package com.knowledge.agent.api.error;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Structured agent error.
 *
 * <p>Carries a machine-readable {@link AgentErrorCode}, a human-readable
 * {@code message}, a {@code retriable} hint for the client, and optional
 * {@code detail} (e.g. provider error body, stack summary).
 *
 * <p>This is the canonical error contract shared across modules. It is surfaced
 * to the wire as optional fields on the existing error frame
 * ({@code code} / {@code retriable}), keeping older clients working.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentError {

    /** Machine-readable error class. */
    private AgentErrorCode code;

    /** Human-readable message (safe to show / log). */
    private String message;

    /** Whether the client may retry this request. */
    private boolean retriable;

    /** Optional extra detail (provider body, cause summary). May be null. */
    private String detail;

    /**
     * Build an error from a code, deriving {@code retriable} from the code's
     * default classification.
     */
    public static AgentError of(AgentErrorCode code, String message) {
        return AgentError.builder()
                .code(code)
                .message(message)
                .retriable(code != null && code.isRetriableByDefault())
                .build();
    }

    /**
     * Build an error from a code with an explicit retriable override and detail.
     */
    public static AgentError of(AgentErrorCode code, String message, boolean retriable, String detail) {
        return AgentError.builder()
                .code(code)
                .message(message)
                .retriable(retriable)
                .detail(detail)
                .build();
    }

    /** The code name as a string (null-safe), for wire encoding. */
    public String codeName() {
        return code != null ? code.name() : null;
    }
}
