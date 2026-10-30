package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.core.entity.AgentSessionTaskEntity;
import lombok.Data;

import java.io.Serializable;

/**
 * One unfinished session task in the cross-session "open tasks" read model.
 *
 * <p>This is a view, not an entity: {@code sessionTitle} is enriched from the
 * chat-session index (the task table itself deliberately stores no title), and
 * {@code position} is the item's index inside its session's latest snapshot.
 */
@Data
public class SessionTaskView implements Serializable {

    private String sessionId;

    /** Owning session's title; {@code ""} when the session row/title is unknown. */
    private String sessionTitle;

    /** {@code update_todos} item id. */
    private String taskId;

    private String title;

    /** pending | in_progress (completed rows are not returned by the API). */
    private String status;

    /** Index inside the session's latest whole-list snapshot. */
    private Integer position;

    private Long updatedAt;

    public static SessionTaskView of(AgentSessionTaskEntity entity, String sessionTitle) {
        if (entity == null) {
            return null;
        }
        SessionTaskView view = new SessionTaskView();
        view.setSessionId(entity.getSessionId());
        view.setSessionTitle(sessionTitle == null ? "" : sessionTitle);
        view.setTaskId(entity.getItemId());
        view.setTitle(entity.getTitle());
        view.setStatus(entity.getStatus());
        view.setPosition(entity.getSortIndex());
        view.setUpdatedAt(entity.getUpdateTime());
        return view;
    }
}
