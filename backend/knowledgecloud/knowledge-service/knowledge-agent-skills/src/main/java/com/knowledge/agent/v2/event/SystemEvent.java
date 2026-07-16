package com.knowledge.agent.v2.event;

/**
 * System events — infrastructure-level notifications (rate limiting, circuit breaking, etc.).
 */
public abstract class SystemEvent extends AgentEvent {

    protected SystemEvent(String sessionId) {
        super(sessionId);
    }

    /**
     * Emitted when a request is rate-limited.
     */
    public static class RateLimited extends SystemEvent {
        private final String reason;
        private final long retryAfterMs;

        public RateLimited(String sessionId, String reason, long retryAfterMs) {
            super(sessionId);
            this.reason = reason;
            this.retryAfterMs = retryAfterMs;
        }

        @Override
        public String type() {
            return "system.rate_limited";
        }

        public String getReason() {
            return reason;
        }

        public long getRetryAfterMs() {
            return retryAfterMs;
        }
    }

    /**
     * Emitted when a circuit breaker opens.
     */
    public static class CircuitBroken extends SystemEvent {
        private final String component;
        private final String reason;

        public CircuitBroken(String sessionId, String component, String reason) {
            super(sessionId);
            this.component = component;
            this.reason = reason;
        }

        @Override
        public String type() {
            return "system.circuit_broken";
        }

        public String getComponent() {
            return component;
        }

        public String getReason() {
            return reason;
        }
    }

    /**
     * Emitted when an error is automatically recovered (e.g., retry success).
     */
    public static class ErrorRecovered extends SystemEvent {
        private final String component;
        private final String originalError;
        private final int attemptNumber;

        public ErrorRecovered(String sessionId, String component, String originalError, int attemptNumber) {
            super(sessionId);
            this.component = component;
            this.originalError = originalError;
            this.attemptNumber = attemptNumber;
        }

        @Override
        public String type() {
            return "system.error_recovered";
        }

        public String getComponent() {
            return component;
        }

        public String getOriginalError() {
            return originalError;
        }

        public int getAttemptNumber() {
            return attemptNumber;
        }
    }
}
