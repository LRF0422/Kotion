package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.SaveChatSessionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatSessionControllerMappingTest {

    @Test
    void mapsSessionEndpointsUnderAgentNamespace() throws NoSuchMethodException {
        assertTrue(ChatSessionController.class.getPackage().getName().startsWith("com.knowledge.agent."));
        RequestMapping root = ChatSessionController.class.getAnnotation(RequestMapping.class);
        assertNotNull(root);
        assertArrayEquals(new String[] { "/api/agent/v1/sessions" }, root.value());

        Method list = ChatSessionController.class.getMethod("list", int.class);
        assertNotNull(list.getAnnotation(GetMapping.class));

        Method get = ChatSessionController.class.getMethod("get", String.class);
        assertArrayEquals(new String[] { "/{sessionId}" }, get.getAnnotation(GetMapping.class).value());

        Method upsert = ChatSessionController.class.getMethod(
                "upsert", String.class, SaveChatSessionRequest.class);
        assertArrayEquals(new String[] { "/{sessionId}" }, upsert.getAnnotation(PutMapping.class).value());

        Method delete = ChatSessionController.class.getMethod("delete", String.class);
        assertArrayEquals(new String[] { "/{sessionId}" }, delete.getAnnotation(DeleteMapping.class).value());
    }
}
