package com.knowledge.core.agent.sdk;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

/**
 * Feign client interface for remote skill registration with the agent service.
 *
 * <p>
 * This client is used by {@link AgentSkillRegistrar} to register, send
 * heartbeats,
 * and unregister skills from the {@code knowledge-agent-skills} service.
 *
 * <p>
 * Endpoints:
 * <ul>
 * <li>{@code POST /api/v1/skills/register-remote} - Register skills from a
 * microservice</li>
 * <li>{@code POST /api/v1/skills/heartbeat} - Send heartbeat to indicate
 * service liveness</li>
 * <li>{@code POST /api/v1/skills/unregister-remote} - Unregister all skills
 * from a service</li>
 * </ul>
 */
@FeignClient(value = AppConstant.APPLICATION_AGENT_SKILLS_NAME, contextId = "skillRegistrationClient")
public interface ISkillRegistrationClient {

    /**
     * Registers remote skills from a microservice.
     *
     * <p>
     * Called by microservices using the Agent SDK on startup to register
     * their {@code @AgentSkill} annotated beans with the central agent service.
     *
     * @param skills list of skill definitions to register
     * @return success response
     */
    @PostMapping("/api/v1/skills/register-remote")
    R<Void> registerRemoteSkills(@RequestBody List<SkillDefinition> skills);

    /**
     * Sends a heartbeat to indicate service liveness.
     *
     * <p>
     * Called periodically by the Agent SDK to let the agent service know
     * that the remote service is still alive and its skills should remain
     * available.
     *
     * @param request heartbeat request containing serviceId and skillIds
     * @return success response
     */
    @PostMapping("/api/v1/skills/heartbeat")
    R<Void> heartbeat(@RequestBody HeartbeatRequest request);

    /**
     * Unregisters all skills from a remote service.
     *
     * <p>
     * Called by the Agent SDK during graceful shutdown to clean up
     * all registered skills from the agent service.
     *
     * @param request unregister request containing the serviceId
     * @return success response
     */
    @PostMapping("/api/v1/skills/unregister-remote")
    R<Void> unregisterRemoteSkills(@RequestBody UnregisterRequest request);
}
