package com.knowledge.agent.core.config;

import com.knowledge.core.tool.request.RequestProperties;
import com.knowledge.core.tool.request.XssProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;

import java.util.Arrays;
import java.util.List;

/**
 * Startup self-check: the platform's global XSS body wrapper must not touch the
 * agent API.
 *
 * <p>{@code KnowledgeRequestFilter} (knowledge-core-tool, registered on
 * {@code /*}) runs every raw request body through the HTML filter unless the
 * servlet path matches {@code knowledge.xss.skip-url}. Agent bodies are
 * structured JSON whose string values are arbitrary data, and the filter
 * re-serializes allowed tags with quoted attributes: {@code <a href={url}>}
 * becomes {@code <a href="{url}">}, which injects raw double quotes into the
 * JSON string. Jackson then reports "Unexpected character ('{' (code 123)): was
 * expecting comma to separate Object entries" while parsing
 * {@code toolResults[i].result}, so every resume carrying real tool output
 * (page HTML, JSX, markdown) fails with 400 — long after a naive smoke test.
 *
 * <p>{@code application.yml} carries the skip, but the effective value is
 * whatever property source wins: a Nacos / shared config that defines
 * {@code knowledge.xss.skip-url} <em>replaces</em> the list (lists are not
 * merged), and a container image or long-running instance started before the
 * skip was added keeps the old value. Both failures are invisible until the
 * first resume, so surface them at startup.
 *
 * <p>Read-only: this only reports; it registers and overrides nothing.
 */
@Slf4j
@Component
public class AgentXssSkipCheck {

    /** The contract the module relies on (the filter matches getServletPath()). */
    private static final String AGENT_SKIP = "/api/agent/**";

    /** Representative agent paths the skip pattern has to cover. */
    private static final List<String> AGENT_PATHS = Arrays.asList(
            "/api/agent/v1/runs",
            "/api/agent/v1/runs/1/resume",
            "/api/agent/v1/threads/t/messages");

    private final ObjectProvider<XssProperties> xssProperties;
    private final ObjectProvider<RequestProperties> requestProperties;

    public AgentXssSkipCheck(ObjectProvider<XssProperties> xssProperties,
                             ObjectProvider<RequestProperties> requestProperties) {
        this.xssProperties = xssProperties;
        this.requestProperties = requestProperties;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void checkAgentBodiesSkipXss() {
        try {
            RequestProperties request = requestProperties.getIfAvailable();
            if (request != null && !Boolean.TRUE.equals(request.getEnabled())) {
                // knowledge.request.enabled=false: nothing wraps the body.
                return;
            }
            XssProperties xss = xssProperties.getIfAvailable();
            if (xss == null) {
                log.info("Platform XssProperties not on the classpath; cannot verify that the XSS body wrapper "
                        + "skips {}", AGENT_SKIP);
                return;
            }
            if (!Boolean.TRUE.equals(xss.getEnabled())) {
                // XSS disabled: bodies only pass the (structure-preserving) request wrapper.
                return;
            }
            List<String> skip = xss.getSkipUrl();
            AntPathMatcher matcher = new AntPathMatcher();
            boolean covered = skip != null
                    && AGENT_PATHS.stream().allMatch(path -> skip.stream().anyMatch(p -> matcher.match(p, path)));
            if (covered) {
                log.info("XSS body wrapper skipped for {} (knowledge.xss.skip-url={})", AGENT_SKIP, skip);
                return;
            }
            log.error("Agent bodies are NOT skipped by the XSS wrapper: POST /api/agent/v1/runs/*/resume will be "
                            + "rejected with 400 'JSON parse error: Unexpected character ... was expecting comma to "
                            + "separate Object entries' as soon as a tool result carries HTML/JSX. Effective "
                            + "knowledge.xss.skip-url={} must contain {}. Note that a list defined in Nacos/shared "
                            + "config REPLACES this module's application.yml value, and an instance started before "
                            + "the skip existed keeps the old value.",
                    skip, AGENT_SKIP);
        } catch (RuntimeException ex) {
            log.warn("Could not verify that the XSS body wrapper skips {}: {}", AGENT_SKIP, ex.toString());
        }
    }
}
