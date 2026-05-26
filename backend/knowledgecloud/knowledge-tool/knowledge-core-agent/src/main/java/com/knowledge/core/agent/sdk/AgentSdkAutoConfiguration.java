package com.knowledge.core.agent.sdk;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

/**
 * Spring Boot auto-configuration for the Agent SDK.
 *
 * <p>
 * Activated automatically when {@code knowledge-core-agent} is on the classpath
 * and {@code agent.sdk.enabled=true} (the default).
 *
 * <p>
 * Registers:
 * <ul>
 * <li>{@link AgentSdkProperties} — config binding</li>
 * <li>{@link AgentSkillRegistrar} — scans {@code @AgentSkill} beans and
 * registers with agent service via Feign client</li>
 * <li>{@link AgentSdkInvokeController} — REST endpoint that receives tool
 * invocation callbacks</li>
 * </ul>
 */
@Configuration
@ConditionalOnProperty(prefix = "agent.sdk", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(AgentSdkProperties.class)
@EnableFeignClients(clients = ISkillRegistrationClient.class)
public class AgentSdkAutoConfiguration {

    /**
     * Scheduled executor for heartbeat and retry operations.
     * Single-threaded to minimize resource usage.
     */
    @Bean(name = "agentSdkScheduler", destroyMethod = "shutdown")
    @ConditionalOnMissingBean(name = "agentSdkScheduler")
    public ScheduledExecutorService agentSdkScheduler() {
        return Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "agent-sdk-scheduler");
            thread.setDaemon(true);
            return thread;
        });
    }

    @Bean
    @ConditionalOnMissingBean
    public AgentSkillRegistrar agentSkillRegistrar(AgentSdkProperties properties,
            ISkillRegistrationClient skillRegistrationClient,
            Environment environment,
            ScheduledExecutorService agentSdkScheduler) {
        return new AgentSkillRegistrar(properties, skillRegistrationClient, environment, agentSdkScheduler);
    }

    @Bean
    @ConditionalOnMissingBean
    public AgentSdkInvokeController agentSdkInvokeController(AgentSkillRegistrar registrar) {
        return new AgentSdkInvokeController(registrar);
    }
}
