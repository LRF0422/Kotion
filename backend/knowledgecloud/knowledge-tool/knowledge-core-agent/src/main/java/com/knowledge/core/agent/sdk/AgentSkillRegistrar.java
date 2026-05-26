package com.knowledge.core.agent.sdk;

import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.core.env.Environment;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Scans all Spring beans annotated with {@link AgentSkill} after context
 * startup,
 * builds {@link AnnotatedSkillAdapter}s and registers each tool with the remote
 * {@code knowledge-agent-skills} service via Feign client.
 *
 * <p>
 * Also maintains an in-process adapter registry so that the
 * {@link AgentSdkInvokeController} can dispatch inbound invocation callbacks.
 *
 * <p>
 * Configuration properties (in {@code application.yml} of the host service):
 * 
 * <pre>
 * agent:
 *   sdk:
 *     service-id: ${spring.application.name}             # this service's Nacos name
 *     callback-base-url: http://my-service:port          # optional, overrides auto-detected
 *     heartbeat-interval: 30                             # heartbeat interval in seconds
 *     registration-retry-max: 5                          # max registration retry attempts
 * </pre>
 *
 * <p>
 * Note: Service discovery is handled automatically by Feign + Nacos, so no
 * explicit
 * agent-service-url configuration is needed.
 */
@Slf4j
public class AgentSkillRegistrar implements ApplicationContextAware, SmartInitializingSingleton, DisposableBean {

    /** key: "skillId::toolName" */
    private final Map<String, AnnotatedSkillAdapter> adapterRegistry = new ConcurrentHashMap<>();

    /** List of registered skill IDs for heartbeat */
    private final List<String> registeredSkillIds = new ArrayList<>();

    private ApplicationContext applicationContext;
    private final AgentSdkProperties properties;
    private final ISkillRegistrationClient skillRegistrationClient;
    private final Environment environment;
    private final ScheduledExecutorService scheduler;

    private volatile ScheduledFuture<?> heartbeatFuture;
    private volatile boolean registered = false;

    /** Agent Skills Service Application Name */
    private static final String AGENT_SKILLS_SERVICE_NAME = "knowledge-agent";

    public AgentSkillRegistrar(AgentSdkProperties properties,
            ISkillRegistrationClient skillRegistrationClient,
            Environment environment,
            ScheduledExecutorService scheduler) {
        this.properties = properties;
        this.skillRegistrationClient = skillRegistrationClient;
        this.environment = environment;
        this.scheduler = scheduler;
    }

    @Override
    public void setApplicationContext(ApplicationContext ctx) throws BeansException {
        this.applicationContext = ctx;
    }

    @Override
    public void afterSingletonsInstantiated() {
        Map<String, Object> beansWithAnnotation = applicationContext.getBeansWithAnnotation(AgentSkill.class);
        if (beansWithAnnotation.isEmpty()) {
            log.debug("[AgentSDK] No @AgentSkill beans found — skipping registration.");
            return;
        }
        log.info("[AgentSDK] Found {} @AgentSkill bean(s), registering with agent service...",
                beansWithAnnotation.size());

        List<SkillDefinition> toRegister = new ArrayList<>();

        for (Map.Entry<String, Object> entry : beansWithAnnotation.entrySet()) {
            Object bean = entry.getValue();
            Class<?> targetClass = resolveTargetClass(bean);
            AgentSkill skillAnnotation = targetClass.getAnnotation(AgentSkill.class);
            if (skillAnnotation == null) {
                continue;
            }
            for (Method method : targetClass.getMethods()) {
                SkillTool toolAnnotation = method.getAnnotation(SkillTool.class);
                if (toolAnnotation == null) {
                    continue;
                }
                AnnotatedSkillAdapter adapter = new AnnotatedSkillAdapter(bean, skillAnnotation, method,
                        toolAnnotation);
                String adapterKey = skillAnnotation.id() + "::" + adapter.getToolName();
                adapterRegistry.put(adapterKey, adapter);

                SkillDefinition def = adapter.buildDefinition();
                def.setServiceId(resolveServiceId());
                def.setCallbackUrl(resolveCallbackUrl());
                toRegister.add(def);

                // Track skill IDs for heartbeat
                if (!registeredSkillIds.contains(def.getId())) {
                    registeredSkillIds.add(def.getId());
                }

                log.info("[AgentSDK] Discovered skill tool: {} / {}",
                        skillAnnotation.id(), adapter.getToolName());
            }
        }

        if (!toRegister.isEmpty()) {
            // Check if we're running inside the agent-skills service itself
            String appName = environment.getProperty("spring.application.name", "");
            if (AGENT_SKILLS_SERVICE_NAME.equals(appName)) {
                // Try to register locally
                if (registerLocally(toRegister)) {
                    registered = true;
                    log.info("[AgentSDK] Registered {} skill tool(s) locally (same-service mode)",
                            toRegister.size());
                    return;
                }
            }

            // Remote registration with retry
            registerWithRetry(toRegister);
        }
    }

    /**
     * Attempts to register skills directly with the local SkillRegistry if
     * available.
     * This is used when the SDK is running inside the agent-skills service itself.
     *
     * @param definitions skill definitions to register
     * @return true if local registration succeeded, false if SkillRegistry is not
     *         available
     */
    private boolean registerLocally(List<SkillDefinition> definitions) {
        try {
            // Try to get SkillRegistry bean - it should exist in agent-skills service
            Object skillRegistry = applicationContext.getBean("skillRegistry");
            if (skillRegistry == null) {
                return false;
            }

            // Use reflection to avoid compile-time dependency on agent-skills module
            Class<?> registryClass = skillRegistry.getClass();
            Method registerMethod = null;
            for (Method m : registryClass.getMethods()) {
                if ("register".equals(m.getName()) && m.getParameterCount() == 1) {
                    registerMethod = m;
                    break;
                }
            }

            if (registerMethod == null) {
                log.warn("[AgentSDK] SkillRegistry.register method not found, falling back to HTTP");
                return false;
            }

            // We need to create SkillExecutor instances - use SkillService.registerRemote
            // instead
            // This is cleaner as it handles the conversion for us
            Object skillService = applicationContext.getBean("skillService");
            if (skillService != null) {
                Method registerRemoteMethod = null;
                for (Method m : skillService.getClass().getMethods()) {
                    if ("registerRemote".equals(m.getName()) && m.getParameterCount() == 1) {
                        registerRemoteMethod = m;
                        break;
                    }
                }
                if (registerRemoteMethod != null) {
                    // Convert SkillDefinition to RemoteSkillRegistrationRequest format
                    List<Map<String, Object>> requests = new ArrayList<>();
                    for (SkillDefinition def : definitions) {
                        Map<String, Object> req = new HashMap<>();
                        req.put("id", def.getId());
                        req.put("name", def.getName());
                        req.put("description", def.getDescription());
                        req.put("version", def.getVersion());
                        req.put("author", def.getAuthor());
                        req.put("tier", def.getTier());
                        req.put("categories", def.getCategories());
                        req.put("enabled", def.isEnabled());
                        req.put("toolName", def.getToolName());
                        req.put("toolDescription", def.getToolDescription());
                        req.put("parameters", def.getParameters());
                        req.put("jsonSchema", def.getJsonSchema());
                        req.put("callbackUrl", def.getCallbackUrl());
                        req.put("serviceId", def.getServiceId());
                        requests.add(req);
                    }
                    // We can't directly call this because the parameter type is
                    // List<RemoteSkillRegistrationRequest>
                    // Fall back to Feign registration which works for both local and remote
                    log.debug(
                            "[AgentSDK] Local registration via SkillService would require type conversion, using Feign instead");
                    return false;
                }
            }
            return false;
        } catch (Exception e) {
            log.debug("[AgentSDK] Local registration not possible: {}", e.getMessage());
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Registration with retry and backoff
    // -------------------------------------------------------------------------

    private void registerWithRetry(final List<SkillDefinition> definitions) {
        final AtomicInteger attempt = new AtomicInteger(0);
        final int maxRetries = properties.getRegistrationRetryMax();

        Runnable registrationTask = new Runnable() {
            @Override
            public void run() {
                int currentAttempt = attempt.incrementAndGet();
                try {
                    doRegister(definitions);
                    registered = true;
                    log.info("[AgentSDK] Successfully registered {} skill tool(s) (attempt {})",
                            definitions.size(), currentAttempt);
                    startHeartbeat();
                } catch (Exception e) {
                    if (currentAttempt >= maxRetries) {
                        log.error("[AgentSDK] Failed to register skills after {} attempts: {}. " +
                                "Skills will NOT be available until agent service is reachable.",
                                maxRetries, e.getMessage());
                    } else {
                        // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
                        long delaySeconds = (long) Math.pow(2, currentAttempt - 1);
                        log.warn("[AgentSDK] Registration attempt {} failed: {}. Retrying in {}s...",
                                currentAttempt, e.getMessage(), delaySeconds);
                        scheduler.schedule(this, delaySeconds, TimeUnit.SECONDS);
                    }
                }
            }
        };

        // Start first attempt immediately
        scheduler.execute(registrationTask);
    }

    private void doRegister(List<SkillDefinition> definitions) {
        skillRegistrationClient.registerRemoteSkills(definitions);
    }

    // -------------------------------------------------------------------------
    // Heartbeat
    // -------------------------------------------------------------------------

    /**
     * Starts the heartbeat scheduler that periodically sends heartbeat to the agent
     * service.
     */
    private void startHeartbeat() {
        if (heartbeatFuture != null) {
            return; // Already started
        }

        int interval = properties.getHeartbeatInterval();
        if (interval <= 0) {
            interval = 30;
        }

        heartbeatFuture = scheduler.scheduleAtFixedRate(
                new Runnable() {
                    @Override
                    public void run() {
                        sendHeartbeat();
                    }
                },
                interval,
                interval,
                TimeUnit.SECONDS);

        log.info("[AgentSDK] Started heartbeat scheduler, interval={}s", interval);
    }

    private void sendHeartbeat() {
        if (registeredSkillIds.isEmpty()) {
            return;
        }

        try {
            HeartbeatRequest request = new HeartbeatRequest(resolveServiceId(), registeredSkillIds);
            skillRegistrationClient.heartbeat(request);
            log.debug("[AgentSDK] Heartbeat sent for {} skills", registeredSkillIds.size());
        } catch (Exception e) {
            log.warn("[AgentSDK] Heartbeat failed: {}", e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Graceful Shutdown
    // -------------------------------------------------------------------------

    @Override
    public void destroy() {
        log.info("[AgentSDK] Shutting down...");

        // Stop heartbeat
        if (heartbeatFuture != null) {
            heartbeatFuture.cancel(false);
            heartbeatFuture = null;
        }

        // Unregister from agent service
        if (registered && !registeredSkillIds.isEmpty()) {
            try {
                UnregisterRequest request = new UnregisterRequest(resolveServiceId());
                skillRegistrationClient.unregisterRemoteSkills(request);
                log.info("[AgentSDK] Unregistered {} skills from agent service", registeredSkillIds.size());
            } catch (Exception e) {
                log.warn("[AgentSDK] Failed to unregister skills during shutdown: {}", e.getMessage());
            }
        }

        // Note: scheduler shutdown is handled by Spring via destroyMethod="shutdown" on
        // the bean
    }

    // -------------------------------------------------------------------------
    // Dispatching (called by AgentSdkInvokeController)
    // -------------------------------------------------------------------------

    /**
     * Finds the adapter matching the given skill + tool and invokes it.
     *
     * @param req inbound invocation request from the agent service
     * @return String result
     */
    public String dispatch(SkillInvokeRequest req) {
        String key = req.getSkillId() + "::" + req.getToolName();
        AnnotatedSkillAdapter adapter = adapterRegistry.get(key);
        if (adapter == null) {
            throw new IllegalArgumentException(
                    "No @SkillTool registered for: " + key +
                            ". Available: " + adapterRegistry.keySet());
        }
        return adapter.invoke(req.getParams());
    }

    public boolean hasAdapter(String skillId, String toolName) {
        return adapterRegistry.containsKey(skillId + "::" + toolName);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Class<?> resolveTargetClass(Object bean) {
        // Unwrap CGLIB/JDK proxies
        Class<?> cls = bean.getClass();
        if (cls.getName().contains("$$")) {
            cls = cls.getSuperclass();
        }
        return cls;
    }

    private String resolveServiceId() {
        if (properties.getServiceId() != null && !properties.getServiceId().trim().isEmpty()) {
            return properties.getServiceId();
        }
        return environment.getProperty("spring.application.name", "unknown-service");
    }

    private String resolveCallbackUrl() {
        // Tier 1: Explicit callback-base-url (highest priority)
        if (properties.getCallbackBaseUrl() != null && !properties.getCallbackBaseUrl().trim().isEmpty()) {
            return properties.getCallbackBaseUrl() + "/api/v1/agent-sdk/invoke";
        }

        String port = environment.getProperty("server.port", "8080");
        String appName = environment.getProperty("spring.application.name");

        // Tier 2: Direct service name URL
        if (appName != null && !appName.trim().isEmpty()) {
            String callbackUrl = "http://" + appName + ":" + port + "/api/v1/agent-sdk/invoke";
            log.debug("[AgentSDK] Using direct service callback URL: {}", callbackUrl);
            return callbackUrl;
        }

        // Tier 3: Fallback to localhost (not recommended for distributed environments)
        log.warn("[AgentSDK] spring.application.name not configured, falling back to localhost callback URL. " +
                "This may not work in distributed/containerized environments. " +
                "Consider setting 'agent.sdk.callback-base-url' property.");
        return "http://localhost:" + port + "/api/v1/agent-sdk/invoke";
    }
}
