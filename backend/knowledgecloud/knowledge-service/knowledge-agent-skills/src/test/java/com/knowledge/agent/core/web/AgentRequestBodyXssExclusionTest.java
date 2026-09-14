package com.knowledge.agent.core.web;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.io.IOException;
import java.util.List;

import javax.servlet.ServletException;
import javax.servlet.ServletRequest;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.util.StreamUtils;

import com.knowledge.core.tool.request.KnowledgeHttpServletRequestWrapper;
import com.knowledge.core.tool.request.KnowledgeRequestFilter;
import com.knowledge.core.tool.request.RequestProperties;
import com.knowledge.core.tool.request.XssHttpServletRequestWrapper;
import com.knowledge.core.tool.request.XssProperties;

/**
 * Agent run bodies must reach Jackson byte-for-byte.
 *
 * <p>The platform's global {@link KnowledgeRequestFilter} wraps every request
 * and, unless the path is skipped, runs the raw body through an HTML/XSS
 * filter. Agent payloads are structured JSON whose values are arbitrary data —
 * user prompts, markdown, and tool results containing fetched source code or
 * HTML — and the HTML filter rewrites characters such as {@code <}, {@code >},
 * {@code &} and unbalanced quotes inside them. Once a payload is large enough
 * the rewrite breaks the JSON structure and {@code POST /runs/{id}/resume}
 * fails with "Unexpected character ... was expecting comma to separate Object
 * entries" while parsing {@code toolResults[i].result}.
 *
 * <p>Regression guard for {@code knowledge.xss.skip-url: /api/agent/**}, the
 * same remedy knowledge-wiki uses for its structured document endpoints.
 */
class AgentRequestBodyXssExclusionTest {

    /**
     * Escaped newlines only: the (skipped) wrapper normalizes line breaks, and
     * a client-serialized body never carries raw ones.
     */
    private static final String BODY = "{\"action\":\"tool_results\",\"afterSeq\":42,\"toolResults\":["
            + "{\"callId\":\"c1\",\"ok\":true,\"result\":{\"text\":\"<div class=\\\"a\\\">x, y</div>\"}},"
            + "{\"callId\":\"c2\",\"ok\":true,\"result\":{\"text\":\"Animal <|-- Dog\\nvalue => value > 0 & more\"}}"
            + "]}";

    @Test
    void agentBodiesBypassHtmlMutation() throws Exception {
        KnowledgeRequestFilter filter = filterFromApplicationYaml();

        assertPreserved(filter, "/api/agent/v1/runs/123/resume");
        assertPreserved(filter, "/api/agent/v1/runs");
        assertPreserved(filter, "/api/agent/v1/threads/abc/messages");
    }

    @Test
    void unrelatedPathsStillUseTheXssWrapper() throws Exception {
        KnowledgeRequestFilter filter = filterFromApplicationYaml();
        ServletRequest downstream = filter(filter, "/api/v1/skills/invoke", BODY);

        assertInstanceOf(XssHttpServletRequestWrapper.class, downstream);
    }

    private static void assertPreserved(KnowledgeRequestFilter filter, String path) throws Exception {
        ServletRequest downstream = filter(filter, path, BODY);

        assertInstanceOf(KnowledgeHttpServletRequestWrapper.class, downstream);
        assertFalse(downstream instanceof XssHttpServletRequestWrapper);
        assertEquals(BODY, StreamUtils.copyToString(downstream.getInputStream(), UTF_8));
    }

    private static ServletRequest filter(KnowledgeRequestFilter filter, String path, String body)
            throws IOException, ServletException {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setServletPath(path);
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(body.getBytes(UTF_8));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, new MockHttpServletResponse(), chain);
        return chain.getRequest();
    }

    private static KnowledgeRequestFilter filterFromApplicationYaml() throws IOException {
        YamlPropertySourceLoader loader = new YamlPropertySourceLoader();
        List<PropertySource<?>> sources = loader.load("application.yml", new ClassPathResource("application.yml"));
        MutablePropertySources propertySources = new MutablePropertySources();
        sources.forEach(propertySources::addLast);

        XssProperties xss = new Binder(ConfigurationPropertySources.from(propertySources))
                .bind("knowledge.xss", Bindable.of(XssProperties.class))
                .orElseGet(XssProperties::new);
        return new KnowledgeRequestFilter(new RequestProperties(), xss);
    }
}
