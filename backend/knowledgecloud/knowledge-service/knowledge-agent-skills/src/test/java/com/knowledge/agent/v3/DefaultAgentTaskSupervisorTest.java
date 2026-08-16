package com.knowledge.agent.v3;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.v2.job.AgentJob;
import com.knowledge.agent.v2.job.AgentJobService;
import com.knowledge.agent.v2.session.AgentIdentity;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DefaultAgentTaskSupervisorTest {

    @Test
    void createCancelsPreviousConversationTaskFirst() {
        AgentJobService jobs = mock(AgentJobService.class);
        AgentJob created = new AgentJob("task-2", "sess-2", "conv-1", 1L, 7L);
        when(jobs.create(any(ChatCompletionRequest.class), any(AgentIdentity.class))).thenReturn(created);

        DefaultAgentTaskSupervisor supervisor =
                new DefaultAgentTaskSupervisor(jobs, new ObjectMapper());

        CreateTaskCommand command = new CreateTaskCommand();
        command.conversationId = "conv-1";
        command.userId = 1L;
        command.tenantId = 7L;
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("role", "user");
        msg.put("content", "hello");
        command.messages = Collections.singletonList(msg);
        command.tools = Collections.singletonList(tool("read"));

        AgentTaskRecord record = supervisor.create(command);

        verify(jobs).cancelActiveByConversation("conv-1", 1L, 7L);
        verify(jobs).create(any(ChatCompletionRequest.class), any(AgentIdentity.class));
        assertThat(record.getTaskId()).isEqualTo("task-2");
        assertThat(record.getConversationId()).isEqualTo("conv-1");
    }

    private Map<String, Object> tool(String name) {
        Map<String, Object> fn = new LinkedHashMap<>();
        fn.put("name", name);
        fn.put("description", "test tool");
        fn.put("parameters", Collections.emptyMap());
        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("type", "function");
        tool.put("function", fn);
        return tool;
    }
}
