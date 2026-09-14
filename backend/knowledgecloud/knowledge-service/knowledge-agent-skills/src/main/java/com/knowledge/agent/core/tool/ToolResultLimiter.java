package com.knowledge.agent.core.tool;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Byte-capped JSON serialization for tool payloads.
 *
 * <p>Frontend tools can return very large (and heavily-shared) page structures.
 * Serializing those unbounded blocks the loop thread, floods Redis/MySQL and —
 * with mapper SQL logging on — dumps hundreds of KB per step. This limiter
 * aborts the writer as soon as the byte budget is spent, so even an
 * explosively large object graph stops at the cap instead of being fully
 * materialized.
 */
public final class ToolResultLimiter {

    private static final String TRUNCATED_SUFFIX = "\n...[truncated]";
    private static final String UNREPRESENTABLE = "[tool result could not be serialized]";

    private ToolResultLimiter() {
    }

    /**
     * @return the original object when it fits {@code maxChars} (keeps it
     *         structured for the client), otherwise a truncated JSON-text
     *         string; {@code null} when the input is null.
     */
    public static Object bound(Object result, ObjectMapper mapper, int maxChars) {
        if (result == null) {
            return null;
        }
        if (maxChars <= 0) {
            return result;
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(Math.min(maxChars, 8192));
        try {
            mapper.writeValue(new CappedOutputStream(buffer, maxChars), result);
            return result;
        } catch (Exception e) {
            if (e instanceof LimitExceeded || e.getCause() instanceof LimitExceeded) {
                return new String(buffer.toByteArray(), StandardCharsets.UTF_8) + TRUNCATED_SUFFIX;
            }
            return UNREPRESENTABLE;
        }
    }

    /** OutputStream that aborts serialization once the byte budget is spent. */
    private static final class CappedOutputStream extends OutputStream {
        private final OutputStream delegate;
        private final int max;
        private int count;

        private CappedOutputStream(OutputStream delegate, int max) {
            this.delegate = delegate;
            this.max = max;
        }

        @Override
        public void write(int b) throws IOException {
            if (count >= max) {
                throw new LimitExceeded();
            }
            delegate.write(b);
            count++;
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            if (count + len > max) {
                int allowed = Math.max(0, max - count);
                delegate.write(b, off, allowed);
                count += allowed;
                throw new LimitExceeded();
            }
            delegate.write(b, off, len);
            count += len;
        }
    }

    /** Signals that the serialization byte budget was exhausted. */
    private static final class LimitExceeded extends RuntimeException {
    }
}
