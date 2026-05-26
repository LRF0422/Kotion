package com.knowledge.agent.registry;

import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST endpoints for remote tool registration, heartbeat, and management.
 */
@Api(tags = "Remote Tool Registration")
@Slf4j
@RestController
@RequestMapping("/api/v1/tools")
@RequiredArgsConstructor
public class RegistrationController {

    private final ToolRegistryCenter registryCenter;
    private final RemoteToolInvoker remoteToolInvoker;
    private final ToolRegistry toolRegistry;

    /**
     * Register remote tools from a second-party service.
     */
    @ApiOperation("Register remote tools")
    @PostMapping("/register")
    public R<Void> register(@RequestBody RegistrationRequest request) {
        log.info("Registering tools from service: {} (count: {})",
                request.getServiceId(), request.getTools() != null ? request.getTools().size() : 0);

        registryCenter.register(request.getServiceId(), request.getTools());

        // Wire up the invoker on each adapter and register in ToolRegistry
        for (RemoteToolAdapter adapter : registryCenter.getAllToolAdapters()) {
            adapter.setInvoker(remoteToolInvoker);
            toolRegistry.register(adapter);
        }

        return R.data(null);
    }

    /**
     * Heartbeat from a remote service.
     */
    @ApiOperation("Heartbeat from remote service")
    @PostMapping("/heartbeat")
    public R<Void> heartbeat(@RequestBody HeartbeatRequest request) {
        registryCenter.heartbeat(request.getServiceId(), request.getToolIds());
        return R.data(null);
    }

    /**
     * Unregister all tools from a service (graceful shutdown).
     */
    @ApiOperation("Unregister remote service")
    @PostMapping("/unregister")
    public R<Void> unregister(@RequestBody UnregisterRequest request) {
        log.info("Unregistering tools from service: {}", request.getServiceId());

        // Remove from local ToolRegistry first
        for (RemoteToolAdapter adapter : registryCenter.getAllToolAdapters()) {
            if (request.getServiceId().equals(adapter.getServiceId())) {
                toolRegistry.unregister(adapter.getId());
            }
        }

        registryCenter.unregister(request.getServiceId());
        return R.data(null);
    }

    /**
     * List all remote tools grouped by service.
     */
    @ApiOperation("List remote tools")
    @GetMapping("/remote")
    public R<List<RemoteToolRecord>> listRemoteTools() {
        return R.data(registryCenter.getAllRecords());
    }

    /**
     * Health status of all registered services.
     */
    @ApiOperation("Remote services health status")
    @GetMapping("/remote/status")
    public R<Map<String, Object>> getRemoteStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("services", registryCenter.getRegisteredServices());
        status.put("tools", registryCenter.getAllRecords());
        return R.data(status);
    }

    /**
     * Manually unload a service's tools.
     */
    @ApiOperation("Unload a service's tools")
    @DeleteMapping("/remote/{serviceId}")
    public R<Void> unloadService(@PathVariable String serviceId) {
        // Remove from local ToolRegistry first
        for (RemoteToolAdapter adapter : registryCenter.getAllToolAdapters()) {
            if (serviceId.equals(adapter.getServiceId())) {
                toolRegistry.unregister(adapter.getId());
            }
        }
        registryCenter.unregister(serviceId);
        return R.data(null);
    }

    // ---- Request DTOs ----

    @lombok.Data
    public static class RegistrationRequest {
        private String serviceId;
        private List<RemoteToolRecord> tools;
    }

    @lombok.Data
    public static class HeartbeatRequest {
        private String serviceId;
        private List<String> toolIds;
    }

    @lombok.Data
    public static class UnregisterRequest {
        private String serviceId;
    }
}
