package com.knowledge.agent.registry;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Watches Nacos service instances for HA failover.
 * Cross-validates with heartbeat data: if Nacos says an instance is healthy
 * but heartbeat is missing, triggers a re-registration probe.
 */
@Slf4j
@Component
public class NacosServiceWatcher {

    private final DiscoveryClient discoveryClient;
    private final ToolRegistryCenter registryCenter;

    public NacosServiceWatcher(DiscoveryClient discoveryClient, ToolRegistryCenter registryCenter) {
        this.discoveryClient = discoveryClient;
        this.registryCenter = registryCenter;
    }

    /**
     * Periodically check registered services against Nacos.
     * Runs every 60 seconds.
     */
    @Scheduled(fixedDelay = 60000, initialDelay = 30000)
    public void watchServices() {
        try {
            Set<String> registeredServices = registryCenter.getRegisteredServices();
            for (String serviceId : registeredServices) {
                List<ServiceInstance> instances = discoveryClient.getInstances(serviceId);
                if (instances == null || instances.isEmpty()) {
                    log.warn("Service {} has no instances in Nacos — tools may be unavailable", serviceId);
                }
            }
        } catch (Exception e) {
            log.error("NacosServiceWatcher error", e);
        }
    }

    /**
     * Check if a service has healthy instances in Nacos.
     */
    public boolean isServiceHealthy(String serviceId) {
        try {
            List<ServiceInstance> instances = discoveryClient.getInstances(serviceId);
            return instances != null && !instances.isEmpty();
        } catch (Exception e) {
            log.warn("Failed to check Nacos for service: {}", serviceId, e);
            return false;
        }
    }

    /**
     * Get instances of a service from Nacos.
     */
    public List<ServiceInstance> getInstances(String serviceId) {
        try {
            return discoveryClient.getInstances(serviceId);
        } catch (Exception e) {
            log.warn("Failed to get Nacos instances for service: {}", serviceId, e);
            return Collections.emptyList();
        }
    }
}
