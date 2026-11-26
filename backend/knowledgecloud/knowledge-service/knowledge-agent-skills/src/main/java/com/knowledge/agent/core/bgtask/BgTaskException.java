package com.knowledge.agent.core.bgtask;

/**
 * Stable business code + message for background-task failures.
 *
 * <p>The controller turns {@link #getCode()} into the {@code R.fail} text so the
 * client can branch on a code instead of parsing a Chinese message.
 */
public class BgTaskException extends RuntimeException {

    private final String code;

    public BgTaskException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}