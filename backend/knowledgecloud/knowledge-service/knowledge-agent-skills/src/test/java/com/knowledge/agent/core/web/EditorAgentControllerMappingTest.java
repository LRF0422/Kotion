package com.knowledge.agentcore.web;

import com.knowledge.agentcore.web.dto.CreateRunRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression guards for the two things that broke the client with a 404:
 * (1) the URL contract (/api/agent/v1/runs) and (2) the spring.factories
 * auto-configuration registration (agentcore lives outside the app's
 * component-scan base package).
 */
class EditorAgentControllerMappingTest {

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
                com.knowledge.agentcore.web.dto.ResumeRequest.class);
        PostMapping resumeMapping = resume.getAnnotation(PostMapping.class);
        assertNotNull(resumeMapping);
        assertEquals("/runs/{runId}/resume", resumeMapping.value()[0]);
    }

    @Test
    void autoConfigurationIsRegisteredInSpringFactories() throws Exception {
        try (InputStream in = getClass().getClassLoader()
                .getResourceAsStream("META-INF/spring.factories")) {
            assertNotNull(in, "META-INF/spring.factories must be on the classpath");
            byte[] bytes = new byte[in.available()];
            int read = 0;
            while (read < bytes.length) {
                int n = in.read(bytes, read, bytes.length - read);
                if (n < 0) {
                    break;
                }
                read += n;
            }
            String content = new String(bytes, 0, read, StandardCharsets.UTF_8);
            assertTrue(content.contains("org.springframework.boot.autoconfigure.EnableAutoConfiguration"),
                    "spring.factories must declare the EnableAutoConfiguration key");
            assertTrue(content.contains("com.knowledge.agentcore.config.AgentCoreAutoConfiguration"),
                    "spring.factories must register AgentCoreAutoConfiguration");
        }
    }
}
