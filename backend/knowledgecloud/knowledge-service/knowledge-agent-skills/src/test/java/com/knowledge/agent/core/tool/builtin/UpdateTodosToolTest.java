package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.run.TodoItem;
import com.knowledge.agent.core.task.SessionTaskRecorder;
import com.knowledge.agent.core.tool.ToolContext;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** Task-list tool contract: normalisation, whole-list overwrite, statuses. */
class UpdateTodosToolTest {

    /** Partial wiring (null recorder) must keep the tool usable. */
    private final UpdateTodosTool tool = new UpdateTodosTool(null);

    @Test
    void normalisesItemsAndFillsIds() {
        List<Object> raw = new ArrayList<>();
        raw.add(item("读现状", "done", null));
        raw.add(item("改代码", "running", "step-2"));
        raw.add(item("  ", "pending", null));
        raw.add(item("验收", "whatever", null));

        List<TodoItem> items = UpdateTodosTool.normalize(raw);

        // The untitled row is dropped rather than rendered as a blank checkbox.
        assertEquals(3, items.size());
        assertEquals(TodoItem.COMPLETED, items.get(0).getStatus());
        assertEquals("t1", items.get(0).getId(), "missing ids are filled positionally");
        assertEquals(TodoItem.IN_PROGRESS, items.get(1).getStatus());
        assertEquals("step-2", items.get(1).getId(), "a supplied id is kept");
        assertEquals(TodoItem.PENDING, items.get(2).getStatus(), "unknown status falls back to pending");
    }

    @Test
    void wholeListOverwriteReplacesPreviousState() {
        ToolContext context = new ToolContext();

        tool.execute(single("items", Arrays.asList(item("一", "pending", null), item("二", "pending", null))), context);
        assertEquals(2, context.getTodos().read().size());

        Map<String, Object> result = executeWith(context, Arrays.asList(item("一", "completed", null)));

        assertEquals(1, context.getTodos().read().size(), "the model resends the whole list, not a delta");
        assertEquals(TodoItem.COMPLETED, context.getTodos().read().get(0).getStatus());
        assertEquals(1, result.get("count"));
        assertEquals(1, result.get("completed"));
    }

    @Test
    void makesRepeatedIdsUnique() {
        // The client keys rows by id: two "t1" rows would render one of them twice.
        List<Object> raw = new ArrayList<>();
        raw.add(item("一", "pending", "t1"));
        raw.add(item("二", "pending", "t1"));
        raw.add(item("三", "pending", null));

        List<TodoItem> items = UpdateTodosTool.normalize(raw);

        assertEquals(3, items.size());
        assertEquals("t1", items.get(0).getId(), "the first claim on an id keeps it");
        assertNotEquals("t1", items.get(1).getId(), "a repeated id is reassigned");
        assertEquals(3, new HashSet<>(Arrays.asList(
                items.get(0).getId(), items.get(1).getId(), items.get(2).getId())).size());
    }

    @Test
    void rejectsNonArrayItems() {
        ToolContext context = new ToolContext();
        IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class,
                () -> tool.execute(single("items", "not a list"), context));
        assertTrue(thrown.getMessage().contains("items"));
    }

    @Test
    void capsPathologicallyLongLists() {
        List<Object> raw = new ArrayList<>();
        for (int i = 0; i < UpdateTodosTool.MAX_ITEMS + 5; i++) {
            raw.add(item("任务 " + i, "pending", null));
        }
        assertEquals(UpdateTodosTool.MAX_ITEMS, UpdateTodosTool.normalize(raw).size());
    }

    @Test
    void mirrorsTheNormalisedSnapshotToTheSessionTaskRecorder() {
        SessionTaskRecorder recorder = mock(SessionTaskRecorder.class);
        UpdateTodosTool wired = new UpdateTodosTool(recorder);
        ToolContext context = new ToolContext();
        context.setTenantId(1L);
        context.setUserId(2L);
        context.setConversationId("s-1");

        wired.execute(single("items", Arrays.asList(item("一", "done", null), item("二", "running", null))),
                context);

        // The recorder receives the already normalised list (ids filled, statuses
        // coerced) — not the raw model payload.
        verify(recorder).record(eq(context), argThat(items -> items != null
                && items.size() == 2
                && "t1".equals(items.get(0).getId())
                && TodoItem.COMPLETED.equals(items.get(0).getStatus())
                && "t2".equals(items.get(1).getId())
                && TodoItem.IN_PROGRESS.equals(items.get(1).getStatus())));
    }

    @Test
    void worksWithoutARecorder() {
        // Partial wiring / unit tests may leave the recorder null; the tool must
        // still maintain the run's todo holder and produce its result.
        ToolContext context = new ToolContext();

        Map<String, Object> result = executeWith(context, Arrays.asList(item("一", "pending", null)));

        assertEquals(1, context.getTodos().read().size());
        assertEquals(true, result.get("ok"));
    }

    @Test
    void doesNotCallTheRecorderWhenItemsAreRejected() {
        SessionTaskRecorder recorder = mock(SessionTaskRecorder.class);
        UpdateTodosTool wired = new UpdateTodosTool(recorder);
        ToolContext context = new ToolContext();

        assertThrows(IllegalArgumentException.class,
                () -> wired.execute(single("items", "not a list"), context));

        verifyNoInteractions(recorder);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> executeWith(ToolContext context, List<Object> items) {
        return (Map<String, Object>) tool.execute(single("items", items), context);
    }

    private static Map<String, Object> single(String key, Object value) {
        Map<String, Object> args = new LinkedHashMap<>();
        args.put(key, value);
        return args;
    }

    private static Map<String, Object> item(String title, String status, String id) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("title", title);
        item.put("status", status);
        if (id != null) {
            item.put("id", id);
        }
        return item;
    }
}
