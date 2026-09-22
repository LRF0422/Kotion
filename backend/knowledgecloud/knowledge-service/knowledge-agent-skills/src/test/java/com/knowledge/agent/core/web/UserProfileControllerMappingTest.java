package com.knowledge.agent.core.web;

import com.knowledge.agent.core.web.dto.ProfileConsentRequest;
import com.knowledge.agent.core.web.dto.UpsertProfileTraitRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserProfileControllerMappingTest {

    @Test
    void mapsProfileEndpointsUnderAgentNamespace() throws NoSuchMethodException {
        assertTrue(UserProfileController.class.getPackage().getName().startsWith("com.knowledge.agent."));
        RequestMapping root = UserProfileController.class.getAnnotation(RequestMapping.class);
        assertNotNull(root);
        assertArrayEquals(new String[] { "/api/agent/v1/profile" }, root.value());

        assertNotNull(UserProfileController.class.getMethod("get").getAnnotation(GetMapping.class));

        assertArrayEquals(new String[] { "/traits/{traitId}/evidence" },
                UserProfileController.class.getMethod("evidence", String.class)
                        .getAnnotation(GetMapping.class).value());

        assertArrayEquals(new String[] { "/traits" },
                UserProfileController.class.getMethod("create", UpsertProfileTraitRequest.class)
                        .getAnnotation(PostMapping.class).value());

        Method update = UserProfileController.class.getMethod(
                "update", String.class, UpsertProfileTraitRequest.class);
        assertArrayEquals(new String[] { "/traits/{traitId}" },
                update.getAnnotation(PutMapping.class).value());

        Method delete = UserProfileController.class.getMethod("delete", String.class);
        assertArrayEquals(new String[] { "/traits/{traitId}" },
                delete.getAnnotation(DeleteMapping.class).value());

        assertNotNull(UserProfileController.class.getMethod("reset").getAnnotation(DeleteMapping.class));

        assertArrayEquals(new String[] { "/consent" },
                UserProfileController.class.getMethod("getConsent")
                        .getAnnotation(GetMapping.class).value());
        assertArrayEquals(new String[] { "/consent" },
                UserProfileController.class.getMethod("setConsent", ProfileConsentRequest.class)
                        .getAnnotation(PutMapping.class).value());
    }
}
