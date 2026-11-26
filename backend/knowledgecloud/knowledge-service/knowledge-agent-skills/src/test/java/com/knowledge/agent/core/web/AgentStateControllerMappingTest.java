package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.AgentStateDtos;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** URL-contract guards for runtime-state endpoints. */
class AgentStateControllerMappingTest {

    @Test
    void controllersLiveInsideTheAgentModulePackage() {
        assertTrue(AgentToolCallController.class.getPackage().getName().startsWith("com.knowledge.agent."));
        assertTrue(AgentFormController.class.getPackage().getName().startsWith("com.knowledge.agent."));
        assertTrue(AgentRunDiscoveryController.class.getPackage().getName().startsWith("com.knowledge.agent."));
    }

    @Test
    void toolCallControllerMapsUnderApiAgentV1() throws NoSuchMethodException {
        assertArrayEquals(new String[] { "/api/agent/v1" },
                AgentToolCallController.class.getAnnotation(RequestMapping.class).value());

        Method started = AgentToolCallController.class.getMethod("started", String.class, String.class,
                AgentStateDtos.ToolStartedRequest.class);
        assertArrayEquals(new String[] { "/runs/{runId}/tool-calls/{callId}/started" },
                started.getAnnotation(PostMapping.class).value());

        Method completed = AgentToolCallController.class.getMethod("completed", String.class, String.class,
                AgentStateDtos.ToolCompletedRequest.class);
        assertArrayEquals(new String[] { "/runs/{runId}/tool-calls/{callId}/completed" },
                completed.getAnnotation(PostMapping.class).value());

        Method approval = AgentToolCallController.class.getMethod("requestApproval", String.class, String.class,
                AgentStateDtos.ToolApprovalRequest.class);
        assertArrayEquals(new String[] { "/runs/{runId}/tool-calls/{callId}/approval-request" },
                approval.getAnnotation(PostMapping.class).value());

        Method list = AgentToolCallController.class.getMethod("list", String.class, String.class, int.class);
        assertArrayEquals(new String[] { "/runs/{runId}/tool-calls" },
                list.getAnnotation(GetMapping.class).value());
    }

    @Test
    void formControllerMapsUnderForms() throws NoSuchMethodException {
        assertArrayEquals(new String[] { "/api/agent/v1/forms" },
                AgentFormController.class.getAnnotation(RequestMapping.class).value());

        Method create = AgentFormController.class.getMethod("create", AgentStateDtos.FormCreateRequest.class);
        PostMapping post = create.getAnnotation(PostMapping.class);
        assertNotNull(post);
        assertEquals(0, post.value().length);

        Method pending = AgentFormController.class.getMethod("pending", String.class, String.class, int.class);
        assertArrayEquals(new String[] { "/pending" }, pending.getAnnotation(GetMapping.class).value());

        Method answer = AgentFormController.class.getMethod("answer", String.class,
                AgentStateDtos.FormAnswerRequest.class);
        assertArrayEquals(new String[] { "/{formId}/answer" }, answer.getAnnotation(PostMapping.class).value());
    }

    @Test
    void discoveryControllerListsActiveRuns() throws NoSuchMethodException {
        assertArrayEquals(new String[] { "/api/agent/v1" },
                AgentRunDiscoveryController.class.getAnnotation(RequestMapping.class).value());

        Method active = AgentRunDiscoveryController.class.getMethod("active", String.class, int.class);
        assertArrayEquals(new String[] { "/runs" }, active.getAnnotation(GetMapping.class).value());
    }
}