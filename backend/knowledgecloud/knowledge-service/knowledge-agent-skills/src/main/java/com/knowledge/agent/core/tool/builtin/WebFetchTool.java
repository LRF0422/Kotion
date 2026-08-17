package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Web fetch tool — extracts readable text from a URL (jsoup).
 */
@Slf4j
@Component
public class WebFetchTool implements BackendTool {

    private final AgentCoreProperties properties;

    public WebFetchTool(AgentCoreProperties properties) {
        this.properties = properties;
    }

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("url", Schemas.str("要抓取的页面 URL。"));
        return ToolSpec.of("web_fetch",
                "抓取网页并提取正文文本（用于阅读外部资料）。",
                Schemas.object(props, "url"), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        String url = args.get("url") == null ? "" : String.valueOf(args.get("url"));
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            throw new IllegalArgumentException("url 必须以 http(s):// 开头");
        }
        AgentCoreProperties.Skill.WebFetch config = properties.getSkill().getWebFetch();
        try {
            Document document = Jsoup.connect(url)
                    .timeout(config.getTimeoutSeconds() * 1000)
                    .userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) KotionEditorAgent/1.0")
                    .get();
            String title = document.title();
            String text = document.body() != null ? document.body().text() : "";
            if (text.length() > config.getMaxContentLength()) {
                text = text.substring(0, config.getMaxContentLength()) + "...[truncated]";
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("url", url);
            result.put("title", title);
            result.put("content", text);
            result.put("length", text.length());
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("抓取失败: " + e.getMessage(), e);
        }
    }
}
