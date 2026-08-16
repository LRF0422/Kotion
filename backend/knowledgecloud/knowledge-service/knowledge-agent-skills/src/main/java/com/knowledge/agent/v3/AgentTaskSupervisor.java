package com.knowledge.agent.v3;

import reactor.core.publisher.Flux;

import java.util.Map;

/**
 * V3 supervisor contract. This is the only place that may create, lease,
 * resume, cancel or recover a task. Loop/context/tool implementations are
 * hidden behind it.
 */
public interface AgentTaskSupervisor {

    AgentTaskRecord create(CreateTaskCommand command);

    AgentTaskRecord get(String taskId);

    TaskStateView state(String taskId);

    Flux<Map<String, Object>> events(String taskId, long afterSeq);

    Flux<Map<String, Object>> resume(String taskId, ResumeTaskCommand command);

    boolean cancel(String taskId);

    void reconcile();
}
