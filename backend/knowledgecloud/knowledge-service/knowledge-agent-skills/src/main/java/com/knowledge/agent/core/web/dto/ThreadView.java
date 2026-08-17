package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.core.entity.AgentThreadEntity;
import lombok.Data;

/**
 * GET /api/agent/v1/threads/{threadId} response — session-memory view used by
 * the frontend to restore conversations.
 */
@Data
public class ThreadView {

    private String threadId;

    private String title;

    private String summary;

    private String activeRunId;

    private Long createTime;

    private Long updateTime;

    public static ThreadView of(AgentThreadEntity entity) {
        if (entity == null) {
            return null;
        }
        ThreadView view = new ThreadView();
        view.setThreadId(entity.getThreadId());
        view.setTitle(entity.getTitle());
        view.setSummary(entity.getSummary());
        view.setActiveRunId(entity.getActiveRunId());
        view.setCreateTime(entity.getCreateTime());
        view.setUpdateTime(entity.getUpdateTime());
        return view;
    }
}
