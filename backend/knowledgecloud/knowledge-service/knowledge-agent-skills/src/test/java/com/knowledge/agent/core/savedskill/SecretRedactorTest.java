package com.knowledge.agent.core.savedskill;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecretRedactorTest {

    private final SecretRedactor redactor = new SecretRedactor();

    @Test
    void redactsStructuredAndPlaintextCredentials() {
        String input = "{\"apiKey\":\"sk-secret-value\",\"name\":\"safe\"}\n"
                + "password=hunter2\nAuthorization: Bearer abc.def.ghi\n"
                + "eyJabcdefghijk.abcdefghijk.abcdefghijk";

        String result = redactor.redact(input);

        assertTrue(result.contains("[REDACTED]"));
        assertTrue(result.contains("safe"));
        assertFalse(result.contains("sk-secret-value"));
        assertFalse(result.contains("hunter2"));
        assertFalse(result.contains("abc.def.ghi"));
        assertFalse(result.contains("eyJabcdefghijk"));
    }

    @Test
    void detectsSensitiveValuesWithoutChangingSafeText() {
        assertTrue(redactor.containsSensitiveValue("access_token=top-secret"));
        assertFalse(redactor.containsSensitiveValue("整理会议纪要并列出行动项"));
    }
}
