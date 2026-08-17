package com.knowledge.agentcore.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
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
 * <p>The runtime lives in {@code com.knowledge.agentcore} — OUTSIDE the app's
 * component-scan base package ({@code com.knowledge.agent}, the main class
 * package). The class is registered via
 * {@code META-INF/spring.factories} and declares the scan for its own package
 * tree here, so stores / event log / gateway / loop / supervisor / controllers
 * are all registered without touching the application class.
 *
 * <p>{@code com.knowledge.core.secure} is scanned as a fallback too:
 * knowledge-core-secure registers {@code JwtTokenProvider} as a @Component
 * ({@code com.knowledge.core.secure.provider}) but some framework jar versions
 * ship without the matching scan, which fails the boot with "required a bean
 * of type JwtTokenProvider". {@code spring.main.allow-bean-definition-overriding}
 * is enabled by the platform launcher, so duplicates are harmless.
 */
@Configuration
@ComponentScan(basePackages = { "com.knowledge.agentcore", "com.knowledge.core.secure" })
@EnableConfigurationProperties(AgentCoreProperties.class)
public class AgentCoreAutoConfiguration {

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
