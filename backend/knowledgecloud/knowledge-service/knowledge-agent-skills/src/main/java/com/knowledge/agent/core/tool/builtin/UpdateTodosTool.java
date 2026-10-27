package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.run.TodoItem;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Task-list tool: the model maintains the run's to-do list.
 *
 * <p>Whole-list semantics ({@code items} replaces the previous list) on purpose:
 * it is idempotent, the model can reorder/reword freely, and the loop can
 * announce the result as one complete snapshot ({@code todo.updated}) instead of
 * a diff the client would have to replay correctly after a reconnect.
 *
 * <p>Read-only in the plan-mode sense: listing what you are going to do has no
 * side effect on the user's document, so it stays allowed while edits are gated.
 */
@Component
public class UpdateTodosTool implements BackendTool {

    /** Hard cap — a task list longer than this is a document, not a plan. */
    static final int MAX_ITEMS = 30;

    /** Per-title cap so the event payload (and the transcript) stays small. */
    static final int MAX_TITLE_CHARS = 300;

    @Override
    public ToolSpec spec() {
        Map<String, Object> itemProps = new LinkedHashMap<>();
        itemProps.put("title", Schemas.str("任务内容（一行，动词开头，具体到可验收）。"));
        itemProps.put("status", Schemas.enumStr("状态：pending 待做 / in_progress 进行中 / completed 已完成。",
                TodoItem.PENDING, TodoItem.IN_PROGRESS, TodoItem.COMPLETED));
        itemProps.put("id", Schemas.str("可选。稳定标识，沿用上次给出的 id 便于用户对照；缺省按顺序生成。"));

        Map<String, Object> props = new LinkedHashMap<>();
        props.put("items", Schemas.objArray(
                "完整任务清单（整表覆盖，不是增量）。每完成一项就重发整份清单，把那一项改成 completed。",
                itemProps, "title"));

        return ToolSpec.of("update_todos",
                "维护本次任务的任务清单：传完整的、有序的任务列表（整表覆盖）。"
                        + "任务需要 3 步以上、或用户列了多项要求时，先调用它把计划写成清单；"
                        + "每开始一项标 in_progress、每完成一项立刻改成 completed 并重发整份清单。"
                        + "清单会展示给用户，所以标题要写人话，不要写工具名。",
                Schemas.object(props, "items"), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    @SuppressWarnings("unchecked")
    public Object execute(Map<String, Object> args, ToolContext context) {
        Object raw = args.get("items");
        if (!(raw instanceof List)) {
            throw new IllegalArgumentException("update_todos 的 items 必须是数组（完整任务清单）");
        }
        List<TodoItem> items = normalize((List<Object>) raw);
        context.getTodos().write(items);

        int completed = 0;
        for (TodoItem item : items) {
            if (TodoItem.COMPLETED.equals(item.getStatus())) {
                completed++;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("count", items.size());
        result.put("completed", completed);
        result.put("items", items);
        return result;
    }

    /**
     * Normalise model input: drop untitled rows, coerce statuses, fill in missing
     * ids (position-based) so every item has a stable key for the client's list.
     * Ids are made unique: the client keys rows by id, and a repeated id makes it
     * render one row twice while dropping another.
     */
    static List<TodoItem> normalize(List<Object> raw) {
        List<TodoItem> items = new ArrayList<>();
        for (Object entry : raw) {
            if (!(entry instanceof Map)) {
                continue;
            }
            Map<String, Object> item = (Map<String, Object>) entry;
            String title = item.get("title") == null ? "" : String.valueOf(item.get("title")).trim();
            if (title.isEmpty()) {
                continue;
            }
            if (title.length() > MAX_TITLE_CHARS) {
                title = title.substring(0, MAX_TITLE_CHARS);
            }
            String id = item.get("id") == null ? "" : String.valueOf(item.get("id")).trim();
            String status = TodoItem.normalizeStatus(
                    item.get("status") == null ? null : String.valueOf(item.get("status")));
            items.add(TodoItem.of(id, title, status));
            if (items.size() >= MAX_ITEMS) {
                break;
            }
        }
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < items.size(); i++) {
            TodoItem item = items.get(i);
            String id = item.getId();
            if (id == null || id.isEmpty() || seen.contains(id)) {
                id = "t" + (i + 1);
                int suffix = 0;
                while (seen.contains(id)) {
                    suffix++;
                    id = "t" + (i + 1) + "-" + suffix;
                }
                item.setId(id);
            }
            seen.add(id);
        }
        return items;
    }
}
