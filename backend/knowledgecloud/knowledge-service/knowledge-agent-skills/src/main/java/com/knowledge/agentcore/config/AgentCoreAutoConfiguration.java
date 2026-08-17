package com.knowledge.agentcore.config;

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
 * AgentCore wiring — executors only. Components (stores, log, gateway, loop,
 * supervisor, controller) are annotation-scanned beans under
 * {@code com.knowledge.agentcore.*}.
 */
@Configuration
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
