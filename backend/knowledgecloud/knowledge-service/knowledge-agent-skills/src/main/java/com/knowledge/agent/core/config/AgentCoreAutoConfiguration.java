package com.knowledge.agent.core.config;

import com.knowledge.core.secure.provider.JwtTokenProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AgentCore wiring.
 *
 * <p>The runtime lives in {@code com.knowledge.agent.core} — INSIDE the agent
 * module's conventional package tree ({@code com.knowledge.agent}, the app's
 * component-scan base), so every runtime bean (stores / event log / gateway /
 * loop / supervisor / controllers) is registered by the application's own
 * component scan. No spring.factories, no extra @ComponentScan.
 */
@Configuration
@EnableConfigurationProperties(AgentCoreProperties.class)
public class AgentCoreAutoConfiguration {

    /**
     * Fallback registration for {@code JwtTokenProvider}: the agent module
     * never scans or modifies the platform's security packages, but the bean
     * must exist for the security stack to boot. If the framework already
     * provides it, this fallback stays inactive.
     */
    @Bean
    @ConditionalOnMissingBean(JwtTokenProvider.class)
    public JwtTokenProvider jwtTokenProvider() {
        return new JwtTokenProvider();
    }

    /** One thread per running loop (loops block on LLM streams and resumes). */
    @Bean(name = "agentLoopExecutor", destroyMethod = "shutdown")
    public ExecutorService agentLoopExecutor() {
        return new ThreadPoolExecutor(4, 32, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(256),
                daemonThreadFactory("agentcore-loop"),
                new ThreadPoolExecutor.AbortPolicy());
    }

    /** Backend tool execution (parallel within a step, bounded by quota). */
    @Bean(name = "agentToolExecutor", destroyMethod = "shutdown")
    public ExecutorService agentToolExecutor() {
        return new ThreadPoolExecutor(4, 16, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(512),
                daemonThreadFactory("agentcore-tool"),
                new ThreadPoolExecutor.AbortPolicy());
    }

    private ThreadFactory daemonThreadFactory(String prefix) {
        AtomicInteger counter = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + "-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }
}
