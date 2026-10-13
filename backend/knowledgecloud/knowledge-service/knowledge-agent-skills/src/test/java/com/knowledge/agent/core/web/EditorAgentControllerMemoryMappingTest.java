package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.CreateMemoryRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * URL contract for the memory-management endpoints. The browser needs
 * {@code scope=*} (every scope the caller owns) plus hand-written memories and
 * a purge; those extra routes must not collide with
 * {@code DELETE /memory/{memoryId}}.
 */
class EditorAgentControllerMemoryMappingTest {

    @Test
    void browseMemoryIsGetMemoryWithTypeOffsetAndLimit() throws NoSuchMethodException {
        Method browse = EditorAgentController.class.getMethod("listMemory",
                String.class, String.class, String.class, String.class, String.class, int.class, int.class);
        GetMapping mapping = browse.getAnnotation(GetMapping.class);
        assertNotNull(mapping, "browse endpoint must be a GET");
        assertArrayEquals(new String[] { "/memory" }, mapping.value());
    }

    @Test
    void createMemoryIsPostMemory() throws NoSuchMethodException {
        Method create = EditorAgentController.class.getMethod("createMemory", CreateMemoryRequest.class);
        PostMapping mapping = create.getAnnotation(PostMapping.class);
        assertNotNull(mapping, "create endpoint must be a POST");
        assertArrayEquals(new String[] { "/memory" }, mapping.value());
    }

    @Test
    void purgeAndSingleDeleteHaveDistinctPaths() throws NoSuchMethodException {
        Method purge = EditorAgentController.class.getMethod("purgeMemory");
        DeleteMapping purgeMapping = purge.getAnnotation(DeleteMapping.class);
        assertNotNull(purgeMapping);
        assertEquals("/memory", purgeMapping.value()[0]);

        Method single = EditorAgentController.class.getMethod("deleteMemory", String.class);
        DeleteMapping singleMapping = single.getAnnotation(DeleteMapping.class);
        assertNotNull(singleMapping);
        assertEquals("/memory/{memoryId}", singleMapping.value()[0]);
    }
}
