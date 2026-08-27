package com.knowledge.wiki.service.doc;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

class PageDocXssExclusionTest {

    private static final String BODY = "{\"mermaid\":\"A->>B\\nB-->>A\\nA --> B\\nAnimal <|-- Dog\","
            + "\"code\":\"value => value > 0\",\"literal\":\"&gt;\"}";

    @Test
    void structuredDocumentWritesBypassHtmlMutation() throws Exception {
        KnowledgeRequestFilter filter = filterFromApplicationYaml();

        assertPreserved(filter, "/page/42/ops");
        assertPreserved(filter, "/page/42/reconcile");
    }

    @Test
    void unrelatedPageWritesStillUseTheXssWrapper() throws Exception {
        KnowledgeRequestFilter filter = filterFromApplicationYaml();
        ServletRequest downstream = filter(filter, "/page/42/session/claim", BODY);

        assertInstanceOf(XssHttpServletRequestWrapper.class, downstream);
    }

    private static void assertPreserved(KnowledgeRequestFilter filter, String path) throws Exception {
        ServletRequest downstream = filter(filter, path, BODY);

        assertInstanceOf(KnowledgeHttpServletRequestWrapper.class, downstream);
        assertTrue(!(downstream instanceof XssHttpServletRequestWrapper));
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
