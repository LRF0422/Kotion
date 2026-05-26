package com.knowledge.agent.registry;

import com.knowledge.agent.tool.ToolRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Startup initializer that restores remote tool registrations from Redis
 * after the agent-service restarts.
 *
 * <p>
 * When the {@code knowledge-agent} service restarts, its in-memory
 * {@link ToolRegistry} and {@link ToolRegistryCenter#toolCache} are empty.
 * However, the registration data is still in Redis (written there by
 * {@link ToolRegistryCenter#register}). This runner loads those persisted
 * records back into memory, wires the {@link RemoteToolInvoker} on each
 * adapter, and registers them in the {@link ToolRegistry} so that the LLM
 * harness can discover and call them.
 *
 * <p>
 * Without this initializer, remote skills registered by microservices
 * (e.g., {@code knowledge-file-center}, {@code knowledge-wiki}) become
 * unavailable after an agent-service restart until the remote services
 * re-register (which only happens on their next startup).
 */
@Slf4j
@Component
public class RemoteToolStartupInitializer implements ApplicationRunner {

    private final ToolRegistryCenter registryCenter;
    private final RemoteToolInvoker remoteToolInvoker;
    private final ToolRegistry toolRegistry;

    public RemoteToolStartupInitializer(ToolRegistryCenter registryCenter,
            RemoteToolInvoker remoteToolInvoker,
            ToolRegistry toolRegistry) {
        this.registryCenter = registryCenter;
        this.remoteToolInvoker = remoteToolInvoker;
        this.toolRegistry = toolRegistry;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("[RemoteToolStartup] Loading remote tools from Redis...");

        // Step 1: Populate toolCache from Redis
        registryCenter.loadFromRedis();

        // Step 2: Wire invoker and register each adapter in ToolRegistry
        int count = 0;
        for (RemoteToolAdapter adapter : registryCenter.getAllToolAdapters()) {
            adapter.setInvoker(remoteToolInvoker);
            toolRegistry.register(adapter);
            count++;
            log.info("[RemoteToolStartup] Restored remote tool: {} (skillId={}, serviceId={})",
                    adapter.getId(), adapter.getSkillId(), adapter.getServiceId());
        }

        log.info("[RemoteToolStartup] Restored {} remote tool(s) from Redis", count);
    }
}
