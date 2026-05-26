package com.knowledge.agent.controller;

import java.util.ArrayList;
import java.util.List;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.agent.registry.RemoteToolAdapter;
import com.knowledge.agent.registry.RemoteToolInvoker;
import com.knowledge.agent.registry.RemoteToolRecord;
import com.knowledge.agent.registry.ToolRegistryCenter;
import com.knowledge.agent.tool.ProgressiveDiscovery;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.core.agent.sdk.HeartbeatRequest;
import com.knowledge.core.agent.sdk.SkillDefinition;
import com.knowledge.core.agent.sdk.UnregisterRequest;
import com.knowledge.core.tool.api.R;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import springfox.documentation.annotations.ApiIgnore;

/**
 * REST controller that receives remote skill registrations from microservices
 * using the Agent SDK.
 *
 * <p>
 * This controller exposes the endpoints called by
 * {@link com.knowledge.core.agent.sdk.ISkillRegistrationClient}:
 * <ul>
 * <li>{@code POST /api/v1/skills/register-remote} — register skills from a
 * microservice</li>
 * <li>{@code POST /api/v1/skills/heartbeat} — heartbeat from a remote
 * service</li>
 * <li>{@code POST /api/v1/skills/unregister-remote} — unregister all skills
 * from a service</li>
 * </ul>
 *
 * <p>
 * Each {@link SkillDefinition} is converted to a {@link RemoteToolRecord} and
 * registered in both the {@link ToolRegistryCenter} (Redis-backed) and the
 * local {@link ToolRegistry} (in-memory, used by the harness for LLM
 * function-calling).
 */
@ApiIgnore
@Slf4j
@RestController
@RequestMapping("/api/v1/skills")
@RequiredArgsConstructor
public class SkillController {

    private final ToolRegistryCenter registryCenter;
    private final RemoteToolInvoker remoteToolInvoker;
    private final ToolRegistry toolRegistry;
    private final ProgressiveDiscovery progressiveDiscovery;

    /**
     * Register remote skills from a microservice.
     * Called by AgentSkillRegistrar on startup of the remote service.
     */
    @PostMapping("/register-remote")
    public R<Void> registerRemoteSkills(@RequestBody List<SkillDefinition> skills) {
        if (skills == null || skills.isEmpty()) {
            return R.data(null);
        }

        // All skills in one batch should come from the same service
        String serviceId = skills.get(0).getServiceId();
        log.info("Registering {} remote skill tool(s) from service: {}", skills.size(), serviceId);

        List<RemoteToolRecord> records = new ArrayList<>();
        for (SkillDefinition def : skills) {
            RemoteToolRecord record = RemoteToolRecord.builder()
                    .serviceId(def.getServiceId())
                    .skillId(def.getId())
                    .toolId(def.getToolName())
                    .name(def.getName())
                    .description(def.getToolDescription() != null ? def.getToolDescription() : def.getDescription())
                    .parameterSchema(def.getJsonSchema())
                    .build();
            records.add(record);
        }

        // Register in Redis-backed ToolRegistryCenter
        registryCenter.register(serviceId, records);

        // Wire invoker and register in local ToolRegistry for LLM function-calling
        for (RemoteToolRecord record : records) {
            RemoteToolAdapter adapter = registryCenter.getToolAdapter(record.getToolId());
            if (adapter != null) {
                adapter.setInvoker(remoteToolInvoker);
                toolRegistry.register(adapter);
                log.info("Registered remote tool in ToolRegistry: {} (skillId={}, serviceId={})",
                        record.getToolId(), record.getSkillId(), record.getServiceId());
            }
        }

        // Register capability mappings based on categories
        for (SkillDefinition def : skills) {
            registerCapabilityMappings(def);
        }

        return R.data(null);
    }

    /**
     * Heartbeat from a remote service to indicate liveness.
     */
    @PostMapping("/heartbeat")
    public R<Void> heartbeat(@RequestBody HeartbeatRequest request) {
        log.debug("Heartbeat from service: {} (skillIds: {})", request.getServiceId(), request.getSkillIds());

        // Convert skillIds to toolIds for heartbeat
        // Each skillId may map to multiple tools; we update all tools from this service
        registryCenter.heartbeat(request.getServiceId(), request.getSkillIds());
        return R.data(null);
    }

    /**
     * Unregister all skills from a remote service (graceful shutdown).
     */
    @PostMapping("/unregister-remote")
    public R<Void> unregisterRemoteSkills(@RequestBody UnregisterRequest request) {
        log.info("Unregistering skills from service: {}", request.getServiceId());

        // Remove from local ToolRegistry first
        for (RemoteToolAdapter adapter : registryCenter.getAllToolAdapters()) {
            if (request.getServiceId().equals(adapter.getServiceId())) {
                toolRegistry.unregister(adapter.getId());
                log.info("Unregistered remote tool from ToolRegistry: {}", adapter.getId());
            }
        }

        // Remove from Redis-backed ToolRegistryCenter
        registryCenter.unregister(request.getServiceId());
        return R.data(null);
    }

    // ---- Capability Mapping Helpers ----

    /**
     * Register capability mappings based on skill categories and tool name.
     * This enables progressive discovery to route intents to the right tools.
     */
    private void registerCapabilityMappings(SkillDefinition def) {
        String toolName = def.getToolName();
        List<String> categories = def.getCategories();

        if (categories != null) {
            for (String category : categories) {
                progressiveDiscovery.registerCapability(category, toolName);
            }
        }

        // Register based on tool name conventions
        if (toolName != null) {
            if (toolName.contains("search") || toolName.contains("query")) {
                progressiveDiscovery.registerCapability("search", toolName);
            }
            if (toolName.contains("read") || toolName.contains("summarize") || toolName.contains("get")) {
                progressiveDiscovery.registerCapability("read", toolName);
            }
            if (toolName.contains("write") || toolName.contains("create") || toolName.contains("update")) {
                progressiveDiscovery.registerCapability("write", toolName);
            }
            if (toolName.contains("page") || toolName.contains("space")) {
                progressiveDiscovery.registerCapability("wiki", toolName);
            }
        }
    }
}
