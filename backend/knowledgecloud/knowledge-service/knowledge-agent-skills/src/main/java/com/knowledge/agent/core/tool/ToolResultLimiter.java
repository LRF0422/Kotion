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
     *
     *         <p>The emitted string never exceeds {@code maxChars} CHARACTERS, so
     *         the reader-side pruner — which compares characters — never cuts a
     *         result this method already cut.
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
            mapper.writeValue(new CappedOutputStream(buffer, contentBudget(maxChars)), result);
            return result;
        } catch (Exception e) {
            if (e instanceof LimitExceeded || e.getCause() instanceof LimitExceeded) {
                return new String(buffer.toByteArray(), StandardCharsets.UTF_8) + TRUNCATED_SUFFIX;
            }
            return UNREPRESENTABLE;
        }
    }

    /**
     * Char-budgeted truncation of an already-rendered string.
     *
     * <p>{@code maxChars} counts the marker, so a result truncated here is still
     * <= {@code maxChars} and the L1 pruner leaves it alone. {@link #bound} used
     * to spend its whole budget on payload bytes and then append the marker on top,
     * which put an ASCII result 14 chars ABOVE the cap: L1 cut it a second time
     * and, because its marker is fixed text, silently deleted the
     * "truncated" signal the model relies on to know the result is incomplete.
     */
    public static String truncateText(String text, int maxChars) {
        if (text == null || maxChars <= 0 || text.length() <= maxChars) {
            return text;
        }
        int keep = Math.min(contentBudget(maxChars), text.length());
        return text.substring(0, keep) + TRUNCATED_SUFFIX;
    }

    /**
     * Payload budget, leaving room for {@link #TRUNCATED_SUFFIX} inside the cap.
     *
     * <p>The cap is expressed in characters because that is the unit the token
     * estimate and the L1 pruner work in. ASCII is the common case and the only
     * one where bytes and chars coincide, so reserving the marker's length is
     * enough; multi-byte text comes out well below the char cap either way.
     */
    private static int contentBudget(int maxChars) {
        return Math.max(1, maxChars - TRUNCATED_SUFFIX.length());
    }

    /**
     * Whether {@code text} is the cut output of {@link #bound} rather than a
     * complete serialization.
     *
     * <p>The budget is bytes and the caller's decision is usually chars (what the
     * token estimate and the model see), so "too long" cannot be inferred from
     * the length alone: a Chinese payload carries 2–3 bytes per char.
     */
    public static boolean isTruncated(String text) {
        return text != null && text.endsWith(TRUNCATED_SUFFIX);
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
