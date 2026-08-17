package com.knowledge.agentcore.skill;

import com.knowledge.core.agent.sdk.HeartbeatRequest;
import com.knowledge.core.agent.sdk.SkillDefinition;
import com.knowledge.core.agent.sdk.UnregisterRequest;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * AgentCore remote-skill registration endpoints — the consumption side of the
 * knowledge-core-agent SDK contract (AgentSkillRegistrar posts here). The SDK
 * itself is untouched; the V1 SkillController/RegistrationController stack is
 * replaced by this single controller.
 */
@Api(tags = "Remote Skill Registration (AgentCore)")
@Slf4j
@RestController
@RequestMapping("/api/v1/skills")
public class RemoteSkillController {

    private final RemoteSkillRegistry registry;

    public RemoteSkillController(RemoteSkillRegistry registry) {
        this.registry = registry;
    }

    @PostMapping("/register-remote")
    public R<Void> registerRemoteSkills(@RequestBody List<SkillDefinition> skills) {
        if (skills == null || skills.isEmpty()) {
            return R.data(null);
        }
        String serviceId = skills.get(0).getServiceId();
        List<RemoteSkillRecord> records = new ArrayList<>();
        for (SkillDefinition definition : skills) {
            records.add(RemoteSkillRecord.builder()
                    .serviceId(definition.getServiceId())
                    .skillId(definition.getId())
                    .toolName(definition.getToolName())
                    .name(definition.getName())
                    .description(definition.getToolDescription() != null
                            ? definition.getToolDescription() : definition.getDescription())
                    .parameterSchema(definition.getJsonSchema())
                    .callbackUrl(definition.getCallbackUrl())
                    .build());
        }
        try {
            registry.register(serviceId, records);
        } catch (Exception e) {
            log.error("Remote skill registration failed for {}: {}", serviceId, e.getMessage());
            return R.fail("Registration failed: " + e.getMessage());
        }
        return R.data(null);
    }

    @PostMapping("/heartbeat")
    public R<Void> heartbeat(@RequestBody HeartbeatRequest request) {
        if (request != null) {
            registry.heartbeat(request.getServiceId(), request.getSkillIds() != null
                    ? request.getSkillIds() : new ArrayList<>());
        }
        return R.data(null);
    }

    @PostMapping("/unregister-remote")
    public R<Void> unregisterRemoteSkills(@RequestBody UnregisterRequest request) {
        if (request != null) {
            registry.unregister(request.getServiceId());
        }
        return R.data(null);
    }
}
