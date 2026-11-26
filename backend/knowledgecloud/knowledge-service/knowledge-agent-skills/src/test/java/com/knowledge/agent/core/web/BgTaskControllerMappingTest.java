package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.BgTaskDtos;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** URL-contract guards for the background-task control plane. */
class BgTaskControllerMappingTest {

    @Test
    void controllerLivesInsideTheAgentModulePackage() {
        assertTrue(BgTaskController.class.getPackage().getName().startsWith("com.knowledge.agent."));
    }

    @Test
    void controllerMapsUnderApiAgentV1() {
        RequestMapping mapping = BgTaskController.class.getAnnotation(RequestMapping.class);
        assertNotNull(mapping);
        assertArrayEquals(new String[] { "/api/agent/v1/bg-tasks" }, mapping.value());
    }

    @Test
    void createIsPostOnTheCollection() throws NoSuchMethodException {
        Method create = BgTaskController.class.getMethod("create", BgTaskDtos.CreateRequest.class);
        PostMapping post = create.getAnnotation(PostMapping.class);
        assertNotNull(post);
        assertEquals(0, post.value().length);
    }

    @Test
    void attachAndHeartbeatArePostOnTheTask() throws NoSuchMethodException {
        Method attach = BgTaskController.class.getMethod("attach", String.class, BgTaskDtos.AttachRequest.class);
        assertArrayEquals(new String[] { "/{taskId}/attach" }, attach.getAnnotation(PostMapping.class).value());

        Method heartbeat = BgTaskController.class.getMethod("heartbeat", String.class,
                BgTaskDtos.HeartbeatRequest.class);
        assertArrayEquals(new String[] { "/{taskId}/heartbeat" },
                heartbeat.getAnnotation(PostMapping.class).value());
    }

    @Test
    void updateIsPatchAndLogsHavePostAndGet() throws NoSuchMethodException {
        Method update = BgTaskController.class.getMethod("update", String.class, BgTaskDtos.UpdateRequest.class);
        PatchMapping patch = update.getAnnotation(PatchMapping.class);
        assertNotNull(patch);
        assertArrayEquals(new String[] { "/{taskId}" }, patch.value());

        Method append = BgTaskController.class.getMethod("appendLogs", String.class, BgTaskDtos.LogsRequest.class);
        assertArrayEquals(new String[] { "/{taskId}/logs" },
                append.getAnnotation(PostMapping.class).value());

        Method logs = BgTaskController.class.getMethod("logs", String.class, long.class, int.class);
        assertArrayEquals(new String[] { "/{taskId}/logs" }, logs.getAnnotation(GetMapping.class).value());
    }

    @Test
    void finishAndCancelArePostOnTheTask() throws NoSuchMethodException {
        Method finish = BgTaskController.class.getMethod("finish", String.class, BgTaskDtos.FinishRequest.class);
        assertArrayEquals(new String[] { "/{taskId}/finish" }, finish.getAnnotation(PostMapping.class).value());

        Method cancel = BgTaskController.class.getMethod("cancel", String.class);
        assertArrayEquals(new String[] { "/{taskId}/cancel" }, cancel.getAnnotation(PostMapping.class).value());
    }

    @Test
    void listAndGetReadTheCollectionAndOneTask() throws NoSuchMethodException {
        Method list = BgTaskController.class.getMethod("list", String.class, String.class,
                String.class, String.class, int.class);
        GetMapping listMapping = list.getAnnotation(GetMapping.class);
        assertNotNull(listMapping);
        assertEquals(0, listMapping.value().length);

        Method get = BgTaskController.class.getMethod("get", String.class);
        assertArrayEquals(new String[] { "/{taskId}" }, get.getAnnotation(GetMapping.class).value());
    }
}