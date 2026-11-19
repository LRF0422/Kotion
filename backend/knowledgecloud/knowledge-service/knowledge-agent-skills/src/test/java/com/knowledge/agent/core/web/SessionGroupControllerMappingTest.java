package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.SaveChatSessionGroupRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionGroupControllerMappingTest {

    @Test
    void mapsGroupEndpointsUnderAgentNamespace() throws NoSuchMethodException {
        assertTrue(SessionGroupController.class.getPackage().getName().startsWith("com.knowledge.agent."));
        RequestMapping root = SessionGroupController.class.getAnnotation(RequestMapping.class);
        assertNotNull(root);
        assertArrayEquals(new String[] { "/api/agent/v1/session-groups" }, root.value());

        Method list = SessionGroupController.class.getMethod("list", int.class);
        assertNotNull(list.getAnnotation(GetMapping.class));

        Method upsert = SessionGroupController.class.getMethod(
                "upsert", String.class, SaveChatSessionGroupRequest.class);
        assertArrayEquals(new String[] { "/{groupId}" }, upsert.getAnnotation(PutMapping.class).value());

        Method delete = SessionGroupController.class.getMethod("delete", String.class);
        assertArrayEquals(new String[] { "/{groupId}" }, delete.getAnnotation(DeleteMapping.class).value());
    }
}