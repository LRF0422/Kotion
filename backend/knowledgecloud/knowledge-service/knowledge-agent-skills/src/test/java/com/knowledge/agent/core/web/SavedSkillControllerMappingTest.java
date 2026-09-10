package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.SetSavedSkillEnabledRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SavedSkillControllerMappingTest {

    @Test
    void mapsManagementAndFromRunEndpointsUnderAgentNamespace() throws NoSuchMethodException {
        assertTrue(SavedSkillController.class.getPackage().getName().startsWith("com.knowledge.agent."));
        RequestMapping root = SavedSkillController.class.getAnnotation(RequestMapping.class);
        assertNotNull(root);
        assertArrayEquals(new String[] { "/api/agent/v1/saved-skills" }, root.value());

        Method list = SavedSkillController.class.getMethod("list", Boolean.class, int.class, int.class);
        assertNotNull(list.getAnnotation(GetMapping.class));

        Method get = SavedSkillController.class.getMethod("get", String.class);
        assertArrayEquals(new String[] { "/{skillId}" }, get.getAnnotation(GetMapping.class).value());

        Method enabled = SavedSkillController.class.getMethod(
                "setEnabled", String.class, SetSavedSkillEnabledRequest.class);
        assertArrayEquals(new String[] { "/{skillId}/enabled" },
                enabled.getAnnotation(PostMapping.class).value());

        Method delete = SavedSkillController.class.getMethod("delete", String.class);
        assertArrayEquals(new String[] { "/{skillId}" },
                delete.getAnnotation(DeleteMapping.class).value());

        Method fromRun = SavedSkillController.class.getMethod("saveFromRun", String.class);
        assertArrayEquals(new String[] { "/from-run/{runId}" },
                fromRun.getAnnotation(PostMapping.class).value());
    }
}
