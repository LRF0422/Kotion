package com.knowledge.agent.core.config;

import com.knowledge.core.secure.provider.JwtTokenProvider;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.SynchronousQueue;
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
 *
 * <p>This configuration also declares the module's own {@code @MapperScan}:
 * the platform's global scan lives in a framework auto-configuration whose
 * registration file is missing from the repository source snapshot, so the
 * agent module registers its mappers itself. When the platform also registers
 * them, the launcher's bean-definition-overriding makes the duplicate harmless.
 */
@Configuration
@MapperScan("com.knowledge.agent.core.mapper")
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

    /**
     * One thread per running ROOT loop. Uses a SynchronousQueue so the pool
     * actually grows to max instead of queueing work while all core threads are
     * blocked; overflow is rejected and handled by the supervisor as a failed
     * run rather than queueing behind a blocked parent.
     */
    @Bean(name = "agentLoopExecutor", destroyMethod = "shutdown")
    public ExecutorService agentLoopExecutor() {
        return new ThreadPoolExecutor(8, 64, 60L, TimeUnit.SECONDS,
                new SynchronousQueue<>(),
                daemonThreadFactory("agentcore-loop"),
                new ThreadPoolExecutor.AbortPolicy());
    }

    /**
     * Child (sub-agent) loops run on their own pool. A parent thread blocks in
     * {@code delegationWait}; if children shared the parent pool they would
     * queue behind blocked parents and never run (deadlock). Separating them
     * makes delegation deadlock-free regardless of parent concurrency.
     */
    @Bean(name = "agentChildLoopExecutor", destroyMethod = "shutdown")
    public ExecutorService agentChildLoopExecutor() {
        return new ThreadPoolExecutor(8, 128, 60L, TimeUnit.SECONDS,
                new SynchronousQueue<>(),
                daemonThreadFactory("agentcore-child-loop"),
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
