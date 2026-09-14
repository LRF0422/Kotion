package com.knowledge.agent.core.skill;

import com.knowledge.core.agent.sdk.HeartbeatRequest;
import com.knowledge.core.agent.sdk.UnregisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Guards the SDK registration contract (paths other microservices depend on)
 * and the diagnostics endpoint.
 */
class RemoteSkillControllerMappingTest {

    @Test
    void mapsSdkContractAndDiagnosticsEndpoint() throws NoSuchMethodException {
        RequestMapping root = RemoteSkillController.class.getAnnotation(RequestMapping.class);
        assertNotNull(root);
        assertArrayEquals(new String[] { "/api/v1/skills" }, root.value());

        Method register = RemoteSkillController.class.getMethod("registerRemoteSkills", List.class);
        assertArrayEquals(new String[] { "/register-remote" },
                register.getAnnotation(PostMapping.class).value());

        Method heartbeat = RemoteSkillController.class.getMethod("heartbeat", HeartbeatRequest.class);
        assertArrayEquals(new String[] { "/heartbeat" },
                heartbeat.getAnnotation(PostMapping.class).value());

        Method unregister = RemoteSkillController.class.getMethod(
                "unregisterRemoteSkills", UnregisterRequest.class);
        assertArrayEquals(new String[] { "/unregister-remote" },
                unregister.getAnnotation(PostMapping.class).value());

        Method list = RemoteSkillController.class.getMethod("listRemoteSkills");
        assertArrayEquals(new String[] { "/remote" },
                list.getAnnotation(GetMapping.class).value());
    }
}
