package com.knowledge.agent.core.run;

import lombok.Data;

/**
 * One item of a run's task list (the model-maintained to-do list).
 *
 * <p>The list is a working-memory artifact, not an execution unit: it lives in
 * the checkpoint, is announced with {@code todo.updated}, and is projected into
 * the UI transcript so a finished turn still shows what it set out to do.
 *
 * <p>Statuses are deliberately three-valued, matching how a plan actually moves:
 * {@code pending} → {@code in_progress} → {@code completed}. Anything else the
 * model sends is normalised to {@code pending}.
 */
@Data
public class TodoItem {

    public static final String PENDING = "pending";
    public static final String IN_PROGRESS = "in_progress";
    public static final String COMPLETED = "completed";

    private String id;

    private String title;

    private String status = PENDING;

    public static TodoItem of(String id, String title, String status) {
        TodoItem item = new TodoItem();
        item.setId(id);
        item.setTitle(title);
        item.setStatus(status);
        return item;
    }

    /** Coerce an unknown status onto the three the UI can render. */
    public static String normalizeStatus(String raw) {
        if (raw == null) {
            return PENDING;
        }
        String value = raw.trim().toLowerCase(java.util.Locale.ROOT).replace('-', '_').replace(' ', '_');
        if ("completed".equals(value) || "done".equals(value) || "complete".equals(value)
                || "finished".equals(value)) {
            return COMPLETED;
        }
        if ("in_progress".equals(value) || "inprogress".equals(value) || "running".equals(value)
                || "active".equals(value) || "doing".equals(value)) {
            return IN_PROGRESS;
        }
        return PENDING;
    }
}
