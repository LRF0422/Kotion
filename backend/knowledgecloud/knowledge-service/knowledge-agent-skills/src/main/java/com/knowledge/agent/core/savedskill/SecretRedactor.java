package com.knowledge.agent.core.savedskill;

import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Removes common credential forms before conversation content reaches the skill
 * compiler. The projector applies this to every visible message and tool value.
 */
@Component
public class SecretRedactor {

    private static final String REDACTED = "[REDACTED]";

    private static final Pattern JSON_SECRET = Pattern.compile(
            "(?i)(\\\"(?:authorization|cookie|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|private[_-]?key)\\\"\\s*:\\s*\\\")[^\\\"]*(\\\")");
    private static final Pattern ASSIGNMENT_SECRET = Pattern.compile(
            "(?i)\\b(authorization|cookie|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|private[_-]?key)\\s*[:=]\\s*([^\\s,;]+)");
    private static final Pattern BEARER = Pattern.compile("(?i)\\bBearer\\s+[A-Za-z0-9._~+\\-/]+=*");
    private static final Pattern JWT = Pattern.compile(
            "\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b");
    private static final Pattern PRIVATE_KEY = Pattern.compile(
            "(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----");

    public String redact(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        String redacted = PRIVATE_KEY.matcher(value).replaceAll(REDACTED);
        redacted = JSON_SECRET.matcher(redacted).replaceAll("$1" + REDACTED + "$2");
        redacted = BEARER.matcher(redacted).replaceAll("Bearer " + REDACTED);
        redacted = ASSIGNMENT_SECRET.matcher(redacted).replaceAll("$1=" + REDACTED);
        return JWT.matcher(redacted).replaceAll(REDACTED);
    }

    public boolean containsSensitiveValue(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        return !value.equals(redact(value));
    }
}
