package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.CreateRunRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression guards for the URL contract (/api/agent/v1/runs) and the package
 * placement: the agent runtime must live inside {@code com.knowledge.agent.*}
 * (the agent module's component-scan base) so the application's own scan
 * registers the controller — no spring.factories tricks.
 */
class EditorAgentControllerMappingTest {

    @Test
    void controllerLivesInsideAgentModulePackage() {
        String packageName = EditorAgentController.class.getPackage().getName();
        assertTrue(packageName.startsWith("com.knowledge.agent."),
                "controller must live inside com.knowledge.agent.* (app scan base), was: " + packageName);
    }

    @Test
    void controllerMapsUnderApiAgentV1() {
        RequestMapping mapping = EditorAgentController.class.getAnnotation(RequestMapping.class);
        assertNotNull(mapping, "controller must declare @RequestMapping");
        assertArrayEquals(new String[] { "/api/agent/v1" }, mapping.value());
    }

    @Test
    void createRunEndpointIsPostRuns() throws NoSuchMethodException {
        Method create = EditorAgentController.class.getMethod("create", CreateRunRequest.class);
        PostMapping post = create.getAnnotation(PostMapping.class);
        assertNotNull(post);
        assertArrayEquals(new String[] { "/runs" }, post.value());
    }

    @Test
    void eventsAndResumeEndpointsExist() throws NoSuchMethodException {
        Method events = EditorAgentController.class.getMethod("events", String.class, long.class);
        GetMapping eventsMapping = events.getAnnotation(GetMapping.class);
        assertNotNull(eventsMapping);
        assertEquals("/runs/{runId}/events", eventsMapping.value()[0]);

        Method resume = EditorAgentController.class.getMethod("resume", String.class,
                com.knowledge.agent.core.web.dto.ResumeRequest.class);
        PostMapping resumeMapping = resume.getAnnotation(PostMapping.class);
        assertNotNull(resumeMapping);
        assertEquals("/runs/{runId}/resume", resumeMapping.value()[0]);
    }
}
